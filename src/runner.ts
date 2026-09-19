/**
 * 执行器：手动/定时共用的真实会话执行链（对齐 dsh-task-board 语义）。
 *
 *   agentLoop.create(sessionId, {}, meta{cwd})
 *     → agentPresets.select(agent, presetId)            （钉住失败即不发送）
 *     → /permission <preset> 命令                        （权限档）
 *     → sessionTitle.rename                              （会话卡片可识别）
 *     → agent.followup(createUserMessage(prompt))        （queue 模式发任务 Prompt）
 *     → 监听该会话 session/event 的 turn/end 结算（reason.kind → 状态）
 *     → 结果落盘 → 推送简讯 → 账本回写（有界历史 + 结果保留裁剪）
 *
 * 任务不并发：同任务运行中直接拒绝（调度器负责跳过并滚动）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { Execution, TaskRow } from './contract.js';
import { gateDecision, isConfirmed, needsConfirm } from './gatekeeper.js';
import { LedgerStore } from './ledger.js';
import type { ResultStore } from './results.js';
import type { DshImLike, Pusher } from './pusher.js';
import type { CronBoardConfig } from './config.js';
import { errDetail, newExecId, newSessionId } from './util.js';

/* ── 宿主服务鸭子类型（可选依赖全部 ctx.get + 结构类型，不做硬类型耦合） ── */

interface AgentLike {
  id: string;
  session: { id: string };
  followup(message: unknown): void;
  cancel(cause?: unknown, options?: unknown): void;
}

interface AgentLoopLike {
  create(id: string, options?: Record<string, unknown>, meta?: Record<string, unknown>): Promise<AgentLike>;
}

interface AgentPresetsLike {
  select(agent: AgentLike, presetId: string): Promise<unknown>;
  list?(): Promise<{ id?: string; title?: string }[]>;
}

interface CommandsLike {
  execute(agent: AgentLike, line: string, attachments: unknown[], signal?: AbortSignal): Promise<unknown>;
}

interface SessionTitleLike {
  rename(session: { id: string }, title: string): unknown;
}

interface WorkspaceRegistryLike {
  get(id: string): { path?: string } | undefined;
  list?(): { id?: string; title?: string; path?: string }[];
}

interface SessionEventLike {
  type: string;
  data?: unknown;
}

export interface RunnerLogger {
  info(m: string): void;
  warn(m: string): void;
  error(m: string): void;
}

interface RunningEntry {
  exec: Execution;
  cancel: () => void;
}

export class TaskRunner {
  private running = new Map<string, RunningEntry>();

  constructor(
    private readonly ctx: Context,
    private readonly ledger: LedgerStore,
    private readonly results: ResultStore,
    private readonly pusher: Pusher,
    private readonly config: CronBoardConfig,
    private readonly log: RunnerLogger,
  ) {}

  /** 当前部署已接入的 dshIm（每次现取，支持 dsh-im 后装热生效）。 */
  private dshIm(): DshImLike | undefined {
    return this.ctx.get('dshIm') as unknown as DshImLike | undefined;
  }

  isRunning(taskId: string): boolean {
    return this.running.has(taskId);
  }

  /** 插件停机：取消全部在途执行（agent cancel → 会话按 aborted 结算）。 */
  cancelAll(): void {
    for (const [taskId, entry] of this.running) {
      try {
        entry.cancel();
      } catch (err) {
        this.log.warn(`[cron-board] 取消在途执行失败（task=${taskId}）: ${errDetail(err)}`);
      }
    }
  }

  runningTaskIds(): string[] {
    return [...this.running.keys()];
  }

  /** 快速启动：创建执行行并进入后台执行链；返回执行行（UI 立即可见 running）。 */
  async launch(task: TaskRow, trigger: Execution['trigger']): Promise<Execution> {
    if (this.running.has(task.id)) throw Object.assign(new Error('task-already-running'), { code: 'task-running' });
    const exec: Execution = {
      id: newExecId(),
      trigger,
      sessionId: newSessionId(),
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    await this.ledger.mutate((doc) => {
      const t = doc.tasks.find((x) => x.id === task.id);
      if (!t) throw Object.assign(new Error('task-not-found'), { code: 'not-found' });
      t.updatedAt = new Date().toISOString();
      LedgerStore.pushExecution(t, exec, this.config.executionsKeepPerTask);
    });
    const entry: RunningEntry = { exec, cancel: () => {} };
    this.running.set(task.id, entry);
    // 后台执行链：任何异常都收敛到 finalize，绝不外泄阻塞宿主
    void this.drive(task, exec, entry).catch((err) => {
      this.log.error(`[cron-board] 执行链异常（task=${task.id} exec=${exec.id}）: ${errDetail(err)}`);
    });
    return exec;
  }

  private async drive(task: TaskRow, exec: Execution, entry: RunningEntry): Promise<void> {
    const startedAt = Date.now();
    let agent: AgentLike | undefined;
    let exitReason = 'unknown';
    let finalText = '';
    let status: Execution['status'] = 'failed';
    try {
      // 门控复核（防绕过 RPC 直调）：待确认即终止
      if (gateDecision(task, this.config.defaultPermission) === 'awaiting-confirmation') {
        exitReason = 'awaiting-confirmation';
        this.log.warn(`[cron-board] 任务 ${task.id} 待确认，拒绝执行`);
        return;
      }

      // 1. 新建会话 + 运行中 agent
      const loop = this.ctx.get('agentLoop') as unknown as AgentLoopLike | undefined;
      if (!loop?.create) throw new Error('agentLoop 服务不可用');
      const wsPath = this.resolveWorkspacePath(task);
      agent = await loop.create(exec.sessionId, {}, wsPath ? { cwd: wsPath } : {});
      entry.cancel = () => {
        try {
          agent?.cancel('cron-board-stop');
        } catch {
          /* ignore */
        }
      };

      // 2. 钉住预设（失败即不发送）
      const presetId = task.pinned.presetId;
      if (presetId) {
        const presets = this.ctx.get('agentPresets') as unknown as AgentPresetsLike | undefined;
        if (!presets?.select) throw new Error(`agentPresets 服务不可用（钉住 ${presetId} 失败）`);
        try {
          await presets.select(agent, presetId);
        } catch (err) {
          throw new Error(`钉住预设 ${presetId} 失败: ${errDetail(err)}`);
        }
      }

      // 3. 钉住权限档（命令化应用，与宿主 /permission 同一条路径）
      const permission = task.pinned.permission;
      if (permission) {
        const commands = this.ctx.get('commands') as unknown as CommandsLike | undefined;
        if (!commands?.execute) throw new Error('commands 服务不可用（权限档应用失败）');
        const res = await commands.execute(agent, `/permission ${permission}`, []);
        const feedback = (res as { feedback?: { kind?: string }; kind?: string } | null | undefined);
        const kind = feedback?.feedback?.kind ?? feedback?.kind;
        if (kind === 'error') throw new Error(`权限档 ${permission} 应用被拒绝`);
      }

      // 4. 会话重命名（非致命）
      try {
        const st = this.ctx.get('sessionTitle') as unknown as SessionTitleLike | undefined;
        st?.rename?.(agent.session, `${task.title} · cron`);
      } catch {
        /* ignore */
      }

      // 5. 结算监听（turn/end 权威）+ 队列式发送任务 Prompt
      let settled = false;
      let wake: () => void = () => {};
      const settledPromise = new Promise<void>((resolve) => {
        wake = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
      });
      const off = this.ctx.on('session/event', (session: { id?: string }, event: SessionEventLike) => {
        if (!session || session.id !== exec.sessionId) return;
        if (event.type === 'assistant/message') {
          const text = extractAssistantText(event.data);
          if (text !== '') finalText = text;
        } else if (event.type === 'turn/end') {
          exitReason = extractEndReason(event.data);
          wake();
        }
      });
      try {
        agent.followup(createUserMessage({ content: [{ type: 'text', text: task.prompt }], source: { kind: 'user' } }));
      } catch (err) {
        off();
        throw new Error(`任务 Prompt 发送失败: ${errDetail(err)}`);
      }

      // 6. 等待终态（超时 cancel 兜底）
      const timeoutMs = Math.max(1, this.config.runTimeoutMin) * 60_000;
      const timer = setTimeout(() => {
        exitReason = 'timeout';
        wake();
      }, timeoutMs);
      try {
        await settledPromise;
      } finally {
        clearTimeout(timer);
        off();
      }

      if (exitReason === 'timeout') {
        status = 'timeout';
        try {
          agent?.cancel('cron-board-timeout');
        } catch {
          /* ignore */
        }
      } else if (exitReason === 'completed' || exitReason === 'unknown') {
        status = 'success';
      } else {
        status = 'failed';
      }
      if (finalText === '') finalText = status === 'success' ? '（会话已结束，无文本输出）' : '（失败：无文本输出）';
    } catch (err) {
      status = 'failed';
      exitReason = `pin-failed: ${errDetail(err)}`;
      this.log.error(`[cron-board] 任务执行失败（task=${task.id}）: ${errDetail(err)}`);
      try {
        agent?.cancel('cron-board-pin-failed');
      } catch {
        /* ignore */
      }
    }

    await this.finalize(task, exec, {
      status,
      exitReason,
      finalText,
      durationMs: Date.now() - startedAt,
    });
    this.running.delete(task.id);
  }

  private async finalize(
    task: TaskRow,
    exec: Execution,
    outcome: { status: Execution['status']; exitReason: string; finalText: string; durationMs: number },
  ): Promise<void> {
    exec.status = outcome.status;
    exec.exitReason = outcome.exitReason;
    exec.durationMs = outcome.durationMs;
    exec.endedAt = new Date().toISOString();
    exec.summary = `${outcome.status} · ${outcome.exitReason}`;

    // 结果落盘 + 保留裁剪
    let resultPath: string | undefined;
    try {
      resultPath = await this.results.write(task, exec, outcome.finalText);
      exec.resultPath = resultPath;
    } catch (err) {
      this.log.warn(`[cron-board] 结果落盘失败: ${errDetail(err)}`);
    }

    // 推送（成功/失败都推简讯；无目标 = disabled；失败不阻塞结算，可看板补推）
    const defaultPush = this.ledger.snapshot.settings?.defaultPush ?? null;
    const target = task.push ?? defaultPush;
    if (!target || !target.botId || !target.targetId) {
      exec.push = { state: 'disabled', attempts: 0 };
    } else {
      exec.push = await this.pusher.send(
        target.botId,
        target.targetId,
        this.pusher.briefFor({
          ok: outcome.status === 'success',
          title: task.title,
          status: outcome.status,
          durationMs: outcome.durationMs,
          resultPath,
          reason: outcome.exitReason,
        }),
      );
    }

    await this.ledger.mutate((doc) => {
      const t = doc.tasks.find((x) => x.id === task.id);
      if (!t) return;
      const row = t.executions.find((e) => e.id === exec.id);
      if (!row) return;
      Object.assign(row, exec);
      t.updatedAt = new Date().toISOString();
    });
    await this.results.prune(task.id, this.config.resultsKeepPerTask, exec.id).catch(() => {});
    this.log.info(
      `[cron-board] 任务《${task.title}》结算: ${outcome.status}（${outcome.exitReason}），push=${exec.push?.state ?? 'none'}`,
    );
  }

  private resolveWorkspacePath(task: TaskRow): string | undefined {
    const wsId = task.pinned.workspaceId;
    if (!wsId) return undefined;
    try {
      const reg = this.ctx.get('workspaceRegistry') as unknown as WorkspaceRegistryLike | undefined;
      return reg?.get?.(wsId)?.path;
    } catch {
      return undefined;
    }
  }

  /** 看板手动补推：对既有执行行重发简讯（带退避重试）。 */
  async retryPush(taskId: string, execId: string): Promise<{ ok: boolean; error?: string }> {
    const snap = this.ledger.snapshot;
    const task = snap.tasks.find((t) => t.id === taskId);
    const exec = task?.executions.find((e) => e.id === execId);
    if (!task || !exec) return { ok: false, error: 'not-found' };
    const defaultPush = snap.settings?.defaultPush ?? null;
    const target = task.push ?? defaultPush;
    if (!target || !target.botId || !target.targetId) return { ok: false, error: 'no-push-target' };
    const ok = exec.status === 'success';
    const push = await this.pusher.send(
      target.botId,
      target.targetId,
      this.pusher.briefFor({
        ok,
        title: task.title,
        status: exec.status,
        durationMs: exec.durationMs,
        resultPath: exec.resultPath,
        reason: exec.exitReason,
      }),
    );
    await this.ledger.mutate((doc) => {
      const t = doc.tasks.find((x) => x.id === taskId);
      const row = t?.executions.find((e) => e.id === execId);
      if (row) row.push = push;
    });
    return { ok: push.state === 'sent', error: push.lastError };
  }

  /** 推送测试：向任务目标（或全局默认）发一条测试消息并记录 lastPushTest。 */
  async pushTest(taskId: string): Promise<{ ok: boolean; error?: string; channel?: 'service' | 'http' }> {
    const snap = this.ledger.snapshot;
    const task = snap.tasks.find((t) => t.id === taskId);
    const target = task?.push ?? snap.settings?.defaultPush ?? null;
    if (!target || !target.botId || !target.targetId) return { ok: false, error: 'no-push-target' };
    const dshIm = this.dshIm();
    const channel = dshIm?.send ? ('service' as const) : ('http' as const);
    const r = await this.pusher.send(
      target.botId,
      target.targetId,
      `dsh-cron-board 推送测试成功。\n任务：《${task?.title ?? taskId}》\n通道：${channel}`,
    );
    const record = { ok: r.state === 'sent', error: r.lastError, at: new Date().toISOString(), channel: r.channel };
    await this.ledger.mutate((doc) => {
      const t = doc.tasks.find((x) => x.id === taskId);
      if (t) t.lastPushTest = record;
    });
    return { ok: record.ok, error: record.error, channel: r.channel };
  }
}

function extractAssistantText(data: unknown): string {
  const msg = (data as { message?: { content?: unknown } } | undefined)?.message;
  const content = msg?.content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim() !== '') parts.push(text);
    }
  }
  return parts.join('\n');
}

function extractEndReason(data: unknown): string {
  const kind = (data as { reason?: { kind?: unknown } } | undefined)?.reason?.kind;
  return typeof kind === 'string' ? kind : 'unknown';
}

/** 供 rpc/meta 使用的只读探测（避免 rpc 反向依赖 runner 内部）。 */
export function gateSnapshot(task: TaskRow, defaultPermission: RunnerHostConfig): { needsConfirm: boolean; confirmed: boolean } {
  return {
    needsConfirm: needsConfirm(task, defaultPermission.defaultPermission),
    confirmed: isConfirmed(task),
  };
}

interface RunnerHostConfig {
  defaultPermission: CronBoardConfig['defaultPermission'];
}

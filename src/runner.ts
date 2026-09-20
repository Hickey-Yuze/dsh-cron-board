/**
 * 执行器：手动/定时共用的真实会话执行链（对齐 dsh-task-board 语义）。
 *
 *   agentLoop.create(sessionId, {}, meta{cwd})
 *     → agentPresets.select(agent, presetId)            （钉住失败即不发送）
 *     → /permission <preset> 命令                        （权限档）
 *     → sessionTitle.rename                              （会话卡片可识别）
 *     → agent.followup(createUserMessage(prompt))        （队列式发任务 Prompt）
 *     → 监听该会话 session/event 的 turn/end 结算（reason.kind → 状态）
 *     → 结果落盘 → 推送简讯 → 账本回写（有界历史 + 结果保留裁剪）
 *
 * 任务不并发：同任务运行中直接拒绝（调度器负责跳过并滚动）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import type * as dshLlm from '@deepseek-ai/dsh-llm';
import { readFile } from 'node:fs/promises';
import type { CronBoardConfig } from './config.js';
import type { Execution, PermissionPreset, TaskRow } from './contract.js';
import { gateDecision, isConfirmed, needsConfirm } from './gatekeeper.js';
import { LedgerStore } from './ledger.js';
import type { DshImLike, Pusher } from './pusher.js';
import type { ResultStore } from './results.js';
import { errDetail, newExecId, newSessionId } from './util.js';

let dshLlmModule: typeof dshLlm | undefined;
/**
 * 惰性 require dsh-llm（ESM 包）：宿主启动期经 cordis loader 并发动态 import() 同一模块，
 * 顶层同步 require 会触发 ERR_REQUIRE_ESM_RACE_CONDITION（require(esm) 竞态）。
 * 延后到运行期（此时模块图已加载完毕，require 命中同一缓存实例）即可规避。
 */
function requireDshLlm(): typeof dshLlm {
  return (dshLlmModule ??= require('@deepseek-ai/dsh-llm') as typeof dshLlm);
}

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

/** 官方 AgentRegistry 门面（ctx.agents.create/resume，单对象契约，2026-09-19 asar 实证）。 */
interface AgentsRegistryLike {
  create(options: {
    sessionId: string;
    agentOptions?: { provider?: string; model?: string };
    meta?: Record<string, unknown>;
    seed?: unknown[];
    setup?: (agentCtx: unknown, agent: unknown) => unknown;
  }): Promise<{ agent?: AgentLike } | undefined>;
  /** 官方 resume（@16636001 宿主同款）：延续既有会话，失败抛错由调用方落回新建。 */
  resume?(options: {
    resumeSessionId: string;
    agentOptions?: { provider?: string; model?: string };
    setup?: (agentCtx: unknown, agent: unknown) => unknown;
  }): Promise<{ agent?: AgentLike } | undefined>;
}

interface AgentPresetsLike {
  select?(agent: AgentLike, presetId: string): Promise<unknown>;
  list?(): Promise<{ id?: string; title?: string }[]>;
  /** resolve(id?) → 缺省 id 解析为宿主默认预设（defaultId）。 */
  resolve?(presetId: string | undefined): Promise<{ id?: string } | undefined>;
  /** 在 agent 工厂 setup 阶段把 agent 挂到预设 standing mount（官方唯一支持调用点）。 */
  mount?(agentCtx: unknown, presetId: string | undefined): Promise<unknown>;
}

/** 宿主默认模型选择服务（agentOptions 的 provider/model 来源，goal 域同源）。 */
interface AgentDefaultModelLike {
  currentSelection?(): { provider?: string; model?: string } | undefined;
}

interface CommandsLike {
  execute(agent: AgentLike, line: string, attachments: unknown[], signal?: AbortSignal): Promise<unknown>;
}

interface SessionTitleLike {
  rename(session: { id: string }, title: string): unknown;
}

/** 会话在册检查（in-memory store）：重启对账与复用前的存活判断。 */
interface SessionsLike {
  get?(id: string): { id?: string } | undefined;
}

interface WorkspaceRegistryLike {
  get(id: string): { path?: string } | undefined;
  list?(): { id?: string; title?: string; path?: string }[];
  /** 官方姿势：按路径取或建工作区对象，attachSession 注册会话归属（侧栏分组依据）。 */
  create?(path: string): Promise<{ attachSession?(sessionId: string): Promise<unknown> } | undefined>;
}

interface SessionEventLike {
  type: string;
  data?: unknown;
}

/**
 * 组装实际下发的执行 Prompt：带执行提示的标签以「标签提示」段注入到任务 Prompt 之前
 * （原版 task-board issue #1521 语义：无提示标签只作展示，不改变 Prompt）。
 */
export function buildPromptWithTags(task: Pick<TaskRow, 'prompt' | 'tags'>): string {
  const prefixes = (task.tags ?? [])
    .filter((tag) => typeof tag.promptPrefix === 'string' && tag.promptPrefix.trim() !== '')
    .map((tag) => `【标签提示 · ${tag.name}】${tag.promptPrefix!.trim()}`);
  return prefixes.length > 0 ? `${prefixes.join('\n')}\n\n${task.prompt}` : task.prompt;
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

  private sessions(): SessionsLike | undefined {
    return this.ctx.get('sessions') as unknown as SessionsLike | undefined;
  }

  /**
   * 重启对账（原版 task-board「确定性恢复」语义）：
   * - 账本中 running 且会话仍在 in-memory 名册 → 转入观察模式继续结算；
   * - 会话不在册 / 无 sessionId → 取消（interrupted-by-restart），绝不重发。
   */
  async reconcileStartup(): Promise<void> {
    const running: Array<{ task: TaskRow; exec: Execution }> = [];
    for (const task of this.ledger.snapshot.tasks) {
      for (const exec of task.executions) {
        if (exec.status === 'running') running.push({ task, exec });
      }
    }
    if (running.length === 0) return;
    this.log.info(`[cron-board] 重启对账：发现 ${running.length} 条在途执行`);
    for (const { task, exec } of running) {
      const inRoster = exec.sessionId !== '' && this.sessions()?.get?.(exec.sessionId) !== undefined;
      if (!inRoster) {
        await this.finalize(task, exec, {
          status: 'canceled',
          exitReason: 'interrupted-by-restart',
          finalText: '（宿主重启，执行中断，未重发）',
          durationMs: 0,
        }).catch((err) => this.log.warn(`[cron-board] 对账取消失败（task=${task.id}）: ${errDetail(err)}`));
        continue;
      }
      const entry: RunningEntry = { exec, cancel: () => {} };
      this.running.set(task.id, entry);
      void this.observeExisting(task, exec, entry).catch((err) => {
        this.log.error(`[cron-board] 观察结算异常（task=${task.id} exec=${exec.id}）: ${errDetail(err)}`);
      });
    }
  }

  /** 观察模式：会话仍在跑（宿主进程内未中断），继续监听 turn/end 至终态。 */
  private async observeExisting(task: TaskRow, exec: Execution, entry: RunningEntry): Promise<void> {
    const startedAt = Date.now();
    let exitReason = 'unknown';
    let finalText = '';
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
    let status: Execution['status'];
    if (exitReason === 'timeout') status = 'timeout';
    else if (exitReason === 'completed' || exitReason === 'unknown') status = 'success';
    else status = 'failed';
    if (finalText === '') finalText = status === 'success' ? '（会话已结束，无文本输出）' : '（失败：无文本输出）';
    await this.finalize(task, exec, {
      status,
      exitReason,
      finalText,
      durationMs: Date.now() - startedAt,
    });
    this.running.delete(task.id);
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
    if (task.archived) throw Object.assign(new Error('task-archived'), { code: 'archived' });
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

      // 1. 组合 agent（官方 composeAgent 同款：meta.agentPreset + setup 内挂载 + 默认模型选择）
      const presets = this.ctx.get('agentPresets') as unknown as AgentPresetsLike | undefined;
      const defaultModel = this.ctx.get('agentDefaultModel') as unknown as AgentDefaultModelLike | undefined;
      const registry = this.ctx.get('agents') as unknown as AgentsRegistryLike | undefined;
      const loop = this.ctx.get('agentLoop') as unknown as AgentLoopLike | undefined;
      const wsPath = this.resolveWorkspacePath(task);

      // 预设解析：任务钉的 id 或宿主默认（resolve(undefined) → defaultId）
      let presetResolved: string | undefined;
      if (presets?.resolve) {
        try {
          const resolved = await presets.resolve(task.pinned.presetId || undefined);
          presetResolved = typeof resolved?.id === 'string' ? resolved.id : undefined;
        } catch (err) {
          if (task.pinned.presetId) throw new Error(`预设 ${task.pinned.presetId} 解析失败: ${errDetail(err)}`);
        }
      } else if (task.pinned.presetId) {
        presetResolved = task.pinned.presetId;
      }

      // 模型默认选择（与 goal 域同源：agentDefaultModel.currentSelection）
      const selection = defaultModel?.currentSelection?.();
      const agentOptions =
        selection?.provider && selection?.model
          ? { provider: selection.provider, model: selection.model }
          : {};

      const meta: Record<string, unknown> = {};
      if (wsPath) meta.cwd = wsPath;
      if (presetResolved) meta.agentPreset = presetResolved;
      meta.source = 'cron-board'; // 标记会话来源（闪电图标由宿主 IM 渠道自动添加，插件无法模拟）

      // 会话复用（开关默认开）：活跃会话在 in-memory 名册中才 resume，否则直接新建；resume 失败落回新建
      const reuseWanted = task.reuseSession !== false && task.activeSessionId;
      const sessionsSvc = this.sessions();
      const inRoster =
        reuseWanted && task.activeSessionId
          ? sessionsSvc?.get?.(task.activeSessionId) !== undefined
          : false;
      this.log.info(`[cron-board] 会话复用检查：task=${task.id} reuseWanted=${reuseWanted} activeSessionId=${task.activeSessionId ?? 'none'} inRoster=${inRoster} sessionsSvc=${!!sessionsSvc}`);
      if (reuseWanted && inRoster && registry?.resume && task.activeSessionId) {
        try {
          const handle = await registry.resume({
            resumeSessionId: task.activeSessionId,
            agentOptions,
            setup: async (agentCtx: unknown) => {
              await presets?.mount?.(agentCtx, presetResolved);
            },
          });
          agent = handle?.agent ?? undefined;
          if (agent) {
            exec.sessionId = task.activeSessionId; // 结算/落盘对齐延续的会话
            this.log.info(`[cron-board] 延续会话 ${task.activeSessionId}（task=${task.id}）`);
          }
        } catch (err) {
          this.log.warn(`[cron-board] 延续会话失败，改为新建（task=${task.id}）: ${errDetail(err)}`);
          agent = undefined;
          exec.sessionId = newSessionId();
        }
      }

      if (!agent) {
        if (registry?.create) {
          const handle = await registry.create({
            sessionId: exec.sessionId,
            agentOptions,
            ...(Object.keys(meta).length > 0 ? { meta } : {}),
            setup: async (agentCtx: unknown) => {
              await presets?.mount?.(agentCtx, presetResolved);
            },
          });
          agent = handle?.agent ?? undefined;
          if (!agent) throw new Error('agents.create 未返回 agent');
        } else if (loop?.create) {
          agent = await loop.create(exec.sessionId, agentOptions, Object.keys(meta).length > 0 ? meta : {});
        } else {
          throw new Error('agents/agentLoop 服务不可用');
        }
      }

      // 1.5 注册会话到钉住的工作区（官方姿势：workspaceRegistry.create(path).attachSession(id)；
      //     cwd 只决定存储位置，attachSession 才决定侧栏会话树归组，缺省即「未分组」）
      if (wsPath) {
        try {
          const reg = this.ctx.get('workspaceRegistry') as unknown as WorkspaceRegistryLike | undefined;
          const ws = await reg?.create?.(wsPath);
          await ws?.attachSession?.(exec.sessionId);
        } catch (err) {
          this.log.warn(`[cron-board] 会话工作区注册失败（非致命）: ${errDetail(err)}`);
        }
      }

      // pins 阶段的取消信号（dsh-commands.execute 的 signal 为必传参数）
      const pinAbort = new AbortController();
      entry.cancel = () => {
        pinAbort.abort();
        try {
          agent?.cancel('cron-board-stop');
        } catch {
          /* ignore */
        }
      };

      // 2. 钉住权限档（命令化应用，与宿主 /permission 同一条路径）
      const permission = task.pinned.permission;
      if (permission) {
        const commands = this.ctx.get('commands') as unknown as CommandsLike | undefined;
        if (!commands?.execute) throw new Error('commands 服务不可用（权限档应用失败）');
        const res = await commands.execute(agent, `/permission ${permission}`, [], pinAbort.signal);
        const feedback = res as { feedback?: { kind?: string }; kind?: string } | null | undefined;
        const kind = feedback?.feedback?.kind ?? feedback?.kind;
        if (kind === 'error') throw new Error(`权限档 ${permission} 应用被拒绝`);
      }

      // 4. 会话重命名（非致命；复用会话保持标题与历史不变——原版 task-board 语义）
      if (agent.session.id === exec.sessionId && task.activeSessionId !== exec.sessionId) {
        try {
          const st = this.ctx.get('sessionTitle') as unknown as SessionTitleLike | undefined;
          st?.rename?.(agent.session, `${task.title} · cron`);
        } catch {
          /* ignore */
        }
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
        agent.followup(
          requireDshLlm().createUserMessage({
            content: [{ type: 'text', text: buildPromptWithTags(task) }],
            source: { kind: 'user' },
          }),
        );
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
          content: outcome.finalText,
          sessionId: exec.sessionId, // 推送里带会话 ID，方便跳转
        }),
      );
    }

    await this.ledger.mutate((doc) => {
      const t = doc.tasks.find((x) => x.id === task.id);
      if (!t) return;
      const row = t.executions.find((e) => e.id === exec.id);
      if (!row) return;
      Object.assign(row, exec);
      // 延续会话：记录本次会话，下次执行 resume（2026-09-19 用户要求）
      t.activeSessionId = exec.sessionId;
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
      if (typeof reg?.get === 'function') {
        const p = reg.get(wsId)?.path;
        if (typeof p === 'string' && p !== '') return p;
      }
      // 宿主 4.x 无 get(id)（软探测静默拿空 → 会话落 home 显示未分组）；list() 为已验证可用路径
      const hit = (reg?.list?.() ?? []).find((w) => w?.id === wsId);
      return typeof hit?.path === 'string' && hit.path !== '' ? hit.path : undefined;
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
        content: await readResultBody(exec.resultPath),
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
    const record = { ok: r.state === 'sent', error: r.lastError, at: new Date().toISOString(), channel: r.channel ?? 'service' };
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
  const reason = (data as { reason?: Record<string, unknown> } | undefined)?.reason;
  if (!reason) return 'unknown';
  const kind = reason.kind;
  if (typeof kind !== 'string') return 'unknown';
  // 诊断增强：error/aborted/interrupted 时把宿主给出的错误详情带出来（定位会话内失败原因）
  if (kind !== 'error' && kind !== 'aborted' && kind !== 'interrupted') return kind;
  const detail =
    reason.message ??
    reason.error ??
    reason.detail ??
    (typeof reason.cause === 'object' && reason.cause !== null
      ? (reason.cause as { message?: unknown }).message
      : undefined);
  return detail !== undefined && detail !== null && detail !== '' ? `${kind}: ${String(detail)}` : kind;
}

/** 从结果文件读回正文（去 front matter），供补推使用；失败返回 undefined。 */
async function readResultBody(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    const raw = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
    if (raw.startsWith('---')) {
      const end = raw.indexOf('\n---', 3);
      if (end >= 0) {
        const nextLine = raw.indexOf('\n', end + 1);
        if (nextLine >= 0) return raw.slice(nextLine + 1).trim();
      }
    }
    return raw.trim() !== '' ? raw.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** 供 rpc/meta 使用的只读探测（避免 rpc 反向依赖 runner 内部）。 */
export function gateSnapshot(
  task: TaskRow,
  defaultPermission: PermissionPreset,
): { needsConfirm: boolean; confirmed: boolean } {
  return {
    needsConfirm: needsConfirm(task, defaultPermission),
    confirmed: isConfirmed(task),
  };
}

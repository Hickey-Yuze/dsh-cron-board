/**
 * Host↔Client RPC：`ctx.connection.rpc.handle('/rpc', handler)`，端点前缀 `cron-board/*`。
 * connection 是可选服务且可能晚于插件就绪：探测 + 监听 `internal/service` 补挂。
 * 所有变更载荷手工校验（严格字段、长度上限、ID 形态）；协议不含 shell/可执行路径字段。
 * 未匹配端点抛 coded 错误（信封由宿主 rpc 层包装为 {ok:false,error}）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { cronNextRun, isValidCron } from './cron.js';
import type { CronBoardConfig } from './config.js';
import type {
  BoardSnapshot,
  MetaView,
  PermissionPreset,
  PushTargetRef,
  SettingsView,
  TaskDraft,
  TaskRow,
  TaskTag,
  TaskView,
} from './contract.js';
import { confirmFingerprint, gateDecision, isConfirmed, needsConfirm } from './gatekeeper.js';
import type { LedgerStore } from './ledger.js';
import type { Pusher } from './pusher.js';
import type { ResultStore } from './results.js';
import type { TaskRunner } from './runner.js';
import { errDetail, newTaskId } from './util.js';

interface HttpRequestLike {
  url?: string;
  method?: string;
  on(event: 'data', fn: (chunk: Buffer) => void): void;
  on(event: 'end', fn: () => void): void;
}

interface HttpResponseLike {
  writeHead(code: number, headers: Record<string, string>): unknown;
  end(body?: string): unknown;
}

/** 宿主 webServer 服务的最小结构面（session-manager 同款注册协议）。 */
interface WebServerLike {
  register(route: {
    kind: 'prefix';
    path: string;
    handler: (req: HttpRequestLike, res: HttpResponseLike) => Promise<void> | void;
  }): unknown;
}

const API_PREFIX = '/api/cron-board';
const BODY_MAX = 1024 * 1024;

export interface RpcDeps {
  ledger: LedgerStore;
  runner: TaskRunner;
  results: ResultStore;
  pusher: Pusher;
  config: CronBoardConfig;
  log: { info(m: string): void; warn(m: string): void; error(m: string): void };
  buildSnapshot(): BoardSnapshot;
  /** AI 解析（index.ts 注入，依赖 llm/agentDefaultModel；rpc 层不直接耦合 llm）。 */
  parsePrompt(text: string, signal: AbortSignal): Promise<{ title?: string; prompt?: string; cron?: string }>;
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function asRecord(v: unknown, code = 'bad-request'): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(code, '载荷必须为对象');
  return v as Record<string, unknown>;
}

function asString(v: unknown, field: string, max: number, code = 'bad-request'): string {
  if (typeof v !== 'string') fail(code, `${field} 必须为字符串`);
  if (v.length > max) fail(code, `${field} 超长（>${max}）`);
  return v;
}

const PERMISSIONS: readonly PermissionPreset[] = ['read-only', 'workspace-write', 'danger-full-access'];

function asPermission(v: unknown): PermissionPreset | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string' && (PERMISSIONS as readonly string[]).includes(v)) return v as PermissionPreset;
  return fail('bad-request', `permission 不合法: ${String(v)}`);
}

function asPushTarget(v: unknown): PushTargetRef | null {
  if (v === undefined || v === null) return null;
  const r = asRecord(v, 'bad-request');
  const botId = asString(r.botId, 'botId', 128);
  const targetId = asString(r.targetId, 'targetId', 128);
  if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(targetId)) fail('bad-request', 'targetId 含非法字符');
  return { botId, targetId };
}

function asId(v: unknown, field: string): string {
  const s = asString(v, field, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) fail('bad-request', `${field} 形态不合法`);
  return s;
}

/** 标签校验：接受 {name,promptPrefix?} 对象或裸字符串；trim 非空、去重、封顶 8、名称≤40、提示≤500（非法项丢弃）。 */
export function normalizeTags(raw: unknown): TaskTag[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) fail('bad-request', 'tags 必须为数组');
  const out: TaskTag[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= 8) break;
    let name: unknown;
    let prefix: unknown;
    if (typeof item === 'string') {
      name = item;
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const r = item as Record<string, unknown>;
      name = r.name;
      prefix = r.promptPrefix;
    } else {
      continue;
    }
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 40 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const normalizedPrefix = typeof prefix === 'string' ? prefix.trim().slice(0, 500) : undefined;
    out.push(normalizedPrefix !== undefined && normalizedPrefix !== '' ? { name: trimmed, promptPrefix: normalizedPrefix } : { name: trimmed });
  }
  return out;
}

/** 载荷校验 + 归一（导出供冒烟测试直接断言）。 */
export function normalizeDraft(raw: unknown): TaskDraft {
  const r = asRecord(raw);
  const id = r.id === undefined || r.id === null || r.id === '' ? undefined : asId(r.id, 'id');
  const title = asString(r.title, 'title', 120).trim();
  if (title === '') fail('bad-request', '标题不能为空');
  const prompt = asString(r.prompt, 'prompt', 32768);
  if (prompt.trim() === '') fail('bad-request', 'Prompt 不能为空');
  const cron = asString(r.cron, 'cron', 64).trim();
  if (!isValidCron(cron)) fail('invalid-cron', `cron 表达式不合法: ${cron}`);
  const enabled = Boolean(r.enabled); // 容错：字符串/undefined 都转布尔
  const reuseSession = r.reuseSession === undefined ? undefined : r.reuseSession === true;
  const tags = normalizeTags(r.tags);
  let pinned: TaskDraft['pinned'] = {};
  if (r.pinned !== undefined && r.pinned !== null) {
    const p = asRecord(r.pinned);
    pinned = {
      workspaceId:
        p.workspaceId === undefined || p.workspaceId === null || p.workspaceId === '' ? undefined : asId(p.workspaceId, 'workspaceId'),
      presetId: p.presetId === undefined || p.presetId === null || p.presetId === '' ? undefined : asString(p.presetId, 'presetId', 128),
      permission: asPermission(p.permission),
    };
  }
  const push = r.push === undefined ? undefined : asPushTarget(r.push);
  return { id, title, prompt, cron, enabled, pinned, push, reuseSession, tags };
}

/** 组装快照（存储行 + 派生标志），所有变更端点统一返回。 */
export function buildSnapshot(deps: RpcDeps): BoardSnapshot {
  const runningIds = new Set(deps.runner.runningTaskIds());
  const tasks: TaskView[] = deps.ledger.snapshot.tasks.map((t) => ({
    ...t,
    needsConfirm: needsConfirm(t, deps.config.defaultPermission),
    confirmed: isConfirmed(t),
    running: runningIds.has(t.id),
  }));
  return {
    revision: deps.ledger.snapshot.revision,
    serverTime: new Date().toISOString(),
    tasks,
    scheduler: {
      tickMs: deps.config.schedulerTickMs,
      runningTaskIds: [...runningIds],
    },
    pushChannel: deps.pusher.channelView(),
  };
}

export function registerRpc(ctx: Context, deps: RpcDeps): void {
  let attached = false;

  function send(res: HttpResponseLike, code: number, body: unknown): void {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }

  function readBody(req: HttpRequestLike): Promise<string> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > BODY_MAX) {
          reject(Object.assign(new Error('请求体超限'), { code: 'payload-too-large' }));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  // HTTP 传输层：POST /api/cron-board/<endpoint>；业务 handler 与端点语义解耦
  const httpHandler = async (req: HttpRequestLike, res: HttpResponseLike): Promise<void> => {
    if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
      send(res, 405, { ok: false, error: { code: 'method-not-allowed', message: '仅支持 POST' } });
      return;
    }
    let endpoint = '';
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      endpoint = decodeURIComponent(url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    } catch {
      send(res, 400, { ok: false, error: { code: 'bad-request', message: '路径不合法' } });
      return;
    }
    if (endpoint === '') {
      send(res, 404, { ok: false, error: { code: 'not-found', message: '缺少端点名' } });
      return;
    }
    // 归一化：URL 子路径（state/settings/…）→ 业务端点全名（cron-board/state/…）
    if (!endpoint.startsWith('cron-board/')) endpoint = `cron-board/${endpoint}`;
    try {
      const raw = await readBody(req);
      let payload: unknown = {};
      if (raw.trim() !== '') {
        try {
          payload = JSON.parse(raw);
        } catch {
          send(res, 400, { ok: false, error: { code: 'bad-json', message: '请求体不是合法 JSON' } });
          return;
        }
      }
      const value = await handler(endpoint, payload);
      send(res, 200, { ok: true, value });
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      deps.log.warn(`[cron-board] RPC ${endpoint} 失败: ${errDetail(err)}`);
      send(res, 200, {
        ok: false,
        error: { code: typeof code === 'string' && code !== '' ? code : 'internal', message: errDetail(err) },
      });
    }
  };

  const attach = (): void => {
    if (attached) return;
    const ws = ctx.get('webServer') as unknown as WebServerLike | undefined;
    if (!ws || typeof ws.register !== 'function') return;
    try {
      const disposer = ws.register({ kind: 'prefix', path: API_PREFIX, handler: httpHandler });
      attached = true;
      if (typeof (disposer as { dispose?: unknown })?.dispose === 'function') {
        ctx.effect(() => () => (disposer as { dispose(): unknown }).dispose());
      }
      deps.log.info(`[cron-board] API 已挂载（${API_PREFIX}/<endpoint>）`);
    } catch (err) {
      deps.log.error(`[cron-board] API 挂载失败: ${errDetail(err)}`);
    }
  };

  // 晚就绪补挂：webServer 可能晚于插件 apply
  attach();
  if (!attached) {
    try {
      ctx.on('internal/service', () => attach());
    } catch (err) {
      deps.log.warn(`[cron-board] internal/service 监听失败（API 可能延迟可用）: ${errDetail(err)}`);
    }
  }

  async function handler(endpoint: string, payload: unknown): Promise<unknown> {
    switch (endpoint) {
      case 'cron-board/state':
        return deps.buildSnapshot();

      case 'cron-board/meta': {
        const view: MetaView = {
          workspaces: [],
          presets: [],
          bots: [],
          targets: [],
          pushAvailable: deps.pusher.channelView().mode !== 'unavailable',
          pushMode: deps.pusher.channelView().mode,
        };
        try {
          const reg = ctx.get('workspaceRegistry') as unknown as
            | { list?(): { id?: string; title?: string; path?: string }[] }
            | undefined;
          view.workspaces = (reg?.list?.() ?? [])
            .filter((w) => typeof w?.id === 'string')
            .map((w) => {
              const id = w.id as string;
              return { id, title: typeof w.title === 'string' ? w.title : (w.path ?? id), path: w.path };
            });
        } catch (err) {
          deps.log.warn(`[cron-board] meta.workspaces 失败: ${errDetail(err)}`);
        }
        try {
          const presets = ctx.get('agentPresets') as unknown as { list?(): { id?: string; title?: string }[] } | undefined;
          view.presets = ((await presets?.list?.()) ?? [])
            .filter((p) => typeof p?.id === 'string')
            .map((p) => ({ id: p.id as string, title: typeof p.title === 'string' ? p.title : (p.id as string) }));
        } catch (err) {
          deps.log.warn(`[cron-board] meta.presets 失败: ${errDetail(err)}`);
        }
        try {
          view.bots = await deps.pusher.listBots();
          for (const b of view.bots) {
            const targets = await deps.pusher.listTargets(b.botId);
            view.targets.push(...targets.map((target) => ({ ...target, botId: b.botId })));
          }
        } catch (err) {
          deps.log.warn(`[cron-board] meta.bots 失败: ${errDetail(err)}`);
        }
        return view;
      }

      case 'cron-board/settings':
        return settingsView(deps);

      case 'cron-board/settings-set': {
        const r = asRecord(payload);
        const defaultPush = r.defaultPush === undefined ? undefined : asPushTarget(r.defaultPush);
        if (defaultPush !== undefined) {
          await deps.ledger.mutate((doc) => {
            doc.settings.defaultPush = defaultPush;
          });
        }
        return settingsView(deps);
      }

      case 'cron-board/task-upsert': {
        const r = asRecord(payload);
        const draft = normalizeDraft(r.task);
        const now = new Date().toISOString();
        const nextAt = draft.enabled ? (cronNextRun(draft.cron, new Date())?.toISOString() ?? null) : null;
        await deps.ledger.mutate((doc) => {
          const existing = draft.id ? doc.tasks.find((t) => t.id === draft.id) : undefined;
          if (existing) {
            existing.title = draft.title;
            existing.prompt = draft.prompt;
            existing.cron = draft.cron;
            existing.enabled = draft.enabled;
            existing.pinned = draft.pinned ?? {};
            existing.push = draft.push === undefined ? existing.push : draft.push;
            if (draft.reuseSession !== undefined) existing.reuseSession = draft.reuseSession;
            if (draft.tags !== undefined) existing.tags = draft.tags;
            // 确认门重武装：指纹变化即失效
            if (existing.confirm && existing.confirm.fingerprint !== confirmFingerprint(existing)) {
              existing.confirm = null;
            }
            existing.nextRunAt = nextAt;
            existing.lastSkipReason = null;
            existing.updatedAt = now;
          } else {
            const row: TaskRow = {
              id: newTaskId(),
              title: draft.title,
              prompt: draft.prompt,
              cron: draft.cron,
              enabled: draft.enabled,
              pinned: draft.pinned ?? {},
              push: draft.push ?? null,
              confirm: null,
              nextRunAt: nextAt,
              lastSkipReason: null,
              lastPushTest: null,
              reuseSession: draft.reuseSession ?? true,
              tags: draft.tags ?? [],
              createdAt: now,
              updatedAt: now,
              executions: [],
            };
            doc.tasks.push(row);
          }
        });
        return deps.buildSnapshot();
      }

      case 'cron-board/task-delete': {
        const r = asRecord(payload);
        const id = asId(r.id, 'id');
        if (deps.runner.isRunning(id)) fail('task-running', '任务执行中，结束后再删除');
        await deps.ledger.mutate((doc) => {
          const i = doc.tasks.findIndex((t) => t.id === id);
          if (i < 0) fail('not-found', `任务不存在: ${id}`);
          doc.tasks.splice(i, 1);
        });
        await deps.results.removeTask(id).catch(() => {});
        return deps.buildSnapshot();
      }

      case 'cron-board/task-toggle': {
        const r = asRecord(payload);
        const id = asId(r.id, 'id');
        const enabled = r.enabled === true;
        await deps.ledger.mutate((doc) => {
          const t = doc.tasks.find((x) => x.id === id);
          if (!t) fail('not-found', `任务不存在: ${id}`);
          if (t.archived) fail('archived', '任务已归档，恢复后再启用');
          t.enabled = enabled;
          t.nextRunAt = enabled ? (cronNextRun(t.cron, new Date())?.toISOString() ?? null) : null;
          t.lastSkipReason = null;
          t.updatedAt = new Date().toISOString();
        });
        return deps.buildSnapshot();
      }

      case 'cron-board/task-archive': {
        const r = asRecord(payload);
        const id = asId(r.id, 'id');
        if (deps.runner.isRunning(id)) fail('task-running', '任务执行中，结束后再归档');
        await deps.ledger.mutate((doc) => {
          const t = doc.tasks.find((x) => x.id === id);
          if (!t) fail('not-found', `任务不存在: ${id}`);
          t.archived = true;
          t.enabled = false;
          t.nextRunAt = null;
          t.lastSkipReason = null;
          t.updatedAt = new Date().toISOString();
        });
        return deps.buildSnapshot();
      }

      case 'cron-board/task-restore': {
        const r = asRecord(payload);
        const id = asId(r.id, 'id');
        await deps.ledger.mutate((doc) => {
          const t = doc.tasks.find((x) => x.id === id);
          if (!t) fail('not-found', `任务不存在: ${id}`);
          t.archived = false;
          t.enabled = false;
          t.nextRunAt = null;
          t.updatedAt = new Date().toISOString();
        });
        return deps.buildSnapshot();
      }

      case 'cron-board/parse-prompt': {
        const r = asRecord(payload);
        const text = asString(r.text, 'text', 8000).trim();
        if (text === '') fail('bad-request', '解析文本不能为空');
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 45_000);
        try {
          return await deps.parsePrompt(text, abort.signal);
        } finally {
          clearTimeout(timer);
        }
      }

      case 'cron-board/task-run': {
        const r = asRecord(payload);
        const id = asId(r.id, 'id');
        const task = deps.ledger.snapshot.tasks.find((t) => t.id === id);
        if (!task) fail('not-found', `任务不存在: ${id}`);
        if (task.archived) fail('archived', '任务已归档，恢复后再执行');
        if (deps.runner.isRunning(id)) fail('task-running', '任务正在运行');
        if (gateDecision(task, deps.config.defaultPermission) === 'awaiting-confirmation') {
          fail('awaiting-confirmation', '任务权限待确认：请在看板中完成一次性确认后再执行');
        }
        await deps.runner.launch(task, 'manual');
        return deps.buildSnapshot();
      }

      case 'cron-board/task-confirm': {
        const r = asRecord(payload);
        const id = asId(r.id, 'id');
        await deps.ledger.mutate((doc) => {
          const t = doc.tasks.find((x) => x.id === id);
          if (!t) fail('not-found', `任务不存在: ${id}`);
          if (!needsConfirm(t, deps.config.defaultPermission)) return;
          t.confirm = { fingerprint: confirmFingerprint(t), confirmedAt: new Date().toISOString() };
          t.updatedAt = new Date().toISOString();
        });
        return deps.buildSnapshot();
      }

      case 'cron-board/push-test': {
        const r = asRecord(payload);
        const id = asId(r.id, 'id');
        const result = await deps.runner.pushTest(id);
        if (!result.ok && result.error === 'no-push-target') fail('no-push-target', '未配置推送目标（任务或全局默认）');
        return deps.buildSnapshot();
      }

      case 'cron-board/push-retry': {
        const r = asRecord(payload);
        const taskId = asId(r.taskId, 'taskId');
        const execId = asId(r.execId, 'execId');
        const result = await deps.runner.retryPush(taskId, execId);
        if (!result.ok && result.error === 'no-push-target') fail('no-push-target', '未配置推送目标（任务或全局默认）');
        return deps.buildSnapshot();
      }

      case 'cron-board/exec-result': {
        const r = asRecord(payload);
        const taskId = asId(r.taskId, 'taskId');
        const execId = asId(r.execId, 'execId');
        const markdown = await deps.results.read(taskId, execId);
        if (markdown === undefined) fail('not-found', '结果文件不存在或已按保留策略清理');
        return { markdown };
      }

      default:
        fail('not-found', `未知端点: ${endpoint}`);
    }
  }
}

function settingsView(deps: RpcDeps): SettingsView {
  return {
    defaultPush: deps.ledger.snapshot.settings?.defaultPush ?? null,
    httpPort: deps.config.push.httpPort,
    retryMax: deps.config.push.retryMax,
    schedulerTickMs: deps.config.schedulerTickMs,
    runTimeoutMin: deps.config.runTimeoutMin,
    resultsKeepPerTask: deps.config.resultsKeepPerTask,
    executionsKeepPerTask: deps.config.executionsKeepPerTask,
    dataDir: deps.config.dataDir ?? '',
  };
}

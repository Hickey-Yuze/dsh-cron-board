/**
 * Host↔Client RPC：`ctx.connection.rpc.handle('/rpc', handler)`，端点前缀 `cron-board/*`。
 * connection 是可选服务且可能晚于插件就绪：探测 + 监听 `internal/service` 补挂。
 * 所有变更载荷手工校验（严格字段、长度上限、ID 形态）；协议不含 shell/可执行路径字段。
 * 未匹配端点抛 coded 错误（信封由宿主 rpc 层包装为 {ok:false,error}）。
 */
import { cronNextRun, isValidCron } from './cron.js';
import { confirmFingerprint, gateDecision, isConfirmed, needsConfirm } from './gatekeeper.js';
import { errDetail, newTaskId } from './util.js';
function fail(code, message) {
    throw Object.assign(new Error(message), { code });
}
function asRecord(v, code = 'bad-request') {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        fail(code, '载荷必须为对象');
    return v;
}
function asString(v, field, max, code = 'bad-request') {
    if (typeof v !== 'string')
        fail(code, `${field} 必须为字符串`);
    if (v.length > max)
        fail(code, `${field} 超长（>${max}）`);
    return v;
}
const PERMISSIONS = ['read-only', 'workspace-write', 'danger-full-access'];
function asPermission(v) {
    if (v === undefined || v === null || v === '')
        return undefined;
    if (typeof v === 'string' && PERMISSIONS.includes(v))
        return v;
    return fail('bad-request', `permission 不合法: ${String(v)}`);
}
function asPushTarget(v) {
    if (v === undefined || v === null)
        return null;
    const r = asRecord(v, 'bad-request');
    const botId = asString(r.botId, 'botId', 128);
    const targetId = asString(r.targetId, 'targetId', 128);
    if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(targetId))
        fail('bad-request', 'targetId 含非法字符');
    return { botId, targetId };
}
function asId(v, field) {
    const s = asString(v, field, 64);
    if (!/^[A-Za-z0-9_-]+$/.test(s))
        fail('bad-request', `${field} 形态不合法`);
    return s;
}
/** 载荷校验 + 归一（导出供冒烟测试直接断言）。 */
export function normalizeDraft(raw) {
    const r = asRecord(raw);
    const title = asString(r.title, 'title', 120).trim();
    if (title === '')
        fail('bad-request', '标题不能为空');
    const prompt = asString(r.prompt, 'prompt', 32768);
    if (prompt.trim() === '')
        fail('bad-request', 'Prompt 不能为空');
    const cron = asString(r.cron, 'cron', 64).trim();
    if (!isValidCron(cron))
        fail('invalid-cron', `cron 表达式不合法: ${cron}`);
    const enabled = r.enabled === true;
    let pinned = {};
    if (r.pinned !== undefined && r.pinned !== null) {
        const p = asRecord(r.pinned);
        pinned = {
            workspaceId: p.workspaceId === undefined || p.workspaceId === null || p.workspaceId === '' ? undefined : asId(p.workspaceId, 'workspaceId'),
            presetId: p.presetId === undefined || p.presetId === null || p.presetId === '' ? undefined : asString(p.presetId, 'presetId', 128),
            permission: asPermission(p.permission),
        };
    }
    const push = r.push === undefined ? undefined : asPushTarget(r.push);
    return { title, prompt, cron, enabled, pinned, push };
}
/** 组装快照（存储行 + 派生标志），所有变更端点统一返回。 */
export function buildSnapshot(deps) {
    const runningIds = new Set(deps.runner.runningTaskIds());
    const tasks = deps.ledger.snapshot.tasks.map((t) => ({
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
export function registerRpc(ctx, deps) {
    let attached = false;
    const attach = () => {
        if (attached)
            return;
        const conn = ctx.get('connection');
        if (!conn?.rpc?.handle)
            return;
        try {
            conn.rpc.handle('/rpc', handler);
            attached = true;
            deps.log.info('[cron-board] RPC 端点已挂载（/rpc → cron-board/*）');
        }
        catch (err) {
            deps.log.error(`[cron-board] RPC 挂载失败: ${errDetail(err)}`);
        }
    };
    // 晚就绪补挂：connection 可能晚于插件 apply
    attach();
    if (!attached) {
        try {
            ctx.on('internal/service', () => attach());
        }
        catch (err) {
            deps.log.warn(`[cron-board] internal/service 监听失败（RPC 可能延迟可用）: ${errDetail(err)}`);
        }
    }
    async function handler(endpoint, payload) {
        switch (endpoint) {
            case 'cron-board/state':
                return deps.buildSnapshot();
            case 'cron-board/meta': {
                const view = {
                    workspaces: [],
                    presets: [],
                    bots: [],
                    targets: [],
                    pushAvailable: deps.pusher.channelView().mode !== 'unavailable',
                    pushMode: deps.pusher.channelView().mode,
                };
                try {
                    const reg = ctx.get('workspaceRegistry');
                    view.workspaces = (reg?.list?.() ?? [])
                        .filter((w) => typeof w?.id === 'string')
                        .map((w) => {
                        const id = w.id;
                        return { id, title: typeof w.title === 'string' ? w.title : (w.path ?? id), path: w.path };
                    });
                }
                catch (err) {
                    deps.log.warn(`[cron-board] meta.workspaces 失败: ${errDetail(err)}`);
                }
                try {
                    const presets = ctx.get('agentPresets');
                    view.presets = (await presets?.list?.() ?? [])
                        .filter((p) => typeof p?.id === 'string')
                        .map((p) => ({ id: p.id, title: typeof p.title === 'string' ? p.title : p.id }));
                }
                catch (err) {
                    deps.log.warn(`[cron-board] meta.presets 失败: ${errDetail(err)}`);
                }
                try {
                    view.bots = await deps.pusher.listBots();
                    for (const b of view.bots) {
                        const targets = await deps.pusher.listTargets(b.botId);
                        view.targets.push(...targets.map((target) => ({ ...target, botId: b.botId })));
                    }
                }
                catch (err) {
                    deps.log.warn(`[cron-board] meta.bots 失败: ${errDetail(err)}`);
                }
                return view;
            }
            case 'cron-board/settings': {
                return settingsView(deps);
            }
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
                const nextAt = draft.enabled ? cronNextRun(draft.cron, new Date())?.toISOString() ?? null : null;
                await deps.ledger.mutate((doc) => {
                    const existing = draft.id ? doc.tasks.find((t) => t.id === draft.id) : undefined;
                    if (existing) {
                        existing.title = draft.title;
                        existing.prompt = draft.prompt;
                        existing.cron = draft.cron;
                        existing.enabled = draft.enabled;
                        existing.pinned = draft.pinned ?? {};
                        existing.push = draft.push === undefined ? existing.push : draft.push;
                        // 确认门重武装：指纹变化即失效
                        if (existing.confirm && existing.confirm.fingerprint !== confirmFingerprint(existing)) {
                            existing.confirm = null;
                        }
                        existing.nextRunAt = nextAt;
                        existing.lastSkipReason = null;
                        existing.updatedAt = now;
                    }
                    else {
                        const row = {
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
                if (deps.runner.isRunning(id))
                    fail('task-running', '任务执行中，结束后再删除');
                await deps.ledger.mutate((doc) => {
                    const i = doc.tasks.findIndex((t) => t.id === id);
                    if (i < 0)
                        fail('not-found', `任务不存在: ${id}`);
                    doc.tasks.splice(i, 1);
                });
                await deps.results.removeTask(id).catch(() => { });
                return deps.buildSnapshot();
            }
            case 'cron-board/task-toggle': {
                const r = asRecord(payload);
                const id = asId(r.id, 'id');
                const enabled = r.enabled === true;
                await deps.ledger.mutate((doc) => {
                    const t = doc.tasks.find((x) => x.id === id);
                    if (!t)
                        fail('not-found', `任务不存在: ${id}`);
                    t.enabled = enabled;
                    t.nextRunAt = enabled ? cronNextRun(t.cron, new Date())?.toISOString() ?? null : null;
                    t.lastSkipReason = null;
                    t.updatedAt = new Date().toISOString();
                });
                return deps.buildSnapshot();
            }
            case 'cron-board/task-run': {
                const r = asRecord(payload);
                const id = asId(r.id, 'id');
                const task = deps.ledger.snapshot.tasks.find((t) => t.id === id);
                if (!task)
                    fail('not-found', `任务不存在: ${id}`);
                if (deps.runner.isRunning(id))
                    fail('task-running', '任务正在运行');
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
                    if (!t)
                        fail('not-found', `任务不存在: ${id}`);
                    if (!needsConfirm(t, deps.config.defaultPermission))
                        return;
                    t.confirm = { fingerprint: confirmFingerprint(t), confirmedAt: new Date().toISOString() };
                    t.updatedAt = new Date().toISOString();
                });
                return deps.buildSnapshot();
            }
            case 'cron-board/push-test': {
                const r = asRecord(payload);
                const id = asId(r.id, 'id');
                const result = await deps.runner.pushTest(id);
                if (!result.ok && result.error === 'no-push-target')
                    fail('no-push-target', '未配置推送目标（任务或全局默认）');
                return deps.buildSnapshot();
            }
            case 'cron-board/push-retry': {
                const r = asRecord(payload);
                const taskId = asId(r.taskId, 'taskId');
                const execId = asId(r.execId, 'execId');
                const result = await deps.runner.retryPush(taskId, execId);
                if (!result.ok && result.error === 'no-push-target')
                    fail('no-push-target', '未配置推送目标（任务或全局默认）');
                return deps.buildSnapshot();
            }
            case 'cron-board/exec-result': {
                const r = asRecord(payload);
                const taskId = asId(r.taskId, 'taskId');
                const execId = asId(r.execId, 'execId');
                const markdown = await deps.results.read(taskId, execId);
                if (markdown === undefined)
                    fail('not-found', '结果文件不存在或已按保留策略清理');
                return { markdown };
            }
            default:
                fail('not-found', `未知端点: ${endpoint}`);
        }
    }
}
function settingsView(deps) {
    return {
        defaultPush: deps.ledger.snapshot.settings?.defaultPush ?? null,
        httpPort: deps.config.push.httpPort,
        retryMax: deps.config.push.retryMax,
        schedulerTickMs: deps.config.schedulerTickMs,
        runTimeoutMin: deps.config.runTimeoutMin,
        resultsKeepPerTask: deps.config.resultsKeepPerTask,
        executionsKeepPerTask: deps.config.executionsKeepPerTask,
        dataDir: deps.config.dataDir,
    };
}

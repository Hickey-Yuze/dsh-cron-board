import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { gateDecision, isConfirmed, needsConfirm } from './gatekeeper.js';
import { LedgerStore } from './ledger.js';
import { errDetail, newExecId, newSessionId } from './util.js';
export class TaskRunner {
    ctx;
    ledger;
    results;
    pusher;
    config;
    log;
    running = new Map();
    constructor(ctx, ledger, results, pusher, config, log) {
        this.ctx = ctx;
        this.ledger = ledger;
        this.results = results;
        this.pusher = pusher;
        this.config = config;
        this.log = log;
    }
    /** 当前部署已接入的 dshIm（每次现取，支持 dsh-im 后装热生效）。 */
    dshIm() {
        return this.ctx.get('dshIm');
    }
    isRunning(taskId) {
        return this.running.has(taskId);
    }
    /** 插件停机：取消全部在途执行（agent cancel → 会话按 aborted 结算）。 */
    cancelAll() {
        for (const [taskId, entry] of this.running) {
            try {
                entry.cancel();
            }
            catch (err) {
                this.log.warn(`[cron-board] 取消在途执行失败（task=${taskId}）: ${errDetail(err)}`);
            }
        }
    }
    runningTaskIds() {
        return [...this.running.keys()];
    }
    /** 快速启动：创建执行行并进入后台执行链；返回执行行（UI 立即可见 running）。 */
    async launch(task, trigger) {
        if (this.running.has(task.id))
            throw Object.assign(new Error('task-already-running'), { code: 'task-running' });
        const exec = {
            id: newExecId(),
            trigger,
            sessionId: newSessionId(),
            status: 'running',
            startedAt: new Date().toISOString(),
        };
        await this.ledger.mutate((doc) => {
            const t = doc.tasks.find((x) => x.id === task.id);
            if (!t)
                throw Object.assign(new Error('task-not-found'), { code: 'not-found' });
            t.updatedAt = new Date().toISOString();
            LedgerStore.pushExecution(t, exec, this.config.executionsKeepPerTask);
        });
        const entry = { exec, cancel: () => { } };
        this.running.set(task.id, entry);
        // 后台执行链：任何异常都收敛到 finalize，绝不外泄阻塞宿主
        void this.drive(task, exec, entry).catch((err) => {
            this.log.error(`[cron-board] 执行链异常（task=${task.id} exec=${exec.id}）: ${errDetail(err)}`);
        });
        return exec;
    }
    async drive(task, exec, entry) {
        const startedAt = Date.now();
        let agent;
        let exitReason = 'unknown';
        let finalText = '';
        let status = 'failed';
        try {
            // 门控复核（防绕过 RPC 直调）：待确认即终止
            if (gateDecision(task, this.config.defaultPermission) === 'awaiting-confirmation') {
                exitReason = 'awaiting-confirmation';
                this.log.warn(`[cron-board] 任务 ${task.id} 待确认，拒绝执行`);
                return;
            }
            // 1. 新建会话 + 运行中 agent
            const loop = this.ctx.get('agentLoop');
            if (!loop?.create)
                throw new Error('agentLoop 服务不可用');
            const wsPath = this.resolveWorkspacePath(task);
            agent = await loop.create(exec.sessionId, {}, wsPath ? { cwd: wsPath } : {});
            entry.cancel = () => {
                try {
                    agent?.cancel('cron-board-stop');
                }
                catch {
                    /* ignore */
                }
            };
            // 2. 钉住预设（失败即不发送）
            const presetId = task.pinned.presetId;
            if (presetId) {
                const presets = this.ctx.get('agentPresets');
                if (!presets?.select)
                    throw new Error(`agentPresets 服务不可用（钉住 ${presetId} 失败）`);
                try {
                    await presets.select(agent, presetId);
                }
                catch (err) {
                    throw new Error(`钉住预设 ${presetId} 失败: ${errDetail(err)}`);
                }
            }
            // 3. 钉住权限档（命令化应用，与宿主 /permission 同一条路径）
            const permission = task.pinned.permission;
            if (permission) {
                const commands = this.ctx.get('commands');
                if (!commands?.execute)
                    throw new Error('commands 服务不可用（权限档应用失败）');
                const res = await commands.execute(agent, `/permission ${permission}`, []);
                const feedback = res;
                const kind = feedback?.feedback?.kind ?? feedback?.kind;
                if (kind === 'error')
                    throw new Error(`权限档 ${permission} 应用被拒绝`);
            }
            // 4. 会话重命名（非致命）
            try {
                const st = this.ctx.get('sessionTitle');
                st?.rename?.(agent.session, `${task.title} · cron`);
            }
            catch {
                /* ignore */
            }
            // 5. 结算监听（turn/end 权威）+ 队列式发送任务 Prompt
            let settled = false;
            let wake = () => { };
            const settledPromise = new Promise((resolve) => {
                wake = () => {
                    if (!settled) {
                        settled = true;
                        resolve();
                    }
                };
            });
            const off = this.ctx.on('session/event', (session, event) => {
                if (!session || session.id !== exec.sessionId)
                    return;
                if (event.type === 'assistant/message') {
                    const text = extractAssistantText(event.data);
                    if (text !== '')
                        finalText = text;
                }
                else if (event.type === 'turn/end') {
                    exitReason = extractEndReason(event.data);
                    wake();
                }
            });
            try {
                agent.followup(createUserMessage({ content: [{ type: 'text', text: task.prompt }], source: { kind: 'user' } }));
            }
            catch (err) {
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
            }
            finally {
                clearTimeout(timer);
                off();
            }
            if (exitReason === 'timeout') {
                status = 'timeout';
                try {
                    agent?.cancel('cron-board-timeout');
                }
                catch {
                    /* ignore */
                }
            }
            else if (exitReason === 'completed' || exitReason === 'unknown') {
                status = 'success';
            }
            else {
                status = 'failed';
            }
            if (finalText === '')
                finalText = status === 'success' ? '（会话已结束，无文本输出）' : '（失败：无文本输出）';
        }
        catch (err) {
            status = 'failed';
            exitReason = `pin-failed: ${errDetail(err)}`;
            this.log.error(`[cron-board] 任务执行失败（task=${task.id}）: ${errDetail(err)}`);
            try {
                agent?.cancel('cron-board-pin-failed');
            }
            catch {
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
    async finalize(task, exec, outcome) {
        exec.status = outcome.status;
        exec.exitReason = outcome.exitReason;
        exec.durationMs = outcome.durationMs;
        exec.endedAt = new Date().toISOString();
        exec.summary = `${outcome.status} · ${outcome.exitReason}`;
        // 结果落盘 + 保留裁剪
        let resultPath;
        try {
            resultPath = await this.results.write(task, exec, outcome.finalText);
            exec.resultPath = resultPath;
        }
        catch (err) {
            this.log.warn(`[cron-board] 结果落盘失败: ${errDetail(err)}`);
        }
        // 推送（成功/失败都推简讯；无目标 = disabled；失败不阻塞结算，可看板补推）
        const defaultPush = this.ledger.snapshot.settings?.defaultPush ?? null;
        const target = task.push ?? defaultPush;
        if (!target || !target.botId || !target.targetId) {
            exec.push = { state: 'disabled', attempts: 0 };
        }
        else {
            exec.push = await this.pusher.send(target.botId, target.targetId, this.pusher.briefFor({
                ok: outcome.status === 'success',
                title: task.title,
                status: outcome.status,
                durationMs: outcome.durationMs,
                resultPath,
                reason: outcome.exitReason,
            }));
        }
        await this.ledger.mutate((doc) => {
            const t = doc.tasks.find((x) => x.id === task.id);
            if (!t)
                return;
            const row = t.executions.find((e) => e.id === exec.id);
            if (!row)
                return;
            Object.assign(row, exec);
            t.updatedAt = new Date().toISOString();
        });
        await this.results.prune(task.id, this.config.resultsKeepPerTask, exec.id).catch(() => { });
        this.log.info(`[cron-board] 任务《${task.title}》结算: ${outcome.status}（${outcome.exitReason}），push=${exec.push?.state ?? 'none'}`);
    }
    resolveWorkspacePath(task) {
        const wsId = task.pinned.workspaceId;
        if (!wsId)
            return undefined;
        try {
            const reg = this.ctx.get('workspaceRegistry');
            return reg?.get?.(wsId)?.path;
        }
        catch {
            return undefined;
        }
    }
    /** 看板手动补推：对既有执行行重发简讯（带退避重试）。 */
    async retryPush(taskId, execId) {
        const snap = this.ledger.snapshot;
        const task = snap.tasks.find((t) => t.id === taskId);
        const exec = task?.executions.find((e) => e.id === execId);
        if (!task || !exec)
            return { ok: false, error: 'not-found' };
        const defaultPush = snap.settings?.defaultPush ?? null;
        const target = task.push ?? defaultPush;
        if (!target || !target.botId || !target.targetId)
            return { ok: false, error: 'no-push-target' };
        const ok = exec.status === 'success';
        const push = await this.pusher.send(target.botId, target.targetId, this.pusher.briefFor({
            ok,
            title: task.title,
            status: exec.status,
            durationMs: exec.durationMs,
            resultPath: exec.resultPath,
            reason: exec.exitReason,
        }));
        await this.ledger.mutate((doc) => {
            const t = doc.tasks.find((x) => x.id === taskId);
            const row = t?.executions.find((e) => e.id === execId);
            if (row)
                row.push = push;
        });
        return { ok: push.state === 'sent', error: push.lastError };
    }
    /** 推送测试：向任务目标（或全局默认）发一条测试消息并记录 lastPushTest。 */
    async pushTest(taskId) {
        const snap = this.ledger.snapshot;
        const task = snap.tasks.find((t) => t.id === taskId);
        const target = task?.push ?? snap.settings?.defaultPush ?? null;
        if (!target || !target.botId || !target.targetId)
            return { ok: false, error: 'no-push-target' };
        const dshIm = this.dshIm();
        const channel = dshIm?.send ? 'service' : 'http';
        const r = await this.pusher.send(target.botId, target.targetId, `dsh-cron-board 推送测试成功。\n任务：《${task?.title ?? taskId}》\n通道：${channel}`);
        const record = { ok: r.state === 'sent', error: r.lastError, at: new Date().toISOString(), channel: r.channel };
        await this.ledger.mutate((doc) => {
            const t = doc.tasks.find((x) => x.id === taskId);
            if (t)
                t.lastPushTest = record;
        });
        return { ok: record.ok, error: record.error, channel: r.channel };
    }
}
function extractAssistantText(data) {
    const msg = data?.message;
    const content = msg?.content;
    if (!Array.isArray(content))
        return '';
    const parts = [];
    for (const block of content) {
        if (block && typeof block === 'object' && block.type === 'text') {
            const text = block.text;
            if (typeof text === 'string' && text.trim() !== '')
                parts.push(text);
        }
    }
    return parts.join('\n');
}
function extractEndReason(data) {
    const kind = data?.reason?.kind;
    return typeof kind === 'string' ? kind : 'unknown';
}
/** 供 rpc/meta 使用的只读探测（避免 rpc 反向依赖 runner 内部）。 */
export function gateSnapshot(task, defaultPermission) {
    return {
        needsConfirm: needsConfirm(task, defaultPermission.defaultPermission),
        confirmed: isConfirmed(task),
    };
}

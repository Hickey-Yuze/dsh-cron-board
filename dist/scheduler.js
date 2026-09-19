/**
 * Host 调度器：固定 tick 扫描启用任务的 nextRunAt（5 段 cron，Host 本地时区）。
 * 语义对齐 dsh-task-board：
 * - 错过触发（宿主停机/睡眠）→ 跳过绝不补跑，nextRunAt 向后滚动；
 * - 同任务运行中 → 跳过并滚动，不排队不并发；
 * - 权限待确认 → cron 跳过并滚动，滚动原因写回 lastSkipReason 供看板提示。
 */
import { cronNextRun, isValidCron } from './cron.js';
import { gateDecision } from './gatekeeper.js';
import { errDetail } from './util.js';
export class Scheduler {
    ledger;
    runner;
    deps;
    log;
    ticking = false;
    lastTickAt;
    constructor(ledger, runner, deps, log) {
        this.ledger = ledger;
        this.runner = runner;
        this.deps = deps;
        this.log = log;
    }
    /** 启动 tick 循环，返回停止 disposer（由 index.ts 挂 ctx.effect）。 */
    start() {
        const timer = setInterval(() => {
            void this.tick();
        }, Math.max(5000, this.deps.tickMs));
        // 立即跑一轮：重启后恢复 nextRunAt 语义（错过即跳过）
        void this.tick();
        return () => clearInterval(timer);
    }
    async tick() {
        if (this.ticking)
            return;
        this.ticking = true;
        try {
            const now = new Date();
            const rolls = [];
            const fire = [];
            for (const task of this.ledger.snapshot.tasks) {
                if (!task.enabled)
                    continue;
                if (!isValidCron(task.cron)) {
                    rolls.push({ id: task.id, nextRunAt: null, skipReason: 'invalid-cron' });
                    continue;
                }
                const current = task.nextRunAt ? new Date(task.nextRunAt) : cronNextRun(task.cron, now);
                if (!current || Number.isNaN(current.getTime())) {
                    rolls.push({ id: task.id, nextRunAt: null, skipReason: 'cron-exhausted' });
                    continue;
                }
                if (now.getTime() < current.getTime())
                    continue; // 未到期
                // 到期：先决定动作，再统一滚动
                const missed = now.getTime() - current.getTime() > this.deps.tickMs + 90_000;
                let skip = null;
                if (missed)
                    skip = 'missed-trigger-skipped';
                else if (this.runner.isRunning(task.id))
                    skip = 'task-running-skipped';
                else if (gateDecision(task, this.deps.defaultPermission) === 'awaiting-confirmation')
                    skip = 'awaiting-confirmation';
                else
                    fire.push(task);
                const next = cronNextRun(task.cron, now);
                rolls.push({ id: task.id, nextRunAt: next ? next.toISOString() : null, skipReason: skip });
            }
            if (rolls.length > 0) {
                await this.ledger.mutate((doc) => {
                    for (const r of rolls) {
                        const t = doc.tasks.find((x) => x.id === r.id);
                        if (!t)
                            continue;
                        t.nextRunAt = r.nextRunAt;
                        t.lastSkipReason = r.skipReason;
                        t.updatedAt = new Date().toISOString();
                    }
                });
            }
            for (const task of fire) {
                // 逐个后台触发；launch 内部自带不并发保护
                this.runner
                    .launch(task, 'cron')
                    .catch((err) => this.log.error(`[cron-board] cron 触发失败（task=${task.id}）: ${errDetail(err)}`));
            }
            this.lastTickAt = new Date().toISOString();
        }
        catch (err) {
            this.log.error(`[cron-board] 调度 tick 异常: ${errDetail(err)}`);
        }
        finally {
            this.ticking = false;
        }
    }
}

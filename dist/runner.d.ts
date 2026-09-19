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
import type { Execution, TaskRow } from './contract.js';
import { LedgerStore } from './ledger.js';
import type { ResultStore } from './results.js';
import type { Pusher } from './pusher.js';
import type { CronBoardConfig } from './config.js';
export interface RunnerLogger {
    info(m: string): void;
    warn(m: string): void;
    error(m: string): void;
}
export declare class TaskRunner {
    private readonly ctx;
    private readonly ledger;
    private readonly results;
    private readonly pusher;
    private readonly config;
    private readonly log;
    private running;
    constructor(ctx: Context, ledger: LedgerStore, results: ResultStore, pusher: Pusher, config: CronBoardConfig, log: RunnerLogger);
    /** 当前部署已接入的 dshIm（每次现取，支持 dsh-im 后装热生效）。 */
    private dshIm;
    isRunning(taskId: string): boolean;
    /** 插件停机：取消全部在途执行（agent cancel → 会话按 aborted 结算）。 */
    cancelAll(): void;
    runningTaskIds(): string[];
    /** 快速启动：创建执行行并进入后台执行链；返回执行行（UI 立即可见 running）。 */
    launch(task: TaskRow, trigger: Execution['trigger']): Promise<Execution>;
    private drive;
    private finalize;
    private resolveWorkspacePath;
    /** 看板手动补推：对既有执行行重发简讯（带退避重试）。 */
    retryPush(taskId: string, execId: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** 推送测试：向任务目标（或全局默认）发一条测试消息并记录 lastPushTest。 */
    pushTest(taskId: string): Promise<{
        ok: boolean;
        error?: string;
        channel?: 'service' | 'http';
    }>;
}
/** 供 rpc/meta 使用的只读探测（避免 rpc 反向依赖 runner 内部）。 */
export declare function gateSnapshot(task: TaskRow, defaultPermission: RunnerHostConfig): {
    needsConfirm: boolean;
    confirmed: boolean;
};
interface RunnerHostConfig {
    defaultPermission: CronBoardConfig['defaultPermission'];
}
export {};

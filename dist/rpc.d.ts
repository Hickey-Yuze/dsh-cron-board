import type { BoardSnapshot, TaskDraft } from './contract.js';
import type { LedgerStore } from './ledger.js';
import type { Pusher } from './pusher.js';
import type { ResultStore } from './results.js';
import type { TaskRunner } from './runner.js';
import type { CronBoardConfig } from './config.js';
export interface RpcDeps {
    ledger: LedgerStore;
    runner: TaskRunner;
    results: ResultStore;
    pusher: Pusher;
    config: CronBoardConfig;
    log: {
        info(m: string): void;
        warn(m: string): void;
        error(m: string): void;
    };
    buildSnapshot(): BoardSnapshot;
}
/** 载荷校验 + 归一（导出供冒烟测试直接断言）。 */
export declare function normalizeDraft(raw: unknown): TaskDraft;
/** 组装快照（存储行 + 派生标志），所有变更端点统一返回。 */
export declare function buildSnapshot(deps: RpcDeps): BoardSnapshot;
export declare function registerRpc(ctx: import('@deepseek-ai/cordis').Context, deps: RpcDeps): void;

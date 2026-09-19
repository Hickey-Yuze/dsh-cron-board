import type { PermissionPreset, TaskRow } from './contract.js';
export interface SchedulerDeps {
    tickMs: number;
    defaultPermission: PermissionPreset;
}
export interface SchedulerRunner {
    isRunning(taskId: string): boolean;
    launch(task: TaskRow, trigger: 'cron' | 'manual'): Promise<unknown>;
}
export declare class Scheduler {
    private readonly ledger;
    private readonly runner;
    private readonly deps;
    private readonly log;
    private ticking;
    lastTickAt?: string;
    constructor(ledger: {
        snapshot: {
            tasks: TaskRow[];
        };
        mutate<T>(fn: (doc: {
            tasks: TaskRow[];
        }) => T | Promise<T>): Promise<unknown>;
    }, runner: SchedulerRunner, deps: SchedulerDeps, log: {
        info(m: string): void;
        warn(m: string): void;
        error(m: string): void;
    });
    /** 启动 tick 循环，返回停止 disposer（由 index.ts 挂 ctx.effect）。 */
    start(): () => void;
    tick(): Promise<void>;
}

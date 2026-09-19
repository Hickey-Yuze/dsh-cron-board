import type { BoardTaskAlias, LedgerDocAlias } from './types-alias.js';
export type BoardTask = BoardTaskAlias;
export interface LedgerDoc extends LedgerDocAlias {
}
export type LedgerMutate<T> = (doc: LedgerDoc) => T | Promise<T>;
export declare class LedgerStore {
    private readonly maxExecutionsPerTask;
    private readonly log;
    private file;
    private doc;
    private chain;
    private persistQueue;
    private initialized;
    constructor(dataDir: string, maxExecutionsPerTask: number, log: {
        warn(m: string): void;
        error(m: string): void;
        info(m: string): void;
    });
    init(): Promise<void>;
    /** 宽松归一：丢弃结构非法的任务行/字段补默认，不让单行坏数据炸掉整个账本。 */
    private normalize;
    get snapshot(): LedgerDoc;
    get loaded(): boolean;
    /** 串行变更：fn 内同步/异步修改 doc，返回值透传；变更后 revision++ 并持久化。 */
    mutate<T>(fn: LedgerMutate<T>): Promise<{
        value: T;
        revision: number;
    }>;
    private persist;
    /** 插入执行记录并按上限裁剪最旧（返回被裁剪条数）。 */
    static pushExecution(task: BoardTask, exec: BoardTask['executions'][number], max: number): number;
}

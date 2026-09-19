import type { Execution, TaskRow } from './contract.js';
export declare class ResultStore {
    private root;
    constructor(dataDir: string);
    write(task: TaskRow, exec: Execution, body: string): Promise<string>;
    read(taskId: string, execId: string, maxBytes?: number): Promise<string | undefined>;
    removeTask(taskId: string): Promise<void>;
    /** 按保留份数删除最旧结果文件（mtime 升序；当前执行永远保留，execId 随机不可作时间序）。 */
    prune(taskId: string, keep: number, currentExecId?: string): Promise<void>;
}

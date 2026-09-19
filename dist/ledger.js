/**
 * Host 权威账本：任务、确认门、执行历史存于 `$DSH_HOME/cron-board/ledger.json`。
 * - 浏览器动作只有经 Host 确认（mutate 串行链）后才成为 UI 状态；
 * - 串行 mutate：同一时刻只有一个写路径，revision 单调递增；
 * - 原子持久化：整体序列化字符串 → 临时文件 → rename 覆盖；
 * - 损坏防碰撞：坏文件改名 `ledger.json.corrupt-<ts>` 后以空账本启动，绝不覆盖损坏字节；
 * - 有界历史：每任务执行记录按上限截断（插入时裁剪最旧）。
 */
import * as path from 'node:path';
import { ensureDir, readJsonSafe, writeTextAtomic } from './util.js';
export class LedgerStore {
    maxExecutionsPerTask;
    log;
    file;
    doc = { schemaVersion: 1, revision: 0, tasks: [], settings: { defaultPush: null } };
    chain = Promise.resolve();
    persistQueue = Promise.resolve();
    initialized = false;
    constructor(dataDir, maxExecutionsPerTask, log) {
        this.maxExecutionsPerTask = maxExecutionsPerTask;
        this.log = log;
        this.file = path.join(dataDir, 'ledger.json');
    }
    async init() {
        await ensureDir(path.dirname(this.file));
        const raw = await readJsonSafe(this.file, null);
        if (raw && typeof raw === 'object' && Array.isArray(raw.tasks)) {
            this.doc = this.normalize(raw);
            this.initialized = true;
            return;
        }
        if (raw !== null) {
            // 结构非法：防碰撞改名，空账本启动，绝不覆盖损坏字节
            const corrupt = `${this.file}.corrupt-${Date.now()}`;
            try {
                const fs = await import('node:fs/promises');
                await fs.rename(this.file, corrupt);
                this.log.error(`[cron-board] 账本结构非法，已改名保留: ${corrupt}`);
            }
            catch (err) {
                this.log.error(`[cron-board] 账本改名失败（原文件未动）: ${err instanceof Error ? err.message : String(err)}`);
                throw err;
            }
        }
        this.doc = { schemaVersion: 1, revision: 0, tasks: [], settings: { defaultPush: null } };
        await this.persist();
        this.initialized = true;
    }
    /** 宽松归一：丢弃结构非法的任务行/字段补默认，不让单行坏数据炸掉整个账本。 */
    normalize(raw) {
        const tasks = [];
        for (const t of raw.tasks ?? []) {
            if (!t || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.prompt !== 'string')
                continue;
            tasks.push({
                ...t,
                title: typeof t.title === 'string' ? t.title : '未命名任务',
                cron: typeof t.cron === 'string' ? t.cron : '* * * * *',
                enabled: t.enabled === true,
                pinned: t.pinned && typeof t.pinned === 'object' ? t.pinned : {},
                executions: Array.isArray(t.executions) ? t.executions : [],
                createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
                updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString(),
            });
        }
        return {
            schemaVersion: 1,
            revision: typeof raw.revision === 'number' ? raw.revision : 0,
            tasks,
            settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : { defaultPush: null },
        };
    }
    get snapshot() {
        return this.doc;
    }
    get loaded() {
        return this.initialized;
    }
    /** 串行变更：fn 内同步/异步修改 doc，返回值透传；变更后 revision++ 并持久化。 */
    async mutate(fn) {
        const run = this.chain.then(async () => {
            const value = await fn(this.doc);
            this.doc.revision += 1;
            const revision = this.doc.revision;
            // 持久化按序落盘，但不阻塞下一个 mutate 的内存变更
            this.persistQueue = this.persistQueue.then(() => this.persist()).catch((err) => {
                this.log.error(`[cron-board] 账本持久化失败: ${err instanceof Error ? err.message : String(err)}`);
            });
            return { value, revision };
        });
        // 链上吞掉异常不让后续 mutate 卡死，但把错误抛给本次调用方
        this.chain = run.catch(() => { });
        return run;
    }
    async persist() {
        await writeTextAtomic(this.file, JSON.stringify(this.doc, null, 2));
    }
    /** 插入执行记录并按上限裁剪最旧（返回被裁剪条数）。 */
    static pushExecution(task, exec, max) {
        task.executions.unshift(exec);
        if (task.executions.length <= max)
            return 0;
        const dropped = task.executions.length - max;
        task.executions.length = max;
        return dropped;
    }
}

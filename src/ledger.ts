/**
 * 宿主权威账本（ledger.json，唯一持久状态）：
 * - 串行 mutate 链（同一时间只有一个变更在跑）+ revision 递增 + 有序落盘队列；
 * - 原子写（tmp+rename），EPERM/EBUSY/EACCES 重试一次；
 * - 损坏自防护：JSON 非法或结构不符 → 改名保留为 ledger.json.corrupt-<ts>，空账本启动；
 * - 执行历史有界：pushExecution 静态方法按上限裁剪（新执行插最前）。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Execution, PushTargetRef, TaskRow } from './contract.js';
import type { LedgerDocAlias } from './types-alias.js';
import { errDetail, ensureDir, readJsonSafe, readTextSafe, writeTextAtomic } from './util.js';

type LedgerDoc = LedgerDocAlias;

export type BoardTask = TaskRow;

export interface LedgerLogger {
  info(m: string): void;
  warn(m: string): void;
  error(m: string): void;
}

function emptyDoc(): LedgerDoc {
  return { schemaVersion: 1, revision: 0, tasks: [], settings: { defaultPush: null } };
}

/** 规范化：字段缺失补默认、executions 数组、settings 结构。 */
function normalize(raw: unknown): LedgerDoc {
  const doc = emptyDoc();
  const r = raw as Partial<LedgerDoc> | null;
  if (r && typeof r === 'object') {
    doc.revision = typeof r.revision === 'number' && r.revision > 0 ? Math.floor(r.revision) : 0;
    if (Array.isArray(r.tasks)) doc.tasks = r.tasks as TaskRow[];
    if (r.settings && typeof r.settings === 'object') {
      doc.settings.defaultPush = ((r.settings as { defaultPush?: unknown }).defaultPush as PushTargetRef | null) ?? null;
    }
  }
  for (const t of doc.tasks) {
    if (!Array.isArray(t.executions)) t.executions = [];
    if (!t.pinned) t.pinned = {};
    t.confirm = t.confirm ?? null;
    t.nextRunAt = t.nextRunAt ?? null;
    t.lastSkipReason = t.lastSkipReason ?? null;
    t.lastPushTest = t.lastPushTest ?? null;
    t.push = t.push ?? null;
    // 标签防脏：非法条目逐条修复（丢弃非对象/空名/重复名），不丢整行任务（原版 issue #1521 语义）
    if (!Array.isArray(t.tags)) {
      t.tags = [];
    } else {
      const seen = new Set<string>();
      t.tags = t.tags.filter((tag) => {
        if (!tag || typeof tag !== 'object' || typeof tag.name !== 'string') return false;
        const name = tag.name.trim();
        if (name === '' || seen.has(name)) return false;
        seen.add(name);
        return true;
      });
      if (t.tags.length > 8) t.tags.length = 8;
    }
  }
  return doc;
}

export class LedgerStore {
  private doc: LedgerDoc = emptyDoc();
  private chain: Promise<unknown> = Promise.resolve();
  private persistQueue: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(
    private readonly dataDir: string,
    private readonly maxExecPerTask: number,
    private readonly log: LedgerLogger,
  ) {}

  private get file(): string {
    return path.join(this.dataDir, 'ledger.json');
  }

  get snapshot(): LedgerDoc {
    return this.doc;
  }

  get loaded(): boolean {
    return this.initialized;
  }

  /** 读取 + 规范化；损坏改名保留后以空账本启动。 */
  async init(): Promise<void> {
    await ensureDir(this.dataDir);
    const text = await readTextSafe(this.file);
    if (text === undefined) {
      this.doc = emptyDoc();
      await this.persist();
      this.initialized = true;
      return;
    }
    const raw = readJsonSafe<unknown>(text);
    if (raw && typeof raw === 'object' && Array.isArray((raw as LedgerDoc).tasks)) {
      this.doc = normalize(raw);
      this.initialized = true;
      return;
    }
    // 损坏：防碰撞改名保留，空账本启动
    const backup = path.join(this.dataDir, `ledger.json.corrupt-${Date.now()}`);
    await fs.rename(this.file, backup).catch(() => {});
    this.log.warn(`[cron-board] ledger.json 损坏，已保留为 ${path.basename(backup)}，以空账本启动`);
    this.doc = emptyDoc();
    await this.persist();
    this.initialized = true;
  }

  /** 串行变更：fn 拿到文档引用直接改；成功后 revision++ 并进入落盘队列。 */
  async mutate<T>(fn: (doc: LedgerDoc) => T | Promise<T>): Promise<{ value: T; revision: number }> {
    const run = this.chain.then(async () => {
      const value = await fn(this.doc);
      this.doc.revision += 1;
      this.persistQueue = this.persistQueue.then(() => this.persist()).catch((err) => {
        this.log.error(`[cron-board] 账本落盘失败: ${errDetail(err)}`);
      });
      // 变更串行等待该次落盘入队完成（不等待落盘本身，保证吞吐）
      return { value, revision: this.doc.revision };
    });
    // 链上吞掉异常继续（单次变更失败不阻塞后续），但把错误回传给调用方
    this.chain = run.catch((err) => {
      this.log.error(`[cron-board] 账本变更失败: ${errDetail(err)}`);
    });
    return run;
  }

  private async persist(): Promise<void> {
    try {
      await writeTextAtomic(this.file, JSON.stringify(this.doc, null, 2));
    } catch (err) {
      this.log.error(`[cron-board] ledger.json 写入失败: ${errDetail(err)}`);
    }
  }

  /** 执行历史插入（新在前）+ 上限裁剪。 */
  static pushExecution(task: BoardTask, exec: Execution, max: number): void {
    task.executions.unshift(exec);
    if (task.executions.length > max) task.executions.length = max;
  }
}

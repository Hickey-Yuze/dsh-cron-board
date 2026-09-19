/**
 * 类型别名集中处：账本文档形状 + BoardTask 别名（smoke/内部使用）。
 * 契约类型仍以 contract.ts 为唯一事实源，这里只做 re-export 与文档形状定义。
 */
import type { PushTargetRef, TaskRow } from './contract.js';

export type BoardTaskAlias = TaskRow;

export interface LedgerDocAlias {
  schemaVersion: 1;
  revision: number;
  tasks: TaskRow[];
  settings: { defaultPush: PushTargetRef | null };
}

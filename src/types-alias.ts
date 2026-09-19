/**
 * 类型别名桥：把 contract.ts 的纯数据类型以稳定名字供 ledger.ts 引用。
 * （contract 是 types-only 事实源；本文件仅为避免 ledger 与 rpc 的类型环引用而设。）
 */
export type { TaskRow as BoardTaskAlias } from './contract.js';

import type { PushTargetRef, TaskRow } from './contract.js';

/** 账本文档（ledger.json 顶层形态）。 */
export interface LedgerDocAlias {
  schemaVersion: 1;
  revision: number;
  tasks: TaskRow[];
  settings: { defaultPush: PushTargetRef | null };
}

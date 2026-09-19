import type { PermissionPreset, TaskRow } from './contract.js';
export declare function confirmFingerprint(t: Pick<TaskRow, 'prompt' | 'pinned'>): string;
/** 任务有效权限档：钉住优先，否则部署默认。 */
export declare function effectivePermission(t: Pick<TaskRow, 'pinned'>, defaultPermission: PermissionPreset): PermissionPreset;
/** 高于默认权限档的任务需要一次性人工确认（默认档 = read-only 时，非 read-only 都要确认）。 */
export declare function needsConfirm(t: Pick<TaskRow, 'pinned'>, defaultPermission: PermissionPreset): boolean;
export declare function isConfirmed(t: TaskRow): boolean;
export type GateDecision = 'allow' | 'awaiting-confirmation';
/** 执行前的门控判定：cron 与手动共用；awaiting 时 cron 跳过、手动拒绝。 */
export declare function gateDecision(t: TaskRow, defaultPermission: PermissionPreset): GateDecision;

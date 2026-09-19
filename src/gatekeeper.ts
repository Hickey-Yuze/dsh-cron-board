/**
 * 权限确认门（纯函数状态机）：
 * - 默认权限档以下（read-only）的任务允许无人值守 cron；
 * - 有效权限高于默认（或部署策略要求）的任务进入待确认态：
 *   cron 跳过并滚动 nextRunAt、手动执行拒绝；看板人工确认一次后放行；
 * - 权限/Prompt/预设/工作区任一变更 → 指纹变化 → 确认失效重新武装
 *   （封死「先确认后替换提权」路径）。
 */
import { sha256 } from './util.js';
import type { PermissionPreset, TaskRow } from './contract.js';

export function confirmFingerprint(t: Pick<TaskRow, 'prompt' | 'pinned'>): string {
  return sha256(
    JSON.stringify({
      prompt: t.prompt,
      permission: t.pinned.permission ?? null,
      presetId: t.pinned.presetId ?? null,
      workspaceId: t.pinned.workspaceId ?? null,
    }),
  );
}

/** 任务有效权限档：钉住优先，否则部署默认。 */
export function effectivePermission(t: Pick<TaskRow, 'pinned'>, defaultPermission: PermissionPreset): PermissionPreset {
  return t.pinned.permission ?? defaultPermission;
}

/** 高于默认权限档的任务需要一次性人工确认（默认档 = read-only 时，非 read-only 都要确认）。 */
export function needsConfirm(t: Pick<TaskRow, 'pinned'>, defaultPermission: PermissionPreset): boolean {
  return effectivePermission(t, defaultPermission) !== defaultPermission || defaultPermission !== 'read-only';
}

export function isConfirmed(t: TaskRow): boolean {
  if (!t.confirm) return false;
  return t.confirm.fingerprint === confirmFingerprint(t);
}

export type GateDecision = 'allow' | 'awaiting-confirmation';

/** 执行前的门控判定：cron 与手动共用；awaiting 时 cron 跳过、手动拒绝。 */
export function gateDecision(t: TaskRow, defaultPermission: PermissionPreset): GateDecision {
  if (!needsConfirm(t, defaultPermission)) return 'allow';
  return isConfirmed(t) ? 'allow' : 'awaiting-confirmation';
}

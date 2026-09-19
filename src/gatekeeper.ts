/**
 * 权限确认门：有效权限高于默认档（或默认档本身非 read-only）的任务，
 * cron 无人值守执行前须一次性人工确认；指纹覆盖 prompt/权限/预设/工作区，
 * 任一变更即失效重新武装（调度器与 runner 双重检查）。
 */
import type { PermissionPreset, TaskRow } from './contract.js';
import { sha256 } from './util.js';

/** 指纹 = sha256(JSON([prompt, permission, presetId, workspaceId]))。 */
export function confirmFingerprint(task: TaskRow): string {
  const material = [
    task.prompt,
    task.pinned.permission ?? null,
    task.pinned.presetId ?? null,
    task.pinned.workspaceId ?? null,
  ];
  return sha256(JSON.stringify(material));
}

/** 是否需要确认：有效权限 ≠ 默认档，或默认档非 read-only。 */
export function needsConfirm(task: TaskRow, defaultPermission: PermissionPreset): boolean {
  const effective = task.pinned.permission ?? defaultPermission;
  return effective !== defaultPermission || defaultPermission !== 'read-only';
}

/** 指纹仍然匹配的已确认状态。 */
export function isConfirmed(task: TaskRow): boolean {
  return task.confirm !== null && task.confirm.fingerprint === confirmFingerprint(task);
}

export function gateDecision(task: TaskRow, defaultPermission: PermissionPreset): 'allow' | 'awaiting-confirmation' {
  if (!needsConfirm(task, defaultPermission)) return 'allow';
  return isConfirmed(task) ? 'allow' : 'awaiting-confirmation';
}

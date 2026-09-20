/**
 * Host↔Client RPC 类型契约（唯一事实源）：**仅类型**，两端 import type 引用，
 * esbuild 构建期被擦除，不产生运行时依赖。字段与 src/rpc.ts 的手工校验一一对应。
 */

export type PermissionPreset = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface PushTargetRef {
  botId: string;
  targetId: string;
}

export interface TaskPinned {
  workspaceId?: string;
  presetId?: string;
  permission?: PermissionPreset;
}


export type ExecutionStatus = 'running' | 'success' | 'failed' | 'timeout' | 'canceled';

export interface PushRecord {
  state: 'sent' | 'failed' | 'skipped' | 'disabled';
  attempts: number;
  channel?: 'service' | 'http';
  lastError?: string;
}

export interface Execution {
  id: string;
  trigger: 'manual' | 'cron';
  sessionId: string;
  status: ExecutionStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  exitReason?: string;
  summary?: string;
  resultPath?: string;
  push?: PushRecord;
}

export interface ConfirmState {
  fingerprint: string;
  confirmedAt: string;
}

/** 任务标签：名称必填；执行提示非空时在每次执行前注入到任务 Prompt 之前。 */
export interface TaskTag {
  name: string;
  promptPrefix?: string;
}

export interface PushTestRecord {
  ok: boolean;
  error?: string;
  at: string;
  channel: 'service' | 'http';
}

export interface TaskRow {
  id: string;
  title: string;
  prompt: string;
  cron: string;
  enabled: boolean;
  pinned: TaskPinned;
  push: PushTargetRef | null;
  confirm: ConfirmState | null;
  nextRunAt: string | null;
  lastSkipReason: string | null;
  lastPushTest: PushTestRecord | null;
  /** 延续会话：上次执行成功进入的会话 id；下次执行 resume 该会话而非新建（2026-09-19 用户要求）。 */
  activeSessionId?: string;
  /** 会话复用开关（默认 true）：关闭后每次执行都新建会话。 */
  reuseSession?: boolean;
  /** 归档：只读保留，不参与调度与手动执行，可恢复。 */
  archived?: boolean;
  /** 任务标签（≤8）：分类徽章 + 筛选 + 执行提示注入。 */
  tags?: TaskTag[];
  createdAt: string;
  updatedAt: string;
  executions: Execution[];
}

export interface TaskView extends TaskRow {
  needsConfirm: boolean;
  confirmed: boolean;
  running: boolean;
}

export interface SchedulerView {
  tickMs: number;
  runningTaskIds: string[];
}

export interface PushChannelView {
  mode: 'service' | 'http' | 'unavailable';
  detail: string;
}

export interface BoardSnapshot {
  revision: number;
  serverTime: string;
  tasks: TaskView[];
  scheduler: SchedulerView;
  pushChannel: PushChannelView;
}

export interface MetaWorkspace {
  id: string;
  title: string;
  path?: string;
}

export interface MetaPreset {
  id: string;
  title: string;
}

export interface MetaBot {
  botId: string;
  channel?: string;
  title?: string;
}

export interface MetaTarget {
  botId: string;
  targetId: string;
  name?: string;
  kind?: string;
}

export interface MetaView {
  workspaces: MetaWorkspace[];
  presets: MetaPreset[];
  bots: MetaBot[];
  targets: MetaTarget[];
  pushAvailable: boolean;
  pushMode: 'service' | 'http' | 'unavailable';
}

export interface SettingsView {
  defaultPush: PushTargetRef | null;
  httpPort: number;
  retryMax: number;
  schedulerTickMs: number;
  runTimeoutMin: number;
  resultsKeepPerTask: number;
  executionsKeepPerTask: number;
  dataDir: string;
}

export interface TaskDraft {
  id?: string;
  title: string;
  prompt: string;
  cron: string;
  enabled: boolean;
  pinned?: TaskPinned;
  push?: PushTargetRef | null;
  reuseSession?: boolean;
  tags?: TaskTag[];
}

export type CronBoardEndpoint =
  | 'cron-board/state'
  | 'cron-board/meta'
  | 'cron-board/settings'
  | 'cron-board/settings-set'
  | 'cron-board/task-upsert'
  | 'cron-board/task-delete'
  | 'cron-board/task-run'
  | 'cron-board/task-toggle'
  | 'cron-board/task-confirm'
  | 'cron-board/task-archive'
  | 'cron-board/task-restore'
  | 'cron-board/parse-prompt'
  | 'cron-board/push-test'
  | 'cron-board/push-retry'
  | 'cron-board/exec-result';

export interface CronBoardRequestMap {
  'cron-board/state': Record<string, never>;
  'cron-board/meta': Record<string, never>;
  'cron-board/settings': Record<string, never>;
  'cron-board/settings-set': { defaultPush?: PushTargetRef | null };
  'cron-board/task-upsert': { task: TaskDraft };
  'cron-board/task-delete': { id: string };
  'cron-board/task-run': { id: string };
  'cron-board/task-toggle': { id: string; enabled: boolean };
  'cron-board/task-confirm': { id: string };
  'cron-board/task-archive': { id: string };
  'cron-board/task-restore': { id: string };
  'cron-board/parse-prompt': { text: string };
  'cron-board/push-test': { id: string };
  'cron-board/push-retry': { taskId: string; execId: string };
  'cron-board/exec-result': { taskId: string; execId: string };
}

export interface CronBoardResponseMap {
  'cron-board/state': BoardSnapshot;
  'cron-board/meta': MetaView;
  'cron-board/settings': SettingsView;
  'cron-board/settings-set': SettingsView;
  'cron-board/task-upsert': BoardSnapshot;
  'cron-board/task-delete': BoardSnapshot;
  'cron-board/task-run': BoardSnapshot;
  'cron-board/task-toggle': BoardSnapshot;
  'cron-board/task-confirm': BoardSnapshot;
  'cron-board/task-archive': BoardSnapshot;
  'cron-board/task-restore': BoardSnapshot;
  'cron-board/parse-prompt': { title?: string; prompt?: string; cron?: string };
  'cron-board/push-test': BoardSnapshot;
  'cron-board/push-retry': BoardSnapshot;
  'cron-board/exec-result': { markdown: string };
}

/** 宿主 rpc 层的统一信封。 */
export type RpcEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

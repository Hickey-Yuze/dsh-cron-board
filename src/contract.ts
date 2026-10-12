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
  /** 任务图片 durable 引用（附件服务权威，JSON 原样存；执行时随 Prompt 发给模型）。 */
  promptImageRefs?: unknown[];
  /** 任务会话徽标（缺省=琥珀日历时钟）。 */
  badge?: TaskBadge;
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

/** 任务图片输入（base64；host 经附件服务入库换 durable ref）。 */
export interface PromptImageInput {
  name?: string;
  mediaType: string;
  /** 规范 base64（不含 data: 前缀）。 */
  data: string;
}

/** 预设徽标图标（24×24 stroke path，key → path 段数组；client/server 共用白名单）。 */
export const BADGE_ICONS: Record<string, readonly string[]> = {
  clock: ['M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3', 'M3 10h18', 'M8 2v4', 'M16 2v4', 'M17 15v2l1.5 1.5', 'M17 12a5 5 0 1 0 0 10 5 5 0 1 0 0-10'],
  bot: ['M12 8V4', 'M8 4h8', 'M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z', 'M9 13h.01', 'M15 13h.01'],
  mail: ['M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z', 'm22 7-10 6L2 7'],
  chart: ['M3 3v16a2 2 0 0 0 2 2h16', 'M7 15v-3', 'M12 15V7', 'M17 15v-5'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'],
  star: ['M12 3l2.7 5.4 6 .9-4.35 4.2 1 6L12 16.8 6.65 19.5l1-6L3.3 9.3l6-.9L12 3Z'],
  folder: ['M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8Z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21v-1a8 8 0 0 1 16 0v1'],
  doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M9 13h6', 'M9 17h6'],
};

/** 预设徽标色板（key → 色值；icon 徽标的 stroke/mask 着色）。 */
export const BADGE_COLORS: Record<string, string> = {
  amber: '#F59E0B',
  sky: '#38BDF8',
  green: '#34D399',
  violet: '#A78BFA',
  red: '#F87171',
  cyan: '#22D3EE',
  pink: '#F472B6',
  gray: '#94A3B8',
};

/** 上传徽标图标的 mediaType 白名单与 base64 体积上限（64KB 解码后）。 */
export const BADGE_IMAGE_TYPES = ['image/png', 'image/svg+xml', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'] as const;
export const BADGE_IMAGE_MAX_BYTES = 64 * 1024;

/** 任务会话徽标：侧边栏该任务所有会话 title 前的标识；缺省=琥珀日历时钟。 */
export type TaskBadge =
  | { kind: 'emoji'; value: string }
  | { kind: 'icon'; value: string; color?: string }
  | { kind: 'image'; mediaType: string; data: string };

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
  /** 任务图片（≤4 张）。undefined=不变；[]=清空；非空=全量替换。 */
  images?: PromptImageInput[];
  /** 任务图片 durable 引用（复制任务场景：原样引用源任务的不可变附件对象）。 */
  imageRefs?: unknown[];
  /** 任务会话徽标。undefined=不变；null=恢复默认琥珀时钟；对象=设置。 */
  badge?: TaskBadge | null;
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
  | 'cron-board/exec-result'
  | 'cron-board/session-ids';

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
  'cron-board/session-ids': Record<string, never>;
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
  'cron-board/session-ids': SessionBadgesResult;
}

/**
 * 会话渠道徽标兜底数据：账本内全部 cron-board 会话 id（activeSessionId + 历次执行）
 * → 该会话所属任务的自定义徽标；不在 map = 非 cron-board 会话；值为 null = 任务无自定义徽标（默认时钟）。
 */
export interface SessionBadgesResult {
  map: Record<string, TaskBadge | null>;
}

/** 宿主 rpc 层的统一信封。 */
export type RpcEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

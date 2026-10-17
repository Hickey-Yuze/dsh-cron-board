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
  /** 插件版本（读 package.json；头部版本徽章展示，缺失为空串）。 */
  version: string;
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
export const BADGE_HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** 徽标颜色统一解析：BADGE_COLORS key → 表值；#RRGGBB hex → 原样；其他 → 缺省。server/client 共用。 */
export function resolveBadgeColor(color: string | undefined, fallback = '#F59E0B'): string {
  if (color === undefined) return fallback;
  const keyed = BADGE_COLORS[color];
  if (keyed !== undefined) return keyed;
  if (BADGE_HEX_RE.test(color)) return color;
  return fallback;
}

/** dsh-im 渠道徽标同款图标（自 @xmanrui/dsh-im channel-logos.js 提取）：part.fill 缺省=currentColor（随徽标色），fill:'none'+strokeColor=描边，固定色=品牌原色。 */
export type ImBadgeIconPart = { d: string; fill?: string; strokeColor?: string; strokeWidth?: number };
export const IM_BADGE_ICONS: Record<string, { viewBox: string; parts: ReadonlyArray<ImBadgeIconPart> }> = {
  weixin: { viewBox: '0 0 24 24', parts: [{ d: 'M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z' }] },
  feishu: { viewBox: '0 0 24 24', parts: [{ d: 'M7.2 4.5h7.6c1.2 0 2.1.55 2.7 1.58 1.05 1.8 1.55 3.45 1.58 4.95-2.04-.62-4.2-.15-6.22 1.45C11.3 9.7 9.42 7.04 7.2 4.5Z', fill: '#00D6B9' }, { d: 'M10.8 13.55c3.3-2.93 5.72-4.24 9.47-2.52-1.2 1.45-2.27 4.18-3.86 5.43-1.67 1.31-3.9.5-5.61-.64v-2.27Z', fill: '#1456B8' }, { d: 'M4.4 8.35c3.47 3.61 7.25 6.1 10.33 5.7 1.06-.14 2.2-.72 3.4-1.72-1.04 2.65-2.6 4.8-5.06 6-2.46 1.2-5.56.52-7.42-.72A2.76 2.76 0 0 1 4.4 15.3V8.35Z', fill: '#3370FF' }] },
  dingtalk: { viewBox: '0 0 48 48', parts: [{ d: 'M37.05 22.783c-6.758-5.216-14.378-12.128-22.73-19.538-.655-.585-1.242-.354-1.536.42-1.88 4.973-.058 9.386 2.889 11.932s7.368 4.912 10.058 6.155c.105.049.013.203-.093.163-4.953-2.182-8.397-3.765-13.07-7.368-.497-.388-1.01-.242-1.07.521-.384 4.748 2.657 8.483 6.058 9.745 2.1.781 4.398 1.212 6.53 1.474.109.015.084.178-.027.178-2.747.01-6.058-.654-8.935-1.751-.606-.233-.818.25-.722.633.491 2.008 2.974 5.076 6.926 5.73a12 12 0 0 0 2.228.115c.164 0 .208.089.154.217q-2.685 4.6-2.803 4.797c-.091.152-.036.275.156.275h3.543c.164 0 .264.106.18.246l-4.958 8.196c-.191.328.035.565.395.301s15.212-11.133 15.636-11.448c.195-.142.148-.327-.124-.327h-3.18c-.206 0-.252-.14-.111-.28.14-.141 3.602-3.594 4.837-4.888 1.283-1.35 1.938-3.825-.231-5.498' }] },
  qq: { viewBox: '0 0 24 24', parts: [{ d: 'M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673' }] },
  wecom: { viewBox: '0 0 24 24', parts: [{ d: 'M17.7 14.5c1.05-1.12 1.65-2.52 1.65-4.03 0-3.82-3.58-6.92-8-6.92s-8 3.1-8 6.92 3.58 6.92 8 6.92c1.17 0 2.28-.22 3.28-.62', fill: 'none', strokeColor: '#3370FF', strokeWidth: 2.35 }, { d: 'M16.1 15.15c.7-.7 1.83-.7 2.53 0s.7 1.83 0 2.53-1.83.7-2.53 0-.7-1.83 0-2.53Z', fill: '#07C160' }, { d: 'M19.25 13.45a1.36 1.36 0 1 1 1.92 1.92 1.36 1.36 0 0 1-1.92-1.92Z', fill: '#FFB800' }, { d: 'M19.55 18.05a1.16 1.16 0 1 1 1.64 1.64 1.16 1.16 0 0 1-1.64-1.64Z', fill: '#FF7A00' }, { d: 'M15.25 18.75a.92.92 0 1 1 1.3 1.3.92.92 0 0 1-1.3-1.3Z', fill: '#3370FF' }] },
  telegram: { viewBox: '0 0 24 24', parts: [{ d: 'M23.95 4.57c-.36-1.45-1.43-1.76-2.82-1.24L1.5 10.9c-1.34.52-1.32 1.27-.24 1.6l5.03 1.57 11.66-7.36c.55-.34 1.05-.16.64.21l-9.44 8.52-.37 5.12c.54 0 .78-.24 1.08-.53l2.59-2.51 5.38 3.97c.99.55 1.7.27 1.95-.92L23.95 4.57Z' }] },
  discord: { viewBox: '0 0 24 24', parts: [{ d: 'M20.32 4.37a19.8 19.8 0 0 0-4.89-1.51c-.21.38-.46.89-.63 1.29a18.4 18.4 0 0 0-5.59 0 13 13 0 0 0-.64-1.29c-1.71.29-3.36.8-4.89 1.52C.59 9.09-.25 13.68.17 18.2a19.9 19.9 0 0 0 6 3.04c.48-.66.91-1.36 1.28-2.1-.7-.26-1.37-.58-2-.96.17-.12.33-.25.49-.38 3.86 1.79 8.04 1.79 11.86 0 .16.13.32.26.49.38-.64.38-1.31.7-2.01.97.37.73.8 1.44 1.28 2.09a19.8 19.8 0 0 0 6-3.04c.49-5.24-.84-9.79-3.24-13.83ZM8.02 15.42c-1.16 0-2.11-1.07-2.11-2.38s.93-2.38 2.11-2.38c1.18 0 2.13 1.08 2.11 2.38 0 1.31-.93 2.38-2.11 2.38Zm7.95 0c-1.16 0-2.11-1.07-2.11-2.38s.93-2.38 2.11-2.38c1.18 0 2.13 1.08 2.11 2.38 0 1.31-.93 2.38-2.11 2.38Z' }] },
  slack: { viewBox: '0 0 100 100', parts: [{ d: 'M36.5 0A10.5 10.5 0 0 0 36.5 21H47V10.5A10.5 10.5 0 0 0 36.5 0ZM10.5 26a10.5 10.5 0 0 0 0 21h26a10.5 10.5 0 0 0 0-21Z', fill: '#36C5F0' }, { d: 'M100 36.5A10.5 10.5 0 0 0 79 36.5V47h10.5A10.5 10.5 0 0 0 100 36.5ZM74 10.5a10.5 10.5 0 0 0-21 0v26a10.5 10.5 0 0 0 21 0Z', fill: '#2EB67D' }, { d: 'M63.5 100a10.5 10.5 0 0 0 0-21H53v10.5A10.5 10.5 0 0 0 63.5 100ZM89.5 74a10.5 10.5 0 0 0 0-21h-26a10.5 10.5 0 0 0 0 21Z', fill: '#ECB22E' }, { d: 'M0 63.5a10.5 10.5 0 0 0 21 0V53H10.5A10.5 10.5 0 0 0 0 63.5ZM26 89.5a10.5 10.5 0 0 0 21 0v-26a10.5 10.5 0 0 0-21 0Z', fill: '#E01E5A' }] },
  whatsapp: { viewBox: '0 0 24 24', parts: [{ d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.149-.173.198-.297.298-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.83 9.83 0 0 1 2.893 6.991c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.8 11.8 0 0 0 12.055 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.688 1.448h.005c6.557 0 11.892-5.335 11.895-11.893a11.82 11.82 0 0 0-3.486-8.413' }] },
  imessage: { viewBox: '0 0 24 24', parts: [{ d: 'M12 2.5C5.65 2.5.5 6.66.5 11.8c0 2.76 1.49 5.24 3.85 6.94.28 1.34-.35 2.76-1.6 4.01 2.1-.2 3.87-.86 5.26-1.85 1.25.4 2.6.62 3.99.62 6.35 0 11.5-4.35 11.5-9.72S18.35 2.5 12 2.5Z' }] },
  matrix: { viewBox: '0 0 24 24', parts: [{ d: 'M4 4h16a2.4 2.4 0 0 1 2.4 2.4v8.2A2.4 2.4 0 0 1 20 17h-7.55l-4.2 3.3a.6.6 0 0 1-.98-.47V17H4A2.4 2.4 0 0 1 1.6 14.6V6.4A2.4 2.4 0 0 1 4 4Zm3 4.1a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9Zm5.6 0a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9Zm5.6 0a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9Z' }] },
  office: { viewBox: '0 0 24 24', parts: [{ d: 'M4 3.5h10.5a2 2 0 0 1 2 2v13H4v-15Zm2.2 3v1.8h2V6.5h-2Zm4.1 0v1.8h2V6.5h-2Zm-4.1 4v1.8h2v-1.8h-2Zm4.1 0v1.8h2v-1.8h-2ZM8.4 15v3.5h3V15h-3Z' }, { d: 'M18.3 8.2h1.5v3h3v1.5h-3v3h-1.5v-3h-3v-1.5h3v-3Z' }] },
  email: { viewBox: '0 0 24 24', parts: [{ d: 'M3.2 5.6h17.6c.66 0 1.2.54 1.2 1.2v10.4c0 .66-.54 1.2-1.2 1.2H3.2A1.2 1.2 0 0 1 2 17.2V6.8c0-.66.54-1.2 1.2-1.2Zm.9 1.7v.28L12 12.3l7.9-4.72V7.3H4.1Zm15.8 2.02-7.42 4.43a1 1 0 0 1-1.06 0L4.1 9.32v7.78h15.8V9.32Z' }] },
};

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

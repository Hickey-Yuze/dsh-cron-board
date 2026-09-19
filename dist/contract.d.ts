/**
 * RPC 契约单一事实源（types-only，零运行时代码）。
 * client 经 `import type` 引用（esbuild 构建期擦除）；扩端点先改这里，
 * host/client 两侧编译器（pnpm run typecheck 双链）会追着改。
 *
 * 安全约定：所有变更载荷为严格判别联合中的显式字段；协议不含命令、
 * 可执行路径、shell 文本或任意参数字段；载荷上限在 host rpc.ts 强制校验。
 */
export type PermissionPreset = 'read-only' | 'workspace-write' | 'danger-full-access';
export interface PushTargetRef {
    botId: string;
    targetId: string;
}
export interface TaskPinned {
    workspaceId?: string;
    presetId?: string;
    /** 权限档；缺省 = 跟随部署默认（defaultPermission，通常 read-only）。 */
    permission?: PermissionPreset;
}
export type ExecutionStatus = 'running' | 'success' | 'failed' | 'timeout';
export type ExecutionTrigger = 'manual' | 'cron';
export interface PushRecord {
    state: 'sent' | 'failed' | 'skipped' | 'disabled';
    attempts: number;
    channel?: 'service' | 'http';
    lastError?: string;
    at?: string;
}
export interface Execution {
    id: string;
    trigger: ExecutionTrigger;
    sessionId: string;
    status: ExecutionStatus;
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    /** 终态来源：turn/end 的 reason.kind（completed/error/aborted/interrupted/timeout）。 */
    exitReason?: string;
    /** 结果一句话摘要（推送简讯同源）。 */
    summary?: string;
    resultPath?: string;
    push?: PushRecord;
}
export interface ConfirmState {
    fingerprint: string;
    confirmedAt: string;
}
export interface PushTestRecord {
    ok: boolean;
    error?: string;
    at: string;
    channel?: 'service' | 'http';
}
/** 任务存储行（ledger 持久化形态）。 */
export interface TaskRow {
    id: string;
    title: string;
    prompt: string;
    cron: string;
    enabled: boolean;
    pinned: TaskPinned;
    push?: PushTargetRef | null;
    confirm?: ConfirmState | null;
    nextRunAt?: string | null;
    lastSkipReason?: string | null;
    lastPushTest?: PushTestRecord | null;
    createdAt: string;
    updatedAt: string;
    executions: Execution[];
}
/** 任务视图（snapshot 返回形态 = 存储行 + 派生标志）。 */
export interface TaskView extends TaskRow {
    needsConfirm: boolean;
    confirmed: boolean;
    running: boolean;
}
export interface SchedulerView {
    tickMs: number;
    lastTickAt?: string;
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
    channel: string;
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
    pushMode: PushChannelView['mode'];
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
}
export type CronBoardEndpoint = 'cron-board/state' | 'cron-board/meta' | 'cron-board/settings' | 'cron-board/settings-set' | 'cron-board/task-upsert' | 'cron-board/task-delete' | 'cron-board/task-run' | 'cron-board/task-toggle' | 'cron-board/task-confirm' | 'cron-board/push-test' | 'cron-board/push-retry' | 'cron-board/exec-result';
export interface CronBoardRequestMap {
    'cron-board/state': Record<string, never>;
    'cron-board/meta': Record<string, never>;
    'cron-board/settings': Record<string, never>;
    'cron-board/settings-set': {
        defaultPush?: PushTargetRef | null;
    };
    'cron-board/task-upsert': {
        task: TaskDraft;
    };
    'cron-board/task-delete': {
        id: string;
    };
    'cron-board/task-run': {
        id: string;
    };
    'cron-board/task-toggle': {
        id: string;
        enabled: boolean;
    };
    'cron-board/task-confirm': {
        id: string;
    };
    'cron-board/push-test': {
        id: string;
    };
    'cron-board/push-retry': {
        taskId: string;
        execId: string;
    };
    'cron-board/exec-result': {
        taskId: string;
        execId: string;
    };
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
    'cron-board/push-test': BoardSnapshot;
    'cron-board/push-retry': BoardSnapshot;
    'cron-board/exec-result': {
        markdown: string;
    };
}
/** RPC 信封（镜像宿主 dsh-host-apiproxy 的 RpcResult 形状）。 */
export type RpcEnvelope<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
};

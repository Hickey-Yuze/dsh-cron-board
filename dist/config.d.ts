/**
 * 插件配置：Schemastery schema（导出名必须是 `Config`——cordis 运行时只读
 * plugin.Config 做校验与默认值填充；导出 `schema` 会被静默忽略，导致
 * config 为 undefined → apply 抛错 → fiber FAILED → 宿主启动失败）。
 */
import Schema from '@deepseek-ai/schemastery';
import type { PermissionPreset } from './contract.js';
export interface PushConfig {
    httpPort: number;
    retryMax: number;
}
export interface CronBoardConfig {
    dataDir: string;
    schedulerTickMs: number;
    runTimeoutMin: number;
    resultsKeepPerTask: number;
    executionsKeepPerTask: number;
    defaultPermission: PermissionPreset;
    push: PushConfig;
}
export declare const cronBoardSchema: Schema<Schemastery.ObjectS<{
    dataDir: Schema<string, string>;
    schedulerTickMs: Schema<number, number>;
    runTimeoutMin: Schema<number, number>;
    resultsKeepPerTask: Schema<number, number>;
    executionsKeepPerTask: Schema<number, number>;
    defaultPermission: Schema<"read-only" | "workspace-write" | "danger-full-access", "read-only" | "workspace-write" | "danger-full-access">;
    push: Schema<Schemastery.ObjectS<{
        httpPort: Schema<number, number>;
        retryMax: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        httpPort: Schema<number, number>;
        retryMax: Schema<number, number>;
    }>>;
}>, Schemastery.ObjectT<{
    dataDir: Schema<string, string>;
    schedulerTickMs: Schema<number, number>;
    runTimeoutMin: Schema<number, number>;
    resultsKeepPerTask: Schema<number, number>;
    executionsKeepPerTask: Schema<number, number>;
    defaultPermission: Schema<"read-only" | "workspace-write" | "danger-full-access", "read-only" | "workspace-write" | "danger-full-access">;
    push: Schema<Schemastery.ObjectS<{
        httpPort: Schema<number, number>;
        retryMax: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        httpPort: Schema<number, number>;
        retryMax: Schema<number, number>;
    }>>;
}>>;
/** 显式注解类型：pnpm 符号链接布局下防 TS2742 声明发射可移植性错误。 */
export declare const Config: Schema<any, CronBoardConfig>;
/** 数据目录解析：显式配置优先，否则 $DSH_HOME/cron-board（勿自己拼 HOME 之外的路径）。 */
export declare function resolveDataDir(config: CronBoardConfig): string;

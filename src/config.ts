/**
 * 插件配置：Schemastery schema（导出名必须是 `Config`——cordis 运行时只读
 * plugin.Config 做校验与默认值填充；导出 `schema` 会被静默忽略，导致
 * config 为 undefined → apply 抛错 → fiber FAILED → 宿主启动失败）。
 */
import Schema from '@deepseek-ai/schemastery';
import * as os from 'node:os';
import * as path from 'node:path';
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

export const cronBoardSchema = Schema.object({
  dataDir: Schema.string().default('').description('数据目录（默认 $DSH_HOME/cron-board）'),
  schedulerTickMs: Schema.number().min(5000).max(600000).default(30000).description('调度 tick 间隔（毫秒）'),
  runTimeoutMin: Schema.number().min(1).max(1440).default(60).description('单次执行超时（分钟）'),
  resultsKeepPerTask: Schema.number().min(1).max(200).default(20).description('每任务结果文件保留份数'),
  executionsKeepPerTask: Schema.number().min(1).max(200).default(20).description('每任务执行历史保留条数'),
  defaultPermission: Schema.union(['read-only', 'workspace-write', 'danger-full-access'] as const)
    .default('read-only')
    .description('任务未钉住权限时的默认权限档'),
  push: Schema.object({
    httpPort: Schema.number().min(1).max(65535).default(3080).description('dshIm 服务缺失时的 HTTP 回退端口'),
    retryMax: Schema.number().min(0).max(10).default(3).description('推送失败重试上限（退避 1s/2s/4s…）'),
  }),
});

/** 显式注解类型：pnpm 符号链接布局下防 TS2742 声明发射可移植性错误。 */
export const Config: Schema<any, CronBoardConfig> = cronBoardSchema;

/** 数据目录解析：显式配置优先，否则 $DSH_HOME/cron-board（勿自己拼 HOME 之外的路径）。 */
export function resolveDataDir(config: CronBoardConfig): string {
  if (config.dataDir && config.dataDir.trim() !== '') return config.dataDir;
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh');
  return path.join(home, 'cron-board');
}

/**
 * 配置 schema（Schemastery）。导出名必须是 `Config`——cordis 运行时按名读取插件配置声明。
 */
import Schema from '@deepseek-ai/schemastery';
import * as path from 'node:path';
import * as os from 'node:os';

export interface CronBoardConfig {
  dataDir?: string;
  schedulerTickMs: number;
  runTimeoutMin: number;
  resultsKeepPerTask: number;
  executionsKeepPerTask: number;
  defaultPermission: 'read-only' | 'workspace-write' | 'danger-full-access';
  push: {
    httpPort: number;
    retryMax: number;
  };
}

export const cronBoardSchema = Schema.intersect([
  Schema.object({
    dataDir: Schema.string().role('folder').description('数据目录（缺省 $DSH_HOME/cron-board）'),
    schedulerTickMs: Schema.number().default(30000).description('调度扫描间隔（毫秒）'),
    runTimeoutMin: Schema.number().default(60).description('单次执行超时（分钟）'),
    resultsKeepPerTask: Schema.number().default(20).description('每任务结果文件保留数'),
    executionsKeepPerTask: Schema.number().default(50).description('每任务执行记录保留数'),
    defaultPermission: Schema.union(['read-only', 'workspace-write', 'danger-full-access']).default('read-only').description('默认权限档（确认门基准）'),
  }).description('调度与保留'),
  Schema.object({
    push: Schema.object({
      httpPort: Schema.number().default(3080).description('dsh-im HTTP 回退端口'),
      retryMax: Schema.number().default(3).description('推送重试上限'),
    }).description('推送'),
  }),
]) as unknown as Schema<any, CronBoardConfig>;

/** 导出名固定为 Config（cordis 按名读取）。 */
export const Config: Schema<any, CronBoardConfig> = cronBoardSchema;

/** 解析数据目录：显式配置 > $DSH_HOME/cron-board > ~/.dsh/cron-board。 */
export function resolveDataDir(config: CronBoardConfig): string {
  if (config.dataDir && config.dataDir.trim() !== '') return config.dataDir;
  const dshHome = process.env.DSH_HOME;
  if (dshHome && dshHome.trim() !== '') return path.join(dshHome, 'cron-board');
  return path.join(os.homedir(), '.dsh', 'cron-board');
}

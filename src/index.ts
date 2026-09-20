/**
 * dsh-cron-board — 定时任务看板插件（持久组合插件）。
 *
 * 功能：
 * - 四列看板（草稿/已排程/运行中/最近执行）管理 cron 定时 agent 会话任务；
 * - Host 权威账本 + 调度器：错过不补跑、任务不并发、执行历史有界；
 * - 真实执行：agentLoop 新建会话 → 钉住工作区/预设/权限 → followup 发任务 Prompt
 *   → turn/end 终态结算；
 * - 权限确认门：高于默认权限档的任务首次 cron 触发前须人工确认，变更重新武装；
 * - 推送：执行终态简讯经 dshIm 服务（或 HTTP 回退）推送 dsh-im 机器人，结果落盘可回看。
 *
 * 数据目录：$DSH_HOME/cron-board/（独立于宿主 .dsh/cron 与他人插件的 task-board）。
 * 存储初始化失败只降级不崩溃：数据目录不可写时插件停用，宿主必须照常启动。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import { Config, resolveDataDir, type CronBoardConfig } from './config.js';
import { LedgerStore } from './ledger.js';
import { createAiParser } from './parse.js';
import { Pusher, type DshImLike } from './pusher.js';
import { ResultStore } from './results.js';
import { buildSnapshot, registerRpc, type RpcDeps } from './rpc.js';
import { TaskRunner } from './runner.js';
import { Scheduler } from './scheduler.js';
import { ensureDir, errDetail } from './util.js';

export const name = 'dsh-cron-board';

/** 硬依赖：执行引擎。dshIm/connection 等可选能力一律 ctx.get 软探测。 */
export const inject = ['agentLoop'];

/** 配置 schema：导出名必须是 `Config`（cordis 运行时按名读取，见 config.ts 注释）。 */
export { Config };

export async function apply(ctx: Context, config: CronBoardConfig): Promise<void> {
  const log = {
    debug: (m: string) => ctx.logger.debug(m),
    info: (m: string) => ctx.logger.info(m),
    warn: (m: string) => ctx.logger.warn(m),
    error: (m: string) => ctx.logger.error(m),
  };

  const dataDir = resolveDataDir(config);
  // 回填解析后的目录供设置页展示
  (config as { dataDir: string }).dataDir = dataDir;

  // 存储初始化失败只降级：数据目录不可写时插件停用，宿主照常启动
  try {
    await ensureDir(dataDir);
  } catch (err) {
    log.error(`[cron-board] 数据目录不可写，插件停用: ${dataDir} (${errDetail(err)})`);
    return;
  }

  const ledger = new LedgerStore(dataDir, config.executionsKeepPerTask, log);
  try {
    await ledger.init();
  } catch (err) {
    log.error(`[cron-board] 账本初始化失败，插件停用: ${errDetail(err)}`);
    return;
  }

  const results = new ResultStore(dataDir);
  const pusher = new Pusher(
    () => ctx.get('dshIm') as unknown as DshImLike | undefined,
    { httpPort: config.push.httpPort, retryMax: config.push.retryMax },
    log,
  );
  const runner = new TaskRunner(ctx, ledger, results, pusher, config, log);
  const scheduler = new Scheduler(
    ledger,
    runner,
    { tickMs: config.schedulerTickMs, defaultPermission: config.defaultPermission },
    log,
  );

  const deps: RpcDeps = {
    ledger,
    runner,
    results,
    pusher,
    config,
    log,
    buildSnapshot: () => buildSnapshot(deps),
    parsePrompt: createAiParser(ctx, log).parse,
  };

  // 注册期抛错会杀插件 fiber：RPC 挂载内部自兜底，这里再套一层
  try {
    registerRpc(ctx, deps);
  } catch (err) {
    log.error(`[cron-board] RPC 注册失败: ${errDetail(err)}`);
  }

  // 重启对账（确定性恢复）：在途执行转观察或取消，绝不重发
  try {
    await runner.reconcileStartup();
  } catch (err) {
    log.error(`[cron-board] 重启对账失败（非致命）: ${errDetail(err)}`);
  }

  ctx.effect(() => {
    const stopScheduler = scheduler.start();
    return () => {
      stopScheduler();
      runner.cancelAll();
    };
  });

  const channel = pusher.channelView();
  log.info(
    `[cron-board] 已启动（tick=${config.schedulerTickMs}ms，默认权限=${config.defaultPermission}，推送=${channel.mode}）。数据目录: ${dataDir}`,
  );
}

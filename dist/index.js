import { Config, resolveDataDir } from './config.js';
import { LedgerStore } from './ledger.js';
import { Pusher } from './pusher.js';
import { ResultStore } from './results.js';
import { buildSnapshot, registerRpc } from './rpc.js';
import { TaskRunner } from './runner.js';
import { Scheduler } from './scheduler.js';
import { ensureDir, errDetail } from './util.js';
export const name = 'dsh-cron-board';
/** 硬依赖：执行引擎。dshIm/connection 等可选能力一律 ctx.get 软探测。 */
export const inject = ['agentLoop'];
/** 配置 schema：导出名必须是 `Config`（cordis 运行时按名读取，见 config.ts 注释）。 */
export { Config };
export async function apply(ctx, config) {
    const log = {
        debug: (m) => ctx.logger.debug(m),
        info: (m) => ctx.logger.info(m),
        warn: (m) => ctx.logger.warn(m),
        error: (m) => ctx.logger.error(m),
    };
    const dataDir = resolveDataDir(config);
    // 回填解析后的目录供设置页展示
    config.dataDir = dataDir;
    // 存储初始化失败只降级：数据目录不可写时插件停用，宿主照常启动
    try {
        await ensureDir(dataDir);
    }
    catch (err) {
        log.error(`[cron-board] 数据目录不可写，插件停用: ${dataDir} (${errDetail(err)})`);
        return;
    }
    const ledger = new LedgerStore(dataDir, config.executionsKeepPerTask, log);
    try {
        await ledger.init();
    }
    catch (err) {
        log.error(`[cron-board] 账本初始化失败，插件停用: ${errDetail(err)}`);
        return;
    }
    const results = new ResultStore(dataDir);
    const pusher = new Pusher(() => ctx.get('dshIm'), { httpPort: config.push.httpPort, retryMax: config.push.retryMax }, log);
    const runner = new TaskRunner(ctx, ledger, results, pusher, config, log);
    const scheduler = new Scheduler(ledger, runner, { tickMs: config.schedulerTickMs, defaultPermission: config.defaultPermission }, log);
    const deps = {
        ledger,
        runner,
        results,
        pusher,
        config,
        log,
        buildSnapshot: () => buildSnapshot(deps),
    };
    // 注册期抛错会杀插件 fiber：RPC 挂载内部自兜底，这里再套一层
    try {
        registerRpc(ctx, deps);
    }
    catch (err) {
        log.error(`[cron-board] RPC 注册失败: ${errDetail(err)}`);
    }
    ctx.effect(() => {
        const stopScheduler = scheduler.start();
        return () => {
            stopScheduler();
            runner.cancelAll();
        };
    });
    const channel = pusher.channelView();
    log.info(`[cron-board] 已启动（tick=${config.schedulerTickMs}ms，默认权限=${config.defaultPermission}，推送=${channel.mode}）。数据目录: ${dataDir}`);
}

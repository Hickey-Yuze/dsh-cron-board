/**
 * 配置 schema（Schemastery）。导出名必须是 `Config`——cordis 运行时按名读取插件配置声明。
 *
 * 【竞态规避 · 2026-10-09 宿主日志实证】schemastery 的 CJS 入口（lib/index.cjs）在模块
 * 加载期会同步 require ESM 的 cosmokit；当本插件入口在宿主 Promise.all 导入波次里
 * 触发这条同步链时，与其他入口并发的异步 import() 相撞即抛
 * ERR_REQUIRE_ESM_RACE_CONDITION，整个插件条目 import 失败（Host 半区 + client bundle
 * 全部不加载，UI 全无）。因此本文件【禁止顶层 import schemastery】：
 *
 * - `Config` 是一个零依赖 Proxy 门面：入口导入期间不加载 schemastery；
 * - 宿主首次真正读取 Config 的属性（resolveConfig / 设置表单内省，均发生在导入波次
 *   之后，cosmokit 此时必已由其他插件加载完毕——dsh-personal-workbench 同波次实证）
 *   时才 materialize 真实 schema 并缓存；
 * - 所有方法调用绑定回真实实例（schemastery 使用 #private 字段，this 必须是真身）；
 * - schemastery 加载失败时降级为最小 ~standard 兜底 schema（插件活着 > 设置表单美化）。
 */
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

/** 运行时为 CJS（package.json 无 "type":"module"）；类型仅取 default 导出形状，编译期擦除。 */
declare const require: (id: string) => unknown;

let realSchema: unknown = null;
let materializeFailed = false;

/** 构建 schemastery schema（仅 materialize 时执行）。 */
function buildSchema(SchemaCtor: any): unknown {
  return SchemaCtor.intersect([
    SchemaCtor.object({
      dataDir: SchemaCtor.string().role('folder').description('数据目录（缺省 $DSH_HOME/cron-board）'),
      schedulerTickMs: SchemaCtor.number().default(30000).description('调度扫描间隔（毫秒）'),
      runTimeoutMin: SchemaCtor.number().default(60).description('单次执行超时（分钟）'),
      resultsKeepPerTask: SchemaCtor.number().default(20).description('每任务结果文件保留数'),
      executionsKeepPerTask: SchemaCtor.number().default(50).description('每任务执行记录保留数'),
      defaultPermission: SchemaCtor.union(['read-only', 'workspace-write', 'danger-full-access']).default('read-only').description('默认权限档（确认门基准）'),
    }).description('调度与保留'),
    SchemaCtor.object({
      push: SchemaCtor.object({
        httpPort: SchemaCtor.number().default(3080).description('dsh-im HTTP 回退端口'),
        retryMax: SchemaCtor.number().default(3).description('推送重试上限'),
      }).description('推送'),
    }),
  ]);
}

/** 兜底 schema：仅 ~standard.validate（补默认值、不校验形状），保证插件可激活。 */
function fallbackSchema(): unknown {
  const defaults: CronBoardConfig = {
    schedulerTickMs: 30000,
    runTimeoutMin: 60,
    resultsKeepPerTask: 20,
    executionsKeepPerTask: 50,
    defaultPermission: 'read-only',
    push: { httpPort: 3080, retryMax: 3 },
  };
  return {
    '~standard': {
      version: 1,
      validate(value: unknown): { value: CronBoardConfig } {
        const raw = (value ?? {}) as Partial<CronBoardConfig>;
        return {
          value: {
            ...defaults,
            ...raw,
            push: { ...defaults.push, ...(raw.push ?? {}) },
          },
        };
      },
    },
  };
}

/** 首次属性访问时加载 schemastery（入口导入波次之后，cosmokit 已就绪）；结果缓存。 */
function materialize(): unknown {
  if (realSchema !== null) return realSchema;
  if (!materializeFailed) {
    try {
      // 延迟 require：此处不在宿主入口导入波次内，schemastery→cosmokit 同步链不再竞态。
      const SchemaCtor = require('@deepseek-ai/schemastery');
      realSchema = buildSchema(SchemaCtor);
      return realSchema;
    } catch {
      materializeFailed = true; // 永久降级：避免每次属性访问反复抛错
    }
  }
  return (realSchema = realSchema ?? fallbackSchema());
}

/**
 * `Config` 零依赖 Proxy 门面：加载期零 schemastery。
 * 宿主消费面全部是属性读取（["~standard"]/.toJSON()/.meta/.dict/.type/["simplify"]），
 * get 转发到真实 schema 并对函数绑定 this（schemastery 依赖 #private 字段）。
 */
export const Config: any = new Proxy({}, {
  get(_target, prop) {
    const target = materialize() as Record<string | symbol, unknown>;
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  },
  has(_target, prop) {
    return Reflect.has(materialize() as object, prop);
  },
  ownKeys() {
    return Reflect.ownKeys(materialize() as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const desc = Reflect.getOwnPropertyDescriptor(materialize() as object, prop);
    // Proxy 不变式：ownKeys 报告的键必须可配置
    return desc ? { ...desc, configurable: true } : undefined;
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(materialize() as object);
  },
  set(_target, prop, value) {
    return Reflect.set(materialize() as object, prop, value);
  },
});

/** 解析数据目录：显式配置 > $DSH_HOME/cron-board > ~/.dsh/cron-board。 */
export function resolveDataDir(config: CronBoardConfig): string {
  if (config.dataDir && config.dataDir.trim() !== '') return config.dataDir;
  const dshHome = process.env.DSH_HOME;
  if (dshHome && dshHome.trim() !== '') return path.join(dshHome, 'cron-board');
  return path.join(os.homedir(), '.dsh', 'cron-board');
}

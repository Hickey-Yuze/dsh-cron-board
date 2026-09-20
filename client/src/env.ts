/**
 * client 侧运行环境的最小类型面：宿主注入的 apply(ctx) 与 handoff 工厂参数 require。
 * 官方 dsh-client-modules 的浏览器侧类型未随包发布，这里按本 bundle 的实际使用面建模。
 */

/**
 * handoff 工厂参数 require：bundle 以 CJS 形态包在 factory(require) 内执行
 * （scripts/build-client.mjs 负责 wrapper），源码里的裸 require 调用（external 模块）
 * 在运行时解析到该参数——浏览器全局作用域没有 require。
 */
declare const require: (id: string) => unknown;

/** 宿主 require 的受控包装（guarded 加载官方原语模块用）。 */
export function hostRequire(id: string): unknown {
  return require(id);
}

export interface SlotsApi {
  /** slot 注入：宿主在对应区域挂载时调用 factory，返回 register 句柄。 */
  inject(slot: string, factory: () => unknown): unknown;
  /** 注册组件与选项（name/id/key/order/label/inject 按 slot 约定）。 */
  register(options: Record<string, unknown>, component: unknown): unknown;
}

/** 插件入口 apply(ctx) 收到的 ctx（inject = ["slots", "connection", "layout", "locale", "sessions"]）。 */
export interface CronBoardClientCtx {
  slots: SlotsApi;
  connection?: {
    rpc: { call(channel: string, endpoint: string, payload?: unknown): Promise<unknown> };
  };
  layout: {
    selectPanel(panelId: string | null): void;
  };
  locale?: {
    getLocale(): unknown;
    subscribe(fn: () => void): () => void;
  };
  /** 会话服务（原版 task-board 同款）：打开执行会话（sessions.open）。 */
  sessions?: {
    open?(sessionId: string): unknown;
  };
}

/** client 侧 ctx.get（inject 声明过的服务可经此读取；缺省时降级）。 */
export function ctxGet(ctx: CronBoardClientCtx, key: string): unknown {
  return (ctx as unknown as { get?(k: string): unknown }).get?.(key);
}

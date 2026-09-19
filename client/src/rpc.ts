/**
 * 类型化 RPC 通道：全部 cron-board/* 端点的请求/响应类型来自 src/contract.ts
 * （契约单一事实源，import type 在 esbuild 构建期被擦除）。
 */
import type { CronBoardEndpoint, CronBoardRequestMap, CronBoardResponseMap, RpcEnvelope } from '../../src/contract.js';
import type { CronBoardClientCtx } from './env.js';

/** 类型化调用：端点字面量 → 请求/响应自动查表。 */
export type RpcFn = <K extends CronBoardEndpoint>(
  endpoint: K,
  payload?: CronBoardRequestMap[K],
) => Promise<RpcEnvelope<CronBoardResponseMap[K]>>;

export function makeRpc(ctx: CronBoardClientCtx): RpcFn {
  return (endpoint, payload) => {
    if (!ctx.connection || !ctx.connection.rpc) {
      return Promise.reject(new Error('connection 服务不可用')) as unknown as Promise<never>;
    }
    // 信封由宿主 rpc 层保证；这里断言到契约类型（契约漂移在 host 侧编译期已锁）
    return ctx.connection.rpc.call('/rpc', endpoint, payload ?? {}) as unknown as Promise<never>;
  };
}

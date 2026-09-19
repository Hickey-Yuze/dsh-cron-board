/**
 * 类型化 API 通道：直接 fetch 宿主 webServer 的 prefix 路由
 * （POST /api/cron-board/<endpoint>；Host 侧 src/rpc.ts 同款传输层，
 * 官方 session-manager/task-board 一致的模式），不依赖 connection 服务。
 * 端点请求/响应类型仍由 src/contract.ts 单一事实源查表。
 */
import type { CronBoardEndpoint, CronBoardRequestMap, CronBoardResponseMap, RpcEnvelope } from '../../src/contract.js';

/** 类型化调用：端点字面量 → 请求/响应自动查表。 */
export type RpcFn = <K extends CronBoardEndpoint>(
  endpoint: K,
  payload?: CronBoardRequestMap[K],
) => Promise<RpcEnvelope<CronBoardResponseMap[K]>>;

export const API_PREFIX = '/api/cron-board';

export function makeRpc(): RpcFn {
  return async (endpoint, payload) => {
    const sub = endpoint.startsWith('cron-board/') ? endpoint.slice('cron-board/'.length) : endpoint;
    const res = await fetch(`${API_PREFIX}/${sub}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    return (await res.json()) as RpcEnvelope<never>;
  };
}

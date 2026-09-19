/**
 * 推送适配器（三级降级，融合 dsh-im 主动投递契约）：
 * 1. 同 Host `ctx.get('dshIm')` 服务直调 `send(botId, targetId, text)`（dsh-im 以插件部署后生效）；
 * 2. HTTP POST `http://127.0.0.1:<port>/api/dsh-im/delivery/messages` 回退；
 * 3. 均不可达：按上限重试（退避 1s/2s/4s…）后标记未送达——不阻塞执行结算，
 *    看板可见推送状态并可手动补推。
 *
 * 注意：dshIm 是可选服务，绝不声明进 inject，也绝不以 ctx 属性方式访问（只走 ctx.get）。
 */
import type { PushRecord } from './contract.js';
export interface DshImLike {
    send(botId: string, targetId: string, text: string, opts?: {
        signal?: AbortSignal;
    }): Promise<{
        sent?: boolean;
    }>;
    listBots?(): Promise<unknown[]>;
    listTargets?(botId: string): Promise<unknown[]>;
}
export interface PusherOptions {
    httpPort: number;
    retryMax: number;
}
export declare class Pusher {
    private readonly resolveDshIm;
    private readonly opts;
    private readonly log;
    constructor(resolveDshIm: () => DshImLike | undefined, opts: PusherOptions, log: {
        warn(m: string): void;
        info(m: string): void;
    });
    channelView(): {
        mode: 'service' | 'unavailable';
        detail: string;
    };
    listBots(): Promise<{
        botId: string;
        channel: string;
    }[]>;
    listTargets(botId: string): Promise<{
        targetId: string;
        name?: string;
        kind?: string;
    }[]>;
    /** 单次投递尝试（不重试），返回是否成功与通道。 */
    private attempt;
    /** 带退避重试的投递：1s/2s/4s…（指数），返回 PushRecord。 */
    send(botId: string, targetId: string, text: string): Promise<PushRecord>;
    /** 推送简讯模板：成功 ✅ / 失败 ❌，含任务名、状态、耗时、结果文件指引。 */
    briefFor(input: {
        ok: boolean;
        title: string;
        status: string;
        durationMs?: number;
        resultPath?: string;
        reason?: string;
        lang?: 'zh' | 'en';
    }): string;
}

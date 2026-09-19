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
import { clampText, errDetail } from './util.js';

export interface DshImLike {
  send(botId: string, targetId: string, text: string, opts?: { signal?: AbortSignal }): Promise<{ sent?: boolean }>;
  listBots?(): Promise<unknown[]>;
  listTargets?(botId: string): Promise<unknown[]>;
}

export interface PusherOptions {
  httpPort: number;
  retryMax: number;
}

export class Pusher {
  constructor(
    private readonly resolveDshIm: () => DshImLike | undefined,
    private readonly opts: PusherOptions,
    private readonly log: { warn(m: string): void; info(m: string): void },
  ) {}

  channelView(): { mode: 'service' | 'unavailable'; detail: string } {
    const svc = this.resolveDshIm();
    if (svc && typeof svc.send === 'function') {
      return { mode: 'service', detail: 'dshIm 服务已挂载（同 Host 直调）' };
    }
    return { mode: 'unavailable', detail: `dshIm 服务未挂载；HTTP 回退 http://127.0.0.1:${this.opts.httpPort} 部署 dsh-im 后自动恢复` };
  }

  async listBots(): Promise<{ botId: string; channel: string }[]> {
    const svc = this.resolveDshIm();
    if (!svc?.listBots) return [];
    try {
      const raw = (await svc.listBots()) as { botId?: string; channel?: string }[];
      return (Array.isArray(raw) ? raw : [])
        .filter((b) => typeof b?.botId === 'string')
        .map((b) => ({ botId: b.botId as string, channel: typeof b.channel === 'string' ? b.channel : 'unknown' }));
    } catch (err) {
      this.log.warn(`[cron-board] dshIm.listBots 失败: ${errDetail(err)}`);
      return [];
    }
  }

  async listTargets(botId: string): Promise<{ targetId: string; name?: string; kind?: string }[]> {
    const svc = this.resolveDshIm();
    if (!svc?.listTargets) return [];
    try {
      const raw = (await svc.listTargets(botId)) as { targetId?: string; name?: string; kind?: string }[];
      return (Array.isArray(raw) ? raw : [])
        .filter((t) => typeof t?.targetId === 'string')
        .map((t) => ({ targetId: t.targetId as string, name: t.name, kind: t.kind }));
    } catch (err) {
      this.log.warn(`[cron-board] dshIm.listTargets 失败: ${errDetail(err)}`);
      return [];
    }
  }

  /** 单次投递尝试（不重试），返回是否成功与通道。 */
  private async attempt(botId: string, targetId: string, text: string): Promise<{ ok: boolean; channel: 'service' | 'http'; error?: string }> {
    const svc = this.resolveDshIm();
    if (svc && typeof svc.send === 'function') {
      try {
        const res = await svc.send(botId, targetId, text, { signal: AbortSignal.timeout(15000) });
        if (res?.sent === true) return { ok: true, channel: 'service' };
        return { ok: false, channel: 'service', error: 'dshIm.send 未返回 sent:true' };
      } catch (err) {
        return { ok: false, channel: 'service', error: errDetail(err) };
      }
    }
    // HTTP 回退（dsh-im 主动投递接口；仅回环地址，不带任何附加字段）
    try {
      const res = await fetch(`http://127.0.0.1:${this.opts.httpPort}/api/dsh-im/delivery/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botId, targetId, text }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { sent?: boolean } | null;
        if (body?.sent === true) return { ok: true, channel: 'http' };
        return { ok: false, channel: 'http', error: `HTTP ${res.status} 响应缺少 sent:true` };
      }
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      const code = body?.error?.code ?? `HTTP ${res.status}`;
      const message = body?.error?.message ?? res.statusText;
      return { ok: false, channel: 'http', error: `${code}: ${message}` };
    } catch (err) {
      return { ok: false, channel: 'http', error: errDetail(err) };
    }
  }

  /** 带退避重试的投递：1s/2s/4s…（指数），返回 PushRecord。 */
  async send(botId: string, targetId: string, text: string): Promise<PushRecord> {
    const max = Math.max(1, this.opts.retryMax);
    let lastError = '';
    let channel: 'service' | 'http' = 'service';
    for (let i = 1; i <= max; i++) {
      const r = await this.attempt(botId, targetId, text);
      channel = r.channel;
      if (r.ok) {
        return { state: 'sent', attempts: i, channel, at: new Date().toISOString() };
      }
      lastError = clampText(r.error ?? 'unknown', 300);
      this.log.warn(`[cron-board] 推送失败（第 ${i}/${max} 次，${channel}）: ${lastError}`);
      if (i < max) await new Promise((res) => setTimeout(res, 1000 * 2 ** (i - 1)));
    }
    return { state: 'failed', attempts: max, channel, lastError, at: new Date().toISOString() };
  }

  /** 推送简讯模板：成功 ✅ / 失败 ❌，含任务名、状态、耗时、结果文件指引。 */
  briefFor(input: {
    ok: boolean;
    title: string;
    status: string;
    durationMs?: number;
    resultPath?: string;
    reason?: string;
    lang?: 'zh' | 'en';
  }): string {
    const lang = input.lang ?? 'zh';
    const dur = input.durationMs !== undefined ? formatDur(input.durationMs, lang) : undefined;
    const lines: string[] = [];
    if (input.ok) {
      lines.push(lang === 'zh' ? `✅ 定时任务《${input.title}》完成` : `✅ Scheduled task "${input.title}" completed`);
      if (dur) lines.push(lang === 'zh' ? `耗时：${dur}` : `Duration: ${dur}`);
    } else {
      const reason = input.reason ?? input.status;
      lines.push(lang === 'zh' ? `❌ 定时任务《${input.title}》失败（${reason}）` : `❌ Scheduled task "${input.title}" failed (${reason})`);
      if (dur) lines.push(lang === 'zh' ? `已运行：${dur}` : `Ran for: ${dur}`);
    }
    if (input.resultPath) {
      lines.push(lang === 'zh' ? `结果已存档：${input.resultPath}` : `Result archived: ${input.resultPath}`);
    }
    lines.push(lang === 'zh' ? '—— dsh-cron-board 定时任务看板' : '— dsh-cron-board');
    return lines.join('\n');
  }
}

function formatDur(ms: number, lang: 'zh' | 'en'): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return lang === 'zh' ? `${sec} 秒` : `${sec}s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min < 60) return lang === 'zh' ? `${min} 分 ${rest} 秒` : `${min}m ${rest}s`;
  const hour = Math.floor(min / 60);
  return lang === 'zh' ? `${hour} 时 ${min % 60} 分` : `${hour}h ${min % 60}m`;
}

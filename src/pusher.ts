/**
 * 推送适配器：三级降级——dshIm 服务直调 → HTTP 回退（127.0.0.1:httpPort 的
 * /api/dsh-im/delivery/messages）→ 标记 failed（看板可手动补推）。
 * 推送失败不阻塞执行结算；重试退避 1s/2s/4s；简讯为终态摘要 + 结果文件路径（全文落盘不上推）。
 * dshIm 是可选服务：由 index 注入 resolve 回调（ctx.get 现取，支持 dsh-im 后装热生效）。
 */
import type { PushRecord, PushTestRecord } from './contract.js';
import { errDetail, fmtDuration } from './util.js';

/** dsh-im 服务最小鸭子类型（ctx.get('dshIm') 探测）。 */
export interface DshImLike {
  send(botId: string, targetId: string, text: string, opts?: Record<string, unknown>): Promise<{ sent: boolean }>;
  listBots?(): Promise<unknown>;
  listTargets?(botId: string): Promise<unknown>;
}

export interface PusherLogger {
  info(m: string): void;
  warn(m: string): void;
  error(m: string): void;
}

const SERVICE_TIMEOUT_MS = 15_000;

interface MetaBotLike {
  botId: string;
  channel?: string;
  title?: string;
}

interface MetaTargetLike {
  botId: string;
  targetId: string;
  name?: string;
  kind?: string;
}

export class Pusher {
  constructor(
    private readonly resolveDshIm: () => DshImLike | undefined,
    private readonly opts: { httpPort: number; retryMax: number },
    private readonly log: PusherLogger,
  ) {}

  /** 通道视图：service = dshIm 已挂载；unavailable = 服务与 HTTP 均不可用（HTTP 为尽力而为回退）。 */
  channelView(): { mode: 'service' | 'unavailable'; detail: string } {
    const dshIm = this.resolveDshIm();
    if (dshIm && typeof dshIm.send === 'function') {
      return { mode: 'service', detail: 'dshIm 服务直调' };
    }
    return {
      mode: 'unavailable',
      detail: `dsh-im 未部署；HTTP 回退 127.0.0.1:${this.opts.httpPort}（部署后自动恢复）`,
    };
  }

  async listBots(): Promise<MetaBotLike[]> {
    try {
      const dshIm = this.resolveDshIm();
      const raw = await dshIm?.listBots?.();
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
        .filter((b) => typeof b.id === 'string' || typeof b.botId === 'string')
        .map((b) => ({
          botId: (typeof b.botId === 'string' ? b.botId : b.id) as string,
          channel: typeof b.channel === 'string' ? b.channel : undefined,
          title: typeof b.title === 'string' ? b.title : undefined,
        }));
    } catch (err) {
      this.log.warn(`[cron-board] listBots 失败: ${errDetail(err)}`);
      return [];
    }
  }

  async listTargets(botId: string): Promise<MetaTargetLike[]> {
    try {
      const dshIm = this.resolveDshIm();
      const raw = await dshIm?.listTargets?.(botId);
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .filter((t) => typeof t.targetId === 'string' || typeof t.id === 'string')
        .map((t) => ({
          botId,
          targetId: (typeof t.targetId === 'string' ? t.targetId : t.id) as string,
          name: typeof t.name === 'string' ? t.name : undefined,
          kind: typeof t.kind === 'string' ? t.kind : undefined,
        }));
    } catch (err) {
      this.log.warn(`[cron-board] listTargets(${botId}) 失败: ${errDetail(err)}`);
      return [];
    }
  }

  /** 单次尝试：dshIm 服务直调；无服务则 HTTP 回退。 */
  private async attempt(botId: string, targetId: string, text: string): Promise<{ ok: boolean; channel: 'service' | 'http'; error?: string }> {
    const dshIm = this.resolveDshIm();
    if (dshIm && typeof dshIm.send === 'function') {
      try {
        const r = await dshIm.send(botId, targetId, text, { signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) });
        return { ok: r?.sent === true, channel: 'service', error: r?.sent === true ? undefined : '服务返回 sent=false' };
      } catch (err) {
        return { ok: false, channel: 'service', error: errDetail(err) };
      }
    }
    try {
      const res = await fetch(`http://127.0.0.1:${this.opts.httpPort}/api/dsh-im/delivery/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botId, targetId, text }),
        signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, channel: 'http', error: `HTTP ${res.status}` };
      const body = (await res.json().catch(() => null)) as { sent?: boolean } | null;
      return { ok: body?.sent === true, channel: 'http', error: body?.sent === true ? undefined : '响应缺少 sent=true' };
    } catch (err) {
      return { ok: false, channel: 'http', error: errDetail(err) };
    }
  }

  /** 带退避重试的推送（1s/2s/4s）；结果永远是一个 PushRecord，不抛异常。 */
  async send(botId: string, targetId: string, text: string): Promise<PushRecord> {
    const maxAttempts = Math.max(1, this.opts.retryMax);
    let lastError: string | undefined;
    let channel: 'service' | 'http' = 'service';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const r = await this.attempt(botId, targetId, text);
      channel = r.channel;
      if (r.ok) return { state: 'sent', attempts: attempt, channel };
      lastError = r.error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
    }
    this.log.warn(`[cron-board] 推送失败（bot=${botId} target=${targetId}，重试 ${maxAttempts} 次）: ${lastError ?? 'unknown'}`);
    return { state: 'failed', attempts: maxAttempts, channel, lastError };
  }

  /** 终态简讯（zh/en）：状态头 + agent 回复正文（截断）+ 失败原因 + 会话链接。不落本地路径、不署名（用户要求）。 */
  briefFor(input: {
    ok: boolean;
    title: string;
    status: string;
    durationMs?: number;
    resultPath?: string;
    reason?: string;
    content?: string;
    sessionId?: string; // 执行会话 ID，推送里带跳转链接
    lang?: 'zh' | 'en';
  }): string {
    const lang = input.lang ?? 'zh';
    const dur = input.durationMs !== undefined ? fmtDuration(input.durationMs, lang) : undefined;
    const body = clampBody(input.content);
    const sessionLink = input.sessionId ? `\n会话：${input.sessionId}` : '';
    if (lang === 'en') {
      const lines = [input.ok ? '✅ Cron task finished' : '❌ Cron task failed', `Task: ${input.title}`, `Status: ${input.status}`];
      if (dur !== undefined) lines.push(`Duration: ${dur}`);
      lines.push('');
      if (body !== '') lines.push(body);
      else if (input.resultPath !== undefined) lines.push(`Result archived: ${input.resultPath}`);
      if (!input.ok && input.reason !== undefined) lines.push(`Reason: ${input.reason}`);
      if (sessionLink) lines.push(sessionLink);
      return lines.join('\n');
    }
    const lines = [
      input.ok ? '✅ 定时任务完成' : '❌ 定时任务失败',
      `任务：《${input.title}》`,
      `状态：${input.status}`,
    ];
    if (dur !== undefined) lines.push(`耗时：${dur}`);
    lines.push('');
    if (body !== '') {
      lines.push(body);
    } else if (input.resultPath !== undefined) {
      lines.push(`结果已存档：${input.resultPath}`);
    }
    if (!input.ok && input.reason !== undefined) lines.push(`失败原因：${input.reason}`);
    if (sessionLink) lines.push(sessionLink);
    return lines.join('\n');
  }
}

/** 简讯正文的截断保护：按 UTF-8 字节算（dsh-im 微信通道单条 ~2048 字节即拆条，正文留 1200 字节）。 */
function clampBody(content: string | undefined): string {
  const raw = (content ?? '').trim();
  if (raw === '') return '';
  const MAX_BYTES = 1200;
  if (Buffer.byteLength(raw, 'utf8') <= MAX_BYTES) return raw;
  let cut = MAX_BYTES;
  while (cut > 0 && Buffer.byteLength(raw.slice(0, cut), 'utf8') > MAX_BYTES - 3) cut--;
  return `${raw.slice(0, cut)}…（内容过长已截断，全文见结果文件）`;
}

/** PushTestRecord 构造（看板测试推送用）。 */
export function toPushTestRecord(r: PushRecord, ok: boolean, error?: string): PushTestRecord {
  return {
    ok,
    error: ok ? undefined : (error ?? r.lastError ?? '推送失败'),
    at: new Date().toISOString(),
    channel: r.channel ?? 'service',
  };
}

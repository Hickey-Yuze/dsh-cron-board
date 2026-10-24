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
/**
 * 推送格式：markdown。
 * dsh-im 的 agent 回复走的就是 markdown（各渠道原生化渲染），主动投递的 `format` 字段
 * 只接受 plain/markdown。markdown 路径由 dsh-im 自己负责渲染与超长分段（钉钉按
 * chunkMarkdownParts 逐段发 sampleMarkdown），因此过长内容既不会被 cron-board 截断，
 * 也不会撞平台单条上限。
 */
const PUSH_FORMAT = 'markdown';

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
        const r = await dshIm.send(botId, targetId, text, {
          signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
          format: PUSH_FORMAT,
        });
        return { ok: r?.sent === true, channel: 'service', error: r?.sent === true ? undefined : '服务返回 sent=false' };
      } catch (err) {
        return { ok: false, channel: 'service', error: errDetail(err) };
      }
    }
    try {
      const res = await fetch(`http://127.0.0.1:${this.opts.httpPort}/api/dsh-im/delivery/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botId, targetId, text, format: PUSH_FORMAT }),
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
      const r = await this.attempt(botId, targetId, dingtalkFormatSafe(text));
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

  /** 终态简讯（zh/en）：状态头 + agent 回复正文（IM 清洗，不截断：markdown 推送由 dsh-im 分段）+ 失败原因。不落本地路径、不署名（用户要求）。 */
  briefFor(input: {
    ok: boolean;
    title: string;
    status: string;
    durationMs?: number;
    resultPath?: string;
    reason?: string;
    content?: string;
    lang?: 'zh' | 'en';
  }): string {
    const lang = input.lang ?? 'zh';
    const dur = input.durationMs !== undefined ? fmtDuration(input.durationMs, lang) : undefined;
    const body = sanitizeForIm(input.content ?? '');
    if (lang === 'en') {
      const lines = [input.ok ? '✅ Cron task finished' : '❌ Cron task failed', `Task: ${input.title}`, `Status: ${input.status}`];
      if (dur !== undefined) lines.push(`Duration: ${dur}`);
      lines.push('');
      if (body !== '') lines.push(body);
      else if (input.resultPath !== undefined) lines.push(`Result archived: ${input.resultPath}`);
      if (!input.ok && input.reason !== undefined) lines.push(`Reason: ${input.reason}`);
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
    return lines.join('\n');
  }
}

/**
 * 钉钉通道格式保真：钉钉把消息按 markdown 渲染——单换行不换行（行合并成段）、行首半角空格被吃。
 * 钉钉的 markdown 是简化实现：不支持行尾双空格硬换行（2026-10-01 用户实测无效），换行必须用 \n\n。
 * 对策：
 *  1) 普通行之间插入空行（\n\n）→ 模板每行独立成段；
 *  2) 行首半角缩进 → 全角空格（U+3000，markdown 不视作缩进语法，原样保留）。
 *
 * 但 markdown 结构不能被这套补丁拆坏（推送改为 markdown 后必守）：
 *  - 围栏代码块（``` / ~~~）内部的换行原样保留，否则代码块被当成普通正文并拆碎；
 *  - 列表、引用、表格的连续行保持紧凑（单 \n），否则紧凑列表被拉成松散列表、表格行断开。
 */
export function dingtalkFormatSafe(raw: string): string {
  const lines = raw.split('\n');
  // 先标注每行是否处在围栏代码块内（开/闭围栏行本身也算"在块内"）。
  const fenced: boolean[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const probe = line.trimStart();
    if (fence === null) {
      const open = /^(`{3,}|~{3,})/.exec(probe);
      const mark = open?.[1];
      if (mark !== undefined) fence = mark;
      fenced.push(fence !== null);
      continue;
    }
    fenced.push(true);
    if (probe.startsWith(fence)) fence = null;
  }
  const structural = (line: string): boolean =>
    /^\s*(?:[-*+]|\d+[.)])\s/.test(line) || /^\s*>/.test(line) || /^\s*\|/.test(line);
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (i > 0) {
      const prev = lines[i - 1] ?? '';
      const keepTight =
        fenced[i] === true ||
        fenced[i - 1] === true ||
        line.trim() === '' ||
        prev.trim() === '' ||
        structural(line) ||
        structural(prev);
      parts.push(keepTight ? '\n' : '\n\n');
    }
    const lead = /^ +/.exec(line)?.[0].length ?? 0;
    parts.push('\u3000'.repeat(lead) + line.slice(lead).trimEnd());
  }
  return parts.join('');
}

/**
 * agent 回复里的 GenUI（```dsh-ui）围栏是宿主聊天界面专用渲染格式——IM 是纯文本/markdown
 * 通道，原样推送会把 JSON 源码漏给用户（2026-10-17 汇报任务实测）。
 * 提取器结构感知：keyvalue 键值成对、table 行内「｜」连接、copy/callout 键值同行、
 * 文本字段里的 markdown 标记（粗体/链接）原样保留（dsh-im 通道可渲染）。
 * 解析失败则整段替换为占位提示。完整全文始终以结果文件为准。
 */
const DSH_UI_FENCE = /```dsh-ui[^\n]*\n([\s\S]*?)```/g;

/** GenUI 组件 → 可读文本行（避免逐字段拆散）。 */
function nodeToLines(node: unknown): string[] {
  if (typeof node === 'string') {
    const v = node.trim();
    return v === '' ? [] : [v];
  }
  if (Array.isArray(node)) return node.flatMap((x) => nodeToLines(x));
  if (node === null || typeof node !== 'object') return [];
  const o = node as Record<string, unknown>;
  const s = (k: string): string => {
    const v = o[k];
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return '';
  };
  const pair = (a: string, b: string): string[] => (a !== '' && b !== '' ? [`${a}：${b}`] : [a, b].filter((x) => x !== ''));
  switch (o.type) {
    case 'copy':
      return pair(s('label'), s('text'));
    case 'callout':
      return pair(s('title'), s('content'));
    case 'stat':
      return [[s('label'), s('value'), s('delta')].filter((x) => x !== '').join('：')].filter((x) => x !== '');
    case 'keyvalue': {
      if (!Array.isArray(o.pairs)) return [];
      return o.pairs.flatMap((p) => {
        if (p === null || typeof p !== 'object') return nodeToLines(p);
        const po = p as Record<string, unknown>;
        const k = po.key === undefined ? '' : String(po.key).trim();
        const v = po.value === undefined ? '' : String(po.value).trim();
        return pair(k, v);
      });
    }
    case 'table': {
      const cols = Array.isArray(o.columns)
        ? o.columns
            .map((c) =>
              typeof c === 'string'
                ? c
                : c !== null && typeof c === 'object'
                  ? String((c as Record<string, unknown>).label ?? '').trim()
                  : '',
            )
            .filter((x) => x !== '')
        : [];
      const rows = Array.isArray(o.rows)
        ? o.rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')).join(' ｜ ') : nodeToLines(r).join(' ｜ ')))
        : [];
      const lines: string[] = [];
      if (cols.length > 0) lines.push(cols.join(' ｜ '));
      lines.push(...rows.filter((x) => x !== ''));
      return lines;
    }
    case 'divider':
    case 'spacer':
      return [];
    default: {
      // 通用兜底：标题键在前、正文键成段、嵌套容器递归
      const lines: string[] = [];
      for (const k of ['label', 'title']) {
        const v = s(k);
        if (v !== '') lines.push(v);
      }
      const body = [s('content'), s('text'), s('desc')].filter((x) => x !== '').join('：');
      if (body !== '') lines.push(body);
      for (const k of ['items', 'children', 'rows', 'pairs', 'steps']) {
        if (Array.isArray(o[k])) lines.push(...(o[k] as unknown[]).flatMap((x) => nodeToLines(x)));
      }
      return lines;
    }
  }
}

export function sanitizeForIm(text: string): string {
  const PLACEHOLDER = '（附一段界面卡片内容，已省略——全文见结果文件）';
  return text.replace(DSH_UI_FENCE, (_m, body: string) => {
    try {
      const spec = JSON.parse(body) as Record<string, unknown>;
      const head = typeof spec.title === 'string' && spec.title.trim() !== '' ? [spec.title.trim()] : [];
      const lines = [
        ...head,
        ...(Array.isArray(spec.items) ? spec.items.flatMap((x) => nodeToLines(x)) : nodeToLines(spec)),
      ];
      const joined = lines
        .filter((x) => x !== '')
        .join('\n')
        .trim();
      return joined !== '' ? joined : PLACEHOLDER;
    } catch {
      return PLACEHOLDER;
    }
  });
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

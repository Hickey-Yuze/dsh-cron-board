/**
 * 零依赖 5 段 cron 解析器（宿主权威：校验 + nextRun 调度；client 复用 describeCron 做展示）。
 * 语义对齐 dsh-task-board：支持星号通配、步长（星号/斜杠 n）、范围、逗号列表、
 * 周日 0/7 归一、日期/星期 OR 语义。
 * 时间基准为 Host 本地时区（墙上时钟，DST 跳过/重复语义同 vixie-cron 常规实现）。
 */

export interface ParsedCron {
  minute: Set<number>; // 0-59
  hour: Set<number>; // 0-23
  dom: Set<number>; // 1-31
  month: Set<number>; // 1-12
  dow: Set<number>; // 0-6（7 归一为 0）
  domWild: boolean;
  dowWild: boolean;
}

const MINUTE_MIN = 0, MINUTE_MAX = 59;
const HOUR_MIN = 0, HOUR_MAX = 23;
const DOM_MIN = 1, DOM_MAX = 31;
const MONTH_MIN = 1, MONTH_MAX = 12;
const DOW_MIN = 0, DOW_MAX = 7;

function parseField(raw: string, name: string, min: number, max: number, isDow = false): { values: Set<number>; wild: boolean } {
  const values = new Set<number>();
  let wild = false;
  const terms = raw.split(',');
  if (terms.length === 0 || terms.some((t) => t.length === 0)) {
    throw new Error(`cron: 字段 ${name} 为空或不合法: "${raw}"`);
  }
  for (const term of terms) {
    let body = term;
    let step = 1;
    const slash = term.indexOf('/');
    if (slash >= 0) {
      body = term.slice(0, slash);
      const stepRaw = term.slice(slash + 1);
      step = Number(stepRaw);
      if (!Number.isInteger(step) || step < 1) throw new Error(`cron: 字段 ${name} 步长不合法: "${term}"`);
    }
    let lo: number, hi: number;
    if (body === '*') {
      lo = min; hi = max;
      if (slash < 0) wild = true;
    } else if (body.includes('-')) {
      const parts = body.split('-');
      if (parts.length !== 2) throw new Error(`cron: 字段 ${name} 范围不合法: "${term}"`);
      lo = Number(parts[0]); hi = Number(parts[1]);
    } else {
      lo = Number(body);
      hi = slash >= 0 ? max : lo; // `a/step` = a-max/step；`a` = 单值
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`cron: 字段 ${name} 数值不合法: "${term}"`);
    if (isDow) {
      if (lo === 7) lo = 0;
      if (hi === 7) hi = 0;
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`cron: 字段 ${name} 超界: "${term}"（允许 ${min}-${max}）`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  if (values.size === 0) throw new Error(`cron: 字段 ${name} 无有效值: "${raw}"`);
  return { values, wild };
}

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron: 需要 5 段（分 时 日 月 周），收到 ${parts.length} 段: "${expr}"`);
  const minute = parseField(parts[0] as string, '分', MINUTE_MIN, MINUTE_MAX);
  const hour = parseField(parts[1] as string, '时', HOUR_MIN, HOUR_MAX);
  const dom = parseField(parts[2] as string, '日', DOM_MIN, DOM_MAX);
  const month = parseField(parts[3] as string, '月', MONTH_MIN, MONTH_MAX);
  const dow = parseField(parts[4] as string, '周', DOW_MIN, DOW_MAX, true);
  return {
    minute: minute.values,
    hour: hour.values,
    dom: dom.values,
    month: month.values,
    dow: dow.values,
    domWild: dom.wild,
    dowWild: dow.wild,
  };
}

export function isValidCron(expr: string): boolean {
  try { parseCron(expr); return true; } catch { return false; }
}

function dayMatches(c: ParsedCron, d: Date): boolean {
  if (c.domWild && c.dowWild) return true;
  if (c.domWild) return c.dow.has(d.getDay());
  if (c.dowWild) return c.dom.has(d.getDate());
  // vixie 语义：日与周都受限时取 OR
  return c.dom.has(d.getDate()) || c.dow.has(d.getDay());
}

/**
 * 下一个触发点（严格晚于 from，分钟精度，Host 本地时区）。
 * 智能跳月/跳日/跳时，无匹配返回 null（理论上仅限超过 5 年远期才可能触顶）。
 */
export function cronNextRun(expr: string, from: Date): Date | null {
  const c = parseCron(expr);
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  for (let guard = 0; guard < 300000; guard++) {
    if (!c.month.has(t.getMonth() + 1)) {
      t.setDate(1);
      t.setMonth(t.getMonth() + 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(c, t)) {
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }
    if (!c.hour.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (c.minute.has(t.getMinutes())) return new Date(t.getTime());
    t.setMinutes(t.getMinutes() + 1);
  }
  return null;
}

const ZH_DOW = ['日', '一', '二', '三', '四', '五', '六'] as const;
const EN_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isPlainNumber(s: string): boolean {
  return /^\d+$/.test(s);
}

/** 人类可读描述（看板卡片/详情展示用；无法识别的模式回退表达式原文）。 */
export function describeCron(expr: string, lang: 'zh' | 'en'): string {
  let parts: string[];
  try {
    parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return expr;
    parseCron(expr);
  } catch {
    return expr;
  }
  const minute = parts[0] as string;
  const hour = parts[1] as string;
  const dom = parts[2] as string;
  const mon = parts[3] as string;
  const dow = parts[4] as string;
  const time = `${pad2(Number(hour))}:${pad2(Number(minute))}`;

  if (mon === '*' && dom === '*' && dow === '*' && isPlainNumber(minute) && isPlainNumber(hour)) {
    return lang === 'zh' ? `每天 ${time}` : `Daily at ${time}`;
  }
  if (mon === '*' && dom === '*' && isPlainNumber(dow) && isPlainNumber(minute) && isPlainNumber(hour)) {
    const d = Number(dow) % 7;
    return lang === 'zh' ? `每周${ZH_DOW[d]} ${time}` : `Every ${EN_DOW[d]} at ${time}`;
  }
  if (mon === '*' && dow === '*' && isPlainNumber(dom) && isPlainNumber(minute) && isPlainNumber(hour)) {
    return lang === 'zh' ? `每月 ${Number(dom)} 日 ${time}` : `Monthly on day ${Number(dom)} at ${time}`;
  }
  if (dom === '*' && mon === '*' && dow === '*' && /^\*\/(\d+)$/.test(minute) && hour === '*') {
    const n = Number((minute.match(/^\*\/(\d+)$/) as RegExpMatchArray)[1]);
    if (lang === 'zh') return n === 1 ? '每分钟' : `每 ${n} 分钟`;
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }
  if (dom === '*' && mon === '*' && dow === '*' && minute === '0' && /^\*\/(\d+)$/.test(hour)) {
    const n = Number((hour.match(/^\*\/(\d+)$/) as RegExpMatchArray)[1]);
    if (lang === 'zh') return n === 1 ? '每小时' : `每 ${n} 小时`;
    return n === 1 ? 'Every hour' : `Every ${n} hours`;
  }
  return expr;
}

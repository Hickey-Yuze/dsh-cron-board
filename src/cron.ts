/**
 * 零依赖 5 段 cron 解析器（宿主权威：校验 + nextRun 调度；client 复用 describeCron 做展示）。
 * 语义对齐 dsh-task-board：支持星号通配、步长（星号/斜杠 n）、范围、逗号列表、
 * 周日 0/7 归一、日期/星期 OR 语义（vixie 惯例：仅当 dom 与 dow 均受限时匹配任一）。
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
      hi = slash >= 0 ? max : lo; // a/step = a-max/step；单值 a 即 a
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
  return { minute: minute.values, hour: hour.values, dom: dom.values, month: month.values, dow: dow.values, domWild: dom.wild, dowWild: dow.wild };
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

function nextInSet(values: Set<number>, current: number): number | undefined {
  let best: number | undefined;
  for (const v of values) {
    if (v > current && (best === undefined || v < best)) best = v;
  }
  return best;
}

function minInSet(values: Set<number>): number {
  let m = Number.MAX_SAFE_INTEGER;
  for (const v of values) if (v < m) m = v;
  return m;
}

/** dayOK：dom/dow vixie OR 语义（两者均受限 → 匹配任一；仅一者受限 → 其须匹配）。 */
function dayMatches(c: ParsedCron, date: Date): boolean {
  const domHit = c.dom.has(date.getDate());
  const dowHit = c.dow.has(date.getDay());
  if (c.domWild && c.dowWild) return true;
  if (c.domWild) return dowHit;
  if (c.dowWild) return domHit;
  return domHit || dowHit;
}

/**
 * 计算下一次触发点（严格晚于 from；本地时区墙上时钟）。
 * 智能跳级：月/日/时/分逐级跳到下一个允许值，找不到则进位；5 年内无匹配返回 null。
 */
export function cronNextRun(expr: string, from: Date): Date | null {
  let p: ParsedCron;
  try {
    p = parseCron(expr);
  } catch {
    return null;
  }
  const c = new Date(from.getTime());
  c.setSeconds(0, 0);
  c.setMinutes(c.getMinutes() + 1);
  for (let guard = 0; guard < 200_000; guard++) {
    if (!p.month.has(c.getMonth() + 1)) {
      c.setMonth(c.getMonth() + 1, 1);
      c.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(p, c)) {
      c.setDate(c.getDate() + 1);
      c.setHours(0, 0, 0, 0);
      continue;
    }
    if (!p.hour.has(c.getHours())) {
      const h = nextInSet(p.hour, c.getHours());
      if (h === undefined) {
        c.setDate(c.getDate() + 1);
        c.setHours(0, 0, 0, 0);
      } else {
        c.setHours(h, 0, 0, 0);
      }
      continue;
    }
    if (!p.minute.has(c.getMinutes())) {
      const m = nextInSet(p.minute, c.getMinutes());
      if (m === undefined) {
        c.setHours(c.getHours() + 1, minInSet(p.minute), 0, 0);
      } else {
        c.setMinutes(m, 0, 0);
      }
      continue;
    }
    return new Date(c.getTime());
  }
  return null;
}

const ZH_DOW = ['日', '一', '二', '三', '四', '五', '六'] as const;
const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isSingleValue(field: string, min: number, max: number): number | undefined {
  const v = Number(field);
  return Number.isInteger(v) && v >= min && v <= max ? v : undefined;
}

/** cron 的人类可读描述；无法归类时回退原文。 */
export function describeCron(expr: string, lang: 'zh' | 'en' = 'zh'): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 || !isValidCron(expr)) return expr;
  const [fMin, fHour, fDom, fMonth, fDow] = parts as [string, string, string, string, string];
  const time = (h: number, m: number) => (lang === 'zh' ? hhmm(h, m) : `at ${hhmm(h, m)}`);
  // 每天 HH:MM
  if (fMin !== '*' && fHour !== '*' && fDom === '*' && fMonth === '*' && fDow === '*') {
    const h = isSingleValue(fHour, 0, 23);
    const m = isSingleValue(fMin, 0, 59);
    if (h !== undefined && m !== undefined) return lang === 'zh' ? `每天 ${hhmm(h, m)}` : `Daily ${time(h, m)}`;
  }
  // 每周 X
  if (fDom === '*' && fMonth === '*' && fDow !== '*') {
    const d = isSingleValue(fDow === '7' ? '0' : fDow, 0, 6);
    const h = isSingleValue(fHour, 0, 23);
    const m = isSingleValue(fMin, 0, 59);
    if (d !== undefined && h !== undefined && m !== undefined) {
      return lang === 'zh' ? `每周${ZH_DOW[d]} ${hhmm(h, m)}` : `Weekly on ${EN_DOW[d]} ${time(h, m)}`;
    }
  }
  // 每月 N 日
  if (fMonth === '*' && fDow === '*' && fDom !== '*') {
    const d = isSingleValue(fDom, 1, 31);
    const h = isSingleValue(fHour, 0, 23);
    const m = isSingleValue(fMin, 0, 59);
    if (d !== undefined && h !== undefined && m !== undefined) {
      return lang === 'zh' ? `每月 ${d} 日 ${hhmm(h, m)}` : `Monthly on day ${d} ${time(h, m)}`;
    }
  }
  // 每 n 分钟
  if (fMin.startsWith('*/') && fHour === '*' && fDom === '*' && fMonth === '*' && fDow === '*') {
    const n = Number(fMin.slice(2));
    if (Number.isInteger(n) && n >= 1) return lang === 'zh' ? `每 ${n} 分钟` : `Every ${n} minutes`;
  }
  // 每 n 小时
  if (fHour.startsWith('*/') && fDom === '*' && fMonth === '*' && fDow === '*' && isSingleValue(fMin, 0, 59) !== undefined) {
    const n = Number(fHour.slice(2));
    if (Number.isInteger(n) && n >= 1) return lang === 'zh' ? `每 ${n} 小时` : `Every ${n} hours`;
  }
  return expr;
}

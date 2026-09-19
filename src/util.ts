/**
 * 通用工具：随机 ID、哈希、原子写、安全读、错误详情、时长格式化。
 * 原子写（tmp+rename）对 EPERM/EBUSY/EACCES 重试一次（Windows 文件占用惯例；mac 保留同语义）。
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export function randomHex(len: number): string {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

export function newTaskId(): string {
  return `task-${randomHex(8)}`;
}

export function newExecId(): string {
  return `exec-${randomHex(12)}`;
}

export function newSessionId(): string {
  return randomHex(12);
}

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function errDetail(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    const base = code ? `${err.name}: ${err.message} (${code})` : `${err.name}: ${err.message}`;
    // 诊断增强：附首段堆栈（定位宿主内部出错点；调试期保留，稳定后可裁剪）
    const stack = typeof err.stack === 'string' ? err.stack.split('\n').slice(1, 5).join(' ← ').trim() : '';
    return stack !== '' ? `${base} ‹${stack}›` : base;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 原子写文本：先写同目录临时文件再 rename；可重试错误重试一次。 */
export async function writeTextAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp-${randomHex(6)}`;
  try {
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    const code = (err as NodeJS.ErrnoException).code;
    if (code && RETRYABLE.has(code)) {
      await sleep(120);
      const tmp2 = `${file}.tmp-${randomHex(6)}`;
      await fs.writeFile(tmp2, text, 'utf8');
      await fs.rename(tmp2, file);
      return;
    }
    throw err;
  }
}

export async function readTextSafe(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

export function readJsonSafe<T>(text: string | undefined): T | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export async function removeFile(file: string): Promise<void> {
  await fs.rm(file, { force: true }).catch(() => {});
}

/** 秒级人类时长：zh「1 分 5 秒」/ en「1m 5s」。 */
export function fmtDuration(ms: number, lang: 'zh' | 'en' = 'zh'): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return lang === 'zh' ? `${sec} 秒` : `${sec}s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min < 60) return lang === 'zh' ? `${min} 分 ${rest} 秒` : `${min}m ${rest}s`;
  const hour = Math.floor(min / 60);
  return lang === 'zh' ? `${hour} 时 ${min % 60} 分` : `${hour}h ${min % 60}m`;
}

export function clampText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** 确保路径段安全（任务/执行 ID 用作目录与文件名）。 */
export function safeSegment(segment: string): string {
  return path.basename(segment).replace(/[^A-Za-z0-9_-]/g, '_');
}

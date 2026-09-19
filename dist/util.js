/**
 * 通用工具：ID、原子写、安全读、错误摘要、时长/时间格式、哈希。
 * 原子写对齐团队铁律：先整体序列化为字符串再落临时文件，rename 覆盖；
 * Windows 上 rename 失败（EPERM/EBUSY）退避重试一次。
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
export function randomHex(bytes) {
    return crypto.randomBytes(bytes).toString('hex');
}
export function newTaskId() {
    return `task-${randomHex(4)}`;
}
export function newExecId() {
    return `exec-${randomHex(6)}`;
}
/** 会话 id 形态对齐宿主（12 位 hex）。 */
export function newSessionId() {
    return randomHex(6);
}
export function sha256(input) {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
export function errDetail(err) {
    if (err instanceof Error)
        return err.stack ? `${err.message} (${err.stack.split('\n')[1]?.trim() ?? ''})` : err.message;
    return String(err);
}
export async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}
async function renameWithRetry(tmp, file) {
    try {
        await fs.rename(tmp, file);
    }
    catch (err) {
        const code = err?.code;
        if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
            await new Promise((r) => setTimeout(r, 50));
            await fs.rename(tmp, file);
            return;
        }
        throw err;
    }
}
/** 原子写文本：临时文件 + rename 覆盖（调用方传完整字符串，不在写路径二次拼接）。 */
export async function writeTextAtomic(file, content) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${Date.now()}.${randomHex(3)}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    try {
        await renameWithRetry(tmp, file);
    }
    catch (err) {
        await fs.rm(tmp, { force: true }).catch(() => { });
        throw err;
    }
}
export async function readTextSafe(file) {
    try {
        return await fs.readFile(file, 'utf8');
    }
    catch {
        return undefined;
    }
}
export async function readJsonSafe(file, fallback) {
    const text = await readTextSafe(file);
    if (text === undefined)
        return fallback;
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
}
export async function removeFile(file) {
    await fs.rm(file, { force: true }).catch(() => { });
}
/** 时长人类可读（推送简讯用，zh/en 各一）。 */
export function fmtDuration(ms, lang) {
    const sec = Math.max(0, Math.round(ms / 1000));
    if (sec < 60)
        return lang === 'zh' ? `${sec} 秒` : `${sec}s`;
    const min = Math.floor(sec / 60);
    const rest = sec % 60;
    if (min < 60)
        return lang === 'zh' ? `${min} 分 ${rest} 秒` : `${min}m ${rest}s`;
    const hour = Math.floor(min / 60);
    return lang === 'zh' ? `${hour} 时 ${min % 60} 分` : `${hour}h ${min % 60}m`;
}
export function clampText(s, max) {
    return s.length <= max ? s : `${s.slice(0, max)}…`;
}

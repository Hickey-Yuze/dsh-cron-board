/**
 * 结果存档：执行终态的最终回复落盘为 Markdown（front matter 元信息 + 正文），
 * 路径 `results/<taskId>/<execId>.md`；按任务保留最近 N 份（超出删除最旧）。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { clampText, ensureDir, readTextSafe, removeFile, writeTextAtomic } from './util.js';
export class ResultStore {
    root;
    constructor(dataDir) {
        this.root = path.join(dataDir, 'results');
    }
    async write(task, exec, body) {
        const dir = path.join(this.root, task.id);
        await ensureDir(dir);
        const front = [
            '---',
            `task: ${clampText(task.title, 120).replace(/[\r\n]/g, ' ')}`,
            `task-id: ${task.id}`,
            `exec-id: ${exec.id}`,
            `trigger: ${exec.trigger}`,
            `session: ${exec.sessionId}`,
            `status: ${exec.status}`,
            `started-at: ${exec.startedAt}`,
            `ended-at: ${exec.endedAt ?? ''}`,
            `duration-ms: ${exec.durationMs ?? ''}`,
            `exit-reason: ${exec.exitReason ?? ''}`,
            '---',
            '',
        ].join('\n');
        const file = path.join(dir, `${exec.id}.md`);
        await writeTextAtomic(file, `${front}${body.endsWith('\n') ? body : `${body}\n`}`);
        return file;
    }
    async read(taskId, execId, maxBytes = 262144) {
        if (!/^[A-Za-z0-9_-]+$/.test(taskId) || !/^[A-Za-z0-9_-]+$/.test(execId))
            return undefined;
        const text = await readTextSafe(path.join(this.root, taskId, `${execId}.md`));
        if (text === undefined)
            return undefined;
        if (text.length <= maxBytes)
            return text;
        return `${text.slice(0, maxBytes)}\n\n…（已截断，完整内容见宿主数据目录）`;
    }
    async removeTask(taskId) {
        if (!/^[A-Za-z0-9_-]+$/.test(taskId))
            return;
        await fs.rm(path.join(this.root, taskId), { recursive: true, force: true }).catch(() => { });
    }
    /** 按保留份数删除最旧结果文件（mtime 升序；当前执行永远保留，execId 随机不可作时间序）。 */
    async prune(taskId, keep, currentExecId) {
        if (!/^[A-Za-z0-9_-]+$/.test(taskId))
            return;
        const dir = path.join(this.root, taskId);
        let names = [];
        try {
            names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md'));
        }
        catch {
            return;
        }
        if (names.length <= keep)
            return;
        const excess = names.length - keep;
        const stats = await Promise.all(names.map(async (n) => {
            const m = await fs.stat(path.join(dir, n)).then((s) => s.mtimeMs).catch(() => 0);
            return { name: n, mtime: m };
        }));
        // 最旧在前；当前执行置末（永不删除）
        stats.sort((a, b) => {
            if (currentExecId && a.name === `${currentExecId}.md`)
                return 1;
            if (currentExecId && b.name === `${currentExecId}.md`)
                return -1;
            return a.mtime - b.mtime;
        });
        for (const entry of stats.slice(0, excess)) {
            if (currentExecId && entry.name === `${currentExecId}.md`)
                continue;
            await removeFile(path.join(dir, entry.name));
        }
    }
}

/**
 * 结果存档：results/<taskId>/<execId>.md（front matter + 全文 Markdown）。
 * taskId/execId 经安全段校验后才进路径（防穿越）；读取有上限（256KB 截断）；
 * prune 按 mtime 升序裁剪最旧，当前执行永远保留。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Execution, TaskRow } from './contract.js';
import { clampText, ensureDir, removeFile, safeSegment } from './util.js';

const READ_MAX = 262_144;

function frontMatter(task: TaskRow, exec: Execution): string {
  const lines = [
    '---',
    `task: ${task.title}`,
    `task-id: ${task.id}`,
    `exec-id: ${exec.id}`,
    `trigger: ${exec.trigger}`,
    `session: ${exec.sessionId}`,
    `status: ${exec.status}`,
    `started-at: ${exec.startedAt}`,
  ];
  if (exec.endedAt !== undefined) lines.push(`ended-at: ${exec.endedAt}`);
  if (exec.durationMs !== undefined) lines.push(`duration-ms: ${exec.durationMs}`);
  if (exec.exitReason !== undefined) lines.push(`exit-reason: ${exec.exitReason}`);
  lines.push('---', '');
  return lines.join('\n');
}

export class ResultStore {
  constructor(private readonly root: string) {}

  private taskDir(taskId: string): string | null {
    const seg = safeSegment(taskId);
    if (seg !== taskId) return null; // 非法字符（含穿越）拒绝
    return path.join(this.root, 'results', seg);
  }

  /** 写结果文件（覆盖同 execId）；返回完整路径。 */
  async write(task: TaskRow, exec: Execution, markdown: string): Promise<string> {
    const dir = this.taskDir(task.id);
    if (!dir) throw new Error(`非法任务 ID: ${task.id}`);
    await ensureDir(dir);
    const file = path.join(dir, `${safeSegment(exec.id)}.md`);
    const body = `${frontMatter(task, exec)}${clampText(markdown, READ_MAX)}`;
    await fs.writeFile(file, body, 'utf8');
    return file;
  }

  /** 读结果（带截断）；不存在返回 undefined。 */
  async read(taskId: string, execId: string): Promise<string | undefined> {
    const dir = this.taskDir(taskId);
    if (!dir) return undefined;
    const file = path.join(dir, `${safeSegment(execId)}.md`);
    try {
      const text = await fs.readFile(file, 'utf8');
      if (text.length <= READ_MAX) return text;
      return `${text.slice(0, READ_MAX)}\n\n…（已截断，完整内容见宿主数据目录）`;
    } catch {
      return undefined;
    }
  }

  async removeTask(taskId: string): Promise<void> {
    const dir = this.taskDir(taskId);
    if (!dir) return;
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  /** 按保留份数删除最旧结果文件（mtime 升序；当前执行永远保留，execId 随机不可作时间序）。 */
  async prune(taskId: string, keep: number, currentExecId?: string): Promise<void> {
    const dir = this.taskDir(taskId);
    if (!dir) return;
    let names: string[] = [];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md'));
    } catch {
      return;
    }
    if (names.length <= keep) return;
    const excess = names.length - keep;
    const stats = await Promise.all(
      names.map(async (n) => {
        const m = await fs.stat(path.join(dir, n)).then((s) => s.mtimeMs).catch(() => 0);
        return { name: n, mtime: m };
      }),
    );
    // 最旧在前；当前执行置末（永不删除）
    stats.sort((a, b) => {
      if (currentExecId && a.name === `${currentExecId}.md`) return 1;
      if (currentExecId && b.name === `${currentExecId}.md`) return -1;
      return a.mtime - b.mtime;
    });
    for (const entry of stats.slice(0, excess)) {
      if (currentExecId && entry.name === `${currentExecId}.md`) continue;
      await removeFile(path.join(dir, entry.name));
    }
  }
}

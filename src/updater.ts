/**
 * 一键更新：在插件的真实安装目录执行 `git pull --ff-only` + `pnpm run build`。
 *
 * 可行前提：插件经软链挂进 profile（`~/.dsh/profiles/desktop/node_modules/dsh-cron-board`
 * → `~/.dsh/cron-board-src` → `~/dsh-cron-board`），Node 解析模块时已跟随软链，
 * 故 `__dirname` 就落在 git 检出内，可直接在插件进程里跑命令。
 *
 * 设计约束（对齐仓库铁律「最小注入」）：
 *  - 零依赖，只用 `node:child_process` / `node:fs` / `node:path`。
 *  - 命令写死，不接受任何外部拼接（不把用户输入带进 execFile）。
 *  - `--ff-only`：分叉时直接失败并回显日志，不产生 merge commit 污染仓库。
 *  - 已是最新（`Already up to date`）时跳过 build，避免白跑一次 tsc。
 *  - 失败只返回日志不抛错：调用方把日志摊开给用户看，比弹「更新失败」有用。
 *  - 构建失败时不建议重启（dist 与源码不一致，重启只会加载半成品）。
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { UpdateResult } from './contract.js';

/** 单条命令输出上限：只留末尾，够看错误栈，又不至于把几 MB 构建日志塞进 IPC。 */
const LOG_LIMIT = 8000;
/** 拉取允许慢网；构建允许冷启动 tsc + esbuild。 */
const PULL_TIMEOUT_MS = 120_000;
const BUILD_TIMEOUT_MS = 300_000;
/** 向上找 `.git` 的最大层数（dist → 仓库根通常 1 层，留余量兼容打包布局）。 */
const MAX_UP = 8;

/** 非 git 检出（如 Windows 上直接 npm 装包）时给用户的手动命令。 */
export const MANUAL_UPDATE_CMD = 'cd ~/dsh-cron-board && git pull && pnpm run build';

interface RunResult {
  /** 进程退出码；超时或无有效退出码时按 1 处理。 */
  code: number;
  /** stdout + stderr 合并后的末尾片段。 */
  log: string;
  timedOut: boolean;
}

function realDir(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * 从插件自身位置向上找 git 检出根。
 * @param start 可选起点；给定后只从该目录向上查找（不回落 cwd）。
 * 找不到返回 null —— 说明当前安装不是 git 检出，自动更新不可用。
 */
export function findRepoRoot(start?: string): string | null {
  // 显式给定 start 时只用它（测试与诊断可确定结果）；否则从插件自身位置与 cwd 探测。
  const rawSeeds = typeof start === 'string' && start !== '' ? [start] : [__dirname, process.cwd()];
  const seeds = rawSeeds
    .map((s) => realDir(s))
    .filter((s): s is string => s !== null);
  const visited = new Set<string>();
  for (const seed of seeds) {
    let dir: string = seed;
    for (let up = 0; up < MAX_UP; up += 1) {
      if (visited.has(dir)) break;
      visited.add(dir);
      if (existsSync(join(dir, '.git'))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        const merged = [String(stdout ?? ''), String(stderr ?? '')]
          .map((s) => s.trim())
          .filter((s) => s !== '')
          .join('\n');
        const log = merged.length > LOG_LIMIT ? merged.slice(merged.length - LOG_LIMIT) : merged;
        const errCode = (err as { code?: unknown } | null)?.code;
        const code = err === null || err === undefined ? 0 : typeof errCode === 'number' ? errCode : 1;
        const timedOut = (err as { killed?: unknown } | null)?.killed === true;
        resolve({ code, log, timedOut });
      },
    );
  });
}

function readVersion(root: string): string {
  try {
    const parsed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '';
  } catch {
    return '';
  }
}

/** Windows 上 pnpm 是 `pnpm.cmd`；Electron 主进程 PATH 通常已含用户全局 bin。 */
function pnpmBin(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

/**
 * 执行一键更新。
 * @param start 可选的起点目录（测试用；默认从插件自身位置探测）。
 */
export async function applyUpdate(start?: string): Promise<UpdateResult> {
  const root = findRepoRoot(start);
  if (root === null) {
    return {
      ok: false,
      changed: false,
      version: '',
      needRestart: false,
      stage: 'locate',
      log: `当前安装不是 git 检出，无法自动更新。\n请手动执行：\n${MANUAL_UPDATE_CMD}`,
    };
  }

  const before = readVersion(root);

  const pull = await run('git', ['-C', root, 'pull', '--ff-only'], root, PULL_TIMEOUT_MS);
  if (pull.code !== 0) {
    const hint = pull.timedOut ? '\ngit pull 超时（网络过慢，或仓库需要认证）。' : '';
    return {
      ok: false,
      changed: false,
      version: before,
      needRestart: false,
      stage: 'pull',
      log: `${pull.log}${hint}`.trim(),
    };
  }

  // 已是最新：git 的固定文案，跳过 build
  if (/Already up[ -]to[ -]date|已经是最新的/i.test(pull.log)) {
    return { ok: true, changed: false, version: before, needRestart: false, stage: 'pull', log: pull.log };
  }

  const build = await run(pnpmBin(), ['run', 'build'], root, BUILD_TIMEOUT_MS);
  if (build.code !== 0) {
    const hints: string[] = [];
    if (build.timedOut) hints.push('pnpm run build 超时。');
    if (/ENOENT|not found|不是内部或外部命令|is not recognized/i.test(build.log)) {
      hints.push(`未找到 pnpm，请手动执行：\n${MANUAL_UPDATE_CMD}`);
    }
    return {
      ok: false,
      changed: true,
      version: before,
      // 构建失败：dist 与源码不一致，不要诱导用户重启进半成品
      needRestart: false,
      stage: 'build',
      log: `${pull.log}\n\n${build.log}${hints.length > 0 ? `\n${hints.join('\n')}` : ''}`.trim(),
    };
  }

  const after = readVersion(root);
  return {
    ok: true,
    changed: true,
    version: after === '' ? before : after,
    needRestart: true,
    stage: 'build',
    log: `${pull.log}\n\n${build.log}`.trim(),
  };
}

/**
 * 版本更新检查（方案 A：只提示，不自动改文件）。
 *
 * 数据源：GitHub 公开 REST API，无需 token（匿名额度 60 次/小时，够用）。
 *  - 首选 `releases/latest`（有正式 release 时最准，含 html_url 直达页面）
 *  - 兜底 `tags`（项目可能只打 tag 不发 release）→ 取第一个 tag 名，页面用 releases 列表页
 *
 * 设计约束（对齐仓库铁律「最小注入」）：
 *  - 零依赖，仅用 Node 内置全局 fetch；不引入 semver 包，版本比较走本文件私有实现。
 *  - 纯函数 + 单次网络请求，失败一律 `null`（调用方据此静默隐藏提示，不打扰用户）。
 *  - 结果在内存里缓存 10 分钟：看板头部多次渲染 / 多次点击不会触发重复请求，
 *    同时避免用户在设置里频繁开关面板把匿名额度打光。
 */
import type { UpdateInfo } from './contract.js';

const REPO = 'Hickey-Yuze/dsh-cron-board';
const RELEASES_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const TAGS = `https://api.github.com/repos/${REPO}/tags?per_page=1`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  at: number;
  value: UpdateInfo | null;
}

let cache: CacheEntry | null = null;

/** 去掉可能的 `v` / `V` 前缀与首尾空白。 */
export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^[vV]/, '');
}

/** 解析成数字段（忽略预发布后缀，如 `1.4.0-beta.1` → `[1,4,0]`）。 */
function versionParts(v: string): number[] {
  const core = normalizeVersion(v).split(/[-+]/, 1)[0] ?? '';
  return core
    .split('.')
    .map((seg) => {
      const n = Number.parseInt(seg, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
}

/**
 * 比较两个版本号：`a > b` → 正数，`a < b` → 负数，相等 → 0。
 * 缺位按 0 补齐（`1.4` 等价 `1.4.0`）。
 */
export function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

interface GithubJson {
  [key: string]: unknown;
}

async function getJson(url: string, signal?: AbortSignal): Promise<GithubJson | undefined> {
  // 调用方 signal 与内部超时取先到者：任一触发都不再等待网络。
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const merged = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'dsh-cron-board',
      },
      signal: merged,
    });
    if (!res.ok) return undefined;
    return (await res.json()) as GithubJson;
  } catch {
    return undefined;
  }
}

/**
 * 查询远端最新版本。任何失败（网络 / 限流 / 结构不符）都返回 `null`。
 * @param current 当前版本（package.json 的 version）
 * @param force 跳过缓存（用户手动点击重新检查时传 true）
 */
export async function checkUpdate(
  current: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<UpdateInfo | null> {
  const now = Date.now();
  if (!options.force && cache !== null && now - cache.at < CACHE_TTL_MS) {
    // 缓存命中：但 current 可能变化（热更新 dist），命中时仍按当前值重算 hasUpdate。
    const hit = cache.value;
    if (hit !== null) {
      return { ...hit, current, hasUpdate: compareVersions(hit.latest, current) > 0 };
    }
    return null;
  }

  let latest = '';
  let url = RELEASES_PAGE;

  const release = await getJson(RELEASES_LATEST, options.signal);
  if (release !== undefined && typeof release.tag_name === 'string') {
    latest = normalizeVersion(release.tag_name);
    if (typeof release.html_url === 'string' && release.html_url !== '') url = release.html_url;
  } else {
    const tags = await getJson(TAGS, options.signal);
    if (Array.isArray(tags)) {
      const first: unknown = tags[0];
      if (first !== null && typeof first === 'object') {
        const name = (first as GithubJson).name;
        if (typeof name === 'string') latest = normalizeVersion(name);
      }
    }
  }

  if (latest === '') {
    // 网络不可用或 API 结构异常：不写缓存，下次调用可重试。
    return null;
  }

  const value: UpdateInfo = {
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    url,
  };
  cache = { at: now, value };
  return value;
}

/** 测试与热更新场景用：清空缓存。 */
export function resetUpdateCache(): void {
  cache = null;
}

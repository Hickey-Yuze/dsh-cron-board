/**
 * 技能/专家：清单收集与正文注入。
 *
 * 设计取舍（与宿主解耦）：
 * - 只经 `ctx.get('skills')` 软探测宿主服务，**不 import** `@deepseek-ai/dsh-skill`
 *   的任何导出（该包是 alpha 版且不在本插件依赖内），渲染格式自行拼装。
 * - 宿主没有 skills 服务时一律返回空/空串，插件照常工作。
 * - 市场「专家」运行时就是 skill（安装时 agents/*.md 被转写成 SKILL.md），
 *   靠技能目录下 `.workbuddy-market.json` 的 `kind` 区分，缺失即按 skill 处理。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { MetaSkill } from './contract.js';

/** 与宿主 `SKILL_NAME` 对齐：小写字母数字，连字符分段。 */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 单个技能正文可达 20KB+，一次注入超过 4 个会让 Prompt 严重膨胀。 */
export const MAX_SELECTED_SKILLS = 4;

/** 宿主 skills 服务在 agent preset 层可见 user 技能；全局插件（cron-board）经
 * `ctx.get('skills')` 只能看到 global 层（bundled/插件注册技能）。故 user 级技能
 * 直接扫描文件系统（~/.dsh/skills + ~/.agents/skills，与宿主 skill-filesystem 的
 * user 层一致），host 服务结果只作补充。 */
export function userSkillRoots(): string[] {
  return [join(resolveDshHome(), 'skills'), join(resolveAgentsHome(), 'skills')];
}

function resolveAgentsHome(): string {
  const fromEnv = process.env.DSH_AGENTS_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim();
  return join(homedir(), '.agents');
}

/** 技能文件的最小 frontmatter 解析结果（只取本插件需要的字段）。 */
export interface ParsedSkillFile {
  name: string;
  description: string;
  whenToUse?: string;
  userInvocable: boolean;
  content: string;
  /** SKILL.md 的展示名（`displayName`/`display_name`/`display-name`/`title`），中文原名）。 */
  displayName?: string;
  /** SKILL.md 绝对路径（读本地 marker 用）。 */
  path?: string;
  /** 技能目录绝对路径（resourceBase 用）。 */
  directory?: string;
}

function scalarValue(raw: string): string {
  const t = raw.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function parseBoolValue(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (t === 'true' || t === 'yes' || t === 'on' || t === '1') return true;
  return false;
}

/**
 * 解析 SKILL.md 的 frontmatter：只提取单行标量与 block 标量（`|`/`>` 家族）。
 * 与宿主一致：缺 name+description、name 非 kebab-case 一律返回 undefined。
 * 宽松于宿主（不整块 YAML 校验），坏 frontmatter 的技能仍可列出正文。
 */
export function parseSkillFrontmatter(raw: string): ParsedSkillFile | undefined {
  if (typeof raw !== 'string' || !raw.startsWith('---')) return undefined;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return undefined;
  const block = raw.slice(3, end);
  const body = raw.slice(end + 4).trim();
  const data = new Map<string, string>();
  const lines = block.split(/\r?\n/);
  let pendingKey: string | undefined;
  const pending: string[] = [];
  for (const line of lines) {
    if (pendingKey !== undefined) {
      const trimmed = line.trim();
      if (trimmed === '' || /^\s+/.test(line)) {
        if (trimmed !== '') pending.push(trimmed);
        continue;
      }
      if (pending.length > 0) data.set(pendingKey, pending.join('\n'));
      pendingKey = undefined;
    }
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = scalarValue(line.slice(idx + 1));
    if (value === '|' || value === '|-' || value === '|+' || value === '>' || value === '>-' || value === '>+') {
      pendingKey = key;
      pending.length = 0;
      continue;
    }
    data.set(key, value);
  }
  if (pendingKey !== undefined && pending.length > 0) data.set(pendingKey, pending.join('\n'));
  const name = data.get('name') ?? '';
  const description = data.get('description') ?? '';
  if (name === '' || description === '' || !SKILL_NAME_RE.test(name)) return undefined;
  const userInvocableRaw = data.get('user-invocable');
  const userInvocable = userInvocableRaw === undefined ? true : parseBoolValue(userInvocableRaw);
  const whenToUse = data.get('when-to-use');
  const displayName =
    data.get('display-name') ?? data.get('display_name') ?? data.get('displayname') ?? data.get('title') ?? '';
  return {
    name,
    description,
    ...(whenToUse === undefined || whenToUse === '' ? {} : { whenToUse }),
    ...(displayName === '' ? {} : { displayName }),
    userInvocable,
    content: body,
  };
}

/** 扫一个技能根目录下每个子目录的 SKILL.md（跳过 .system）。 */
export function scanSkillDirectory(root: string): ParsedSkillFile[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ParsedSkillFile[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.system') continue;
    const dir = join(root, entry.name);
    let raw: string;
    try {
      raw = readFileSync(join(dir, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    const parsed = parseSkillFrontmatter(raw);
    if (parsed === undefined) continue;
    out.push({ ...parsed, path: join(dir, 'SKILL.md'), directory: dir });
  }
  return out;
}

/** 全部用户级技能（按 name 去重；~/.dsh 先扫，~/.agents 覆盖同名）。 */
export function scanUserSkills(): Map<string, ParsedSkillFile> {
  const byName = new Map<string, ParsedSkillFile>();
  for (const root of userSkillRoots()) {
    for (const skill of scanSkillDirectory(root)) byName.set(skill.name, skill);
  }
  return byName;
}

interface SkillBaseLike {
  name?: string;
  description?: string;
  path?: string;
  invocation?: { userInvocable?: boolean; modelInvocable?: boolean };
}

interface SkillResourceLike {
  kind?: string;
  path?: string;
  url?: string;
  description?: string;
}

interface SkillDefinitionLike extends SkillBaseLike {
  content?: string;
  resourceBase?: SkillResourceLike;
  provider?: string;
}

interface SkillsServiceLike {
  list?(options?: { cwd?: string; signal?: AbortSignal }): Promise<SkillBaseLike[]>;
  get?(name: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<SkillDefinitionLike | undefined>;
}

/** 软探测宿主 skills 服务（缺失时返回 undefined，调用方按空处理）。 */
function skillsService(ctx: Context): SkillsServiceLike | undefined {
  try {
    const svc = ctx.get('skills') as unknown as SkillsServiceLike | undefined;
    if (!svc) return undefined;
    if (typeof svc.list !== 'function' && typeof svc.get !== 'function') return undefined;
    return svc;
  } catch {
    return undefined;
  }
}

interface MarketMarker {
  kind?: string;
  title?: string;
}

/** 读取技能目录下的市场标记；不存在/非法一律 undefined。 */
function readMarketMarker(skillPath: string | undefined): MarketMarker | undefined {
  if (typeof skillPath !== 'string' || skillPath === '') return undefined;
  try {
    const raw = readFileSync(join(dirname(skillPath), '.workbuddy-market.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const rec = parsed as { kind?: unknown; title?: unknown };
    return {
      ...(typeof rec.kind === 'string' ? { kind: rec.kind } : {}),
      ...(typeof rec.title === 'string' && rec.title.trim() !== '' ? { title: rec.title.trim() } : {}),
    };
  } catch {
    return undefined;
  }
}

/** 市场目录里一个包的展示信息（只保留本插件要用的几样）。 */
export interface MarketDisplay {
  title?: string;
  emoji?: string;
  avatarUrl?: string;
  /** 市场归类：没有本地 marker 的包靠它区分技能与专家。 */
  kind?: 'skill' | 'expert';
}

interface MarketCatalog {
  mtimeMs: number;
  byName: Map<string, MarketDisplay>;
}

/**
 * 市场目录缓存的进程内单例。
 * catalog.json 有 1.6MB，meta 每次调用都重解析会拖慢弹层，故按 mtime 失效。
 */
let catalogCache: MarketCatalog | null = null;

/** DSH 根目录：优先环境变量，回落 `~/.dsh`（与宿主一致）。 */
function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim();
  return join(homedir(), '.dsh');
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 读取市场 catalog，按包名索引展示信息。
 *
 * 显示名与 yuze-market 保持一致：专家取 `profession`（「干什么的」），
 * 技能取 `title`——专家的 `title` 是人名，放在这里会让人认不出岗位。
 *
 * 导出仅为冒烟测试断言（展示名/头像/归类）；插件内部只经 `collectSkills` 间接使用。
 */
export function marketDisplayMap(): Map<string, MarketDisplay> {
  const file = join(resolveDshHome(), 'workbuddy-market', 'cache', 'catalog.json');
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return new Map();
  }
  if (catalogCache !== null && catalogCache.mtimeMs === mtimeMs) return catalogCache.byName;
  const byName = new Map<string, MarketDisplay>();
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return byName;
    const sections = raw as { experts?: { items?: unknown }; skills?: { items?: unknown } };
    const collect = (items: unknown, kind: 'expert' | 'skill'): void => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue;
        const rec = item as Record<string, unknown>;
        const name = pickText(rec.name);
        if (name === '' || byName.has(name)) continue;
        const title =
          kind === 'expert' ? pickText(rec.profession) || pickText(rec.title) : pickText(rec.title);
        const emoji = pickText(rec.emoji);
        const avatarUrl = pickText(rec.avatarUrl);
        const display: MarketDisplay = { kind };
        if (title !== '') display.title = title;
        if (emoji !== '') display.emoji = emoji;
        if (/^https?:\/\//i.test(avatarUrl)) display.avatarUrl = avatarUrl;
        byName.set(name, display);
      }
    };
    collect(sections.experts?.items, 'expert');
    collect(sections.skills?.items, 'skill');
  } catch {
    // 目录损坏或格式变化：按「无市场信息」处理，meta 不该因此失败
    return new Map();
  }
  catalogCache = { mtimeMs, byName };
  return byName;
}

/** 纯函数：把单个技能定义渲染成宿主 `renderSkillContent` 同形状的文本。 */
export function renderSkillContent(skill: SkillDefinitionLike): string {
  const name = typeof skill.name === 'string' ? skill.name : '';
  const base = skill.resourceBase;
  let hint: string;
  if (base === undefined) {
    hint = 'Resources for this skill are managed by its provider.\nLoad referenced resources only as needed.';
  } else if (base.kind === 'directory' && typeof base.path === 'string') {
    hint = `Base directory for this skill: ${base.path}`;
  } else if (base.kind === 'url' && typeof base.url === 'string') {
    hint = `Base URL for this skill: ${base.url}`;
  } else if (typeof base.description === 'string') {
    hint = `Resources for this skill: ${base.description}`;
  } else {
    hint = 'Load referenced resources only as needed.';
  }
  const content = typeof skill.content === 'string' ? skill.content : '';
  return [
    `<skill_content name="${name}">`,
    '<skill_resources>',
    hint,
    '</skill_resources>',
    '',
    '<skill_instructions>',
    content,
    '</skill_instructions>',
    '</skill_content>',
  ].join('\n');
}

/**
 * 收集可用于任务注入的技能清单（摘要，不含正文）。
 * `cwd` 传入任务钉住的工作区路径，才能看到该工作区下的技能。
 *
 * 来源（合并去重，user 层优先）：
 * 1. 文件系统 user 级技能（~/.dsh/skills + ~/.agents/skills）——宿主 skills 服务
 *    在 agent preset 层，全局插件经 `ctx.get('skills')` 读不到；
 * 2. 宿主服务可见技能（bundled / 插件注册的 runtime 技能），作补充。
 */
export async function collectSkills(ctx: Context, cwd?: string): Promise<MetaSkill[]> {
  const svc = skillsService(ctx);
  const market = marketDisplayMap();
  const out: MetaSkill[] = [];
  const seen = new Set<string>();

  // 1) 用户级技能：直接扫文件系统（带本地 marker 的中文名/归类）
  for (const s of scanUserSkills().values()) {
    if (!s.userInvocable) continue;
    const name = s.name;
    if (seen.has(name)) continue;
    seen.add(name);
    const marker = readMarketMarker(s.path);
    const display = market.get(name);
    // 市场目录优先（与 yuze-market 一致），其次 SKILL.md 自带展示名（中文原名），
    // 再次本地 marker，最后 UI 回落 name
    const title = display?.title ?? s.displayName ?? marker?.title;
    out.push({
      name,
      description: s.description,
      kind: marker?.kind === 'expert' || (marker === undefined && display?.kind === 'expert') ? 'expert' : 'skill',
      ...(title === undefined ? {} : { title }),
      ...(display?.emoji === undefined ? {} : { emoji: display.emoji }),
      ...(display?.avatarUrl === undefined ? {} : { avatarUrl: display.avatarUrl }),
    });
  }

  // 2) 宿主服务可见技能（user 层同名已被上面占据，这里只补 host 独有）
  if (svc?.list) {
    let list: SkillBaseLike[];
    try {
      list = (await svc.list(cwd === undefined ? {} : { cwd })) ?? [];
    } catch {
      list = [];
    }
    for (const s of list) {
      const name = typeof s?.name === 'string' ? s.name : '';
      if (name === '' || seen.has(name) || !SKILL_NAME_RE.test(name)) continue;
      if (s.invocation?.userInvocable !== true) continue;
      seen.add(name);
      const marker = readMarketMarker(s.path);
      const display = market.get(name);
      const title = display?.title ?? marker?.title;
      out.push({
        name,
        description: typeof s.description === 'string' ? s.description : '',
        kind: marker?.kind === 'expert' || (marker === undefined && display?.kind === 'expert') ? 'expert' : 'skill',
        ...(title === undefined ? {} : { title }),
        ...(display?.emoji === undefined ? {} : { emoji: display.emoji }),
        ...(display?.avatarUrl === undefined ? {} : { avatarUrl: display.avatarUrl }),
      });
    }
  }

  // 技能在前、专家在后，各自按名字排序，便于 UI 稳定分组
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'skill' ? -1 : 1));
  return out;
}

/**
 * 按名字取正文并拼成注入文本；任一失败跳过（非致命）。
 * 返回空串表示无需注入。
 *
 * 加载顺序：文件系统 user 级技能（宿主服务读不到 user 层）→ 宿主服务兜底。
 */
export async function renderSelectedSkills(ctx: Context, names: string[] | undefined, cwd?: string): Promise<string> {
  if (!names || names.length === 0) return '';
  const svc = skillsService(ctx);
  const userSkills = scanUserSkills();
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name === '' || seen.has(name) || !SKILL_NAME_RE.test(name)) continue;
    if (seen.size >= MAX_SELECTED_SKILLS) break;
    seen.add(name);
    const fileSkill = userSkills.get(name);
    if (fileSkill !== undefined) {
      parts.push(
        renderSkillContent({
          name: fileSkill.name,
          description: fileSkill.description,
          content: fileSkill.content,
          resourceBase:
            fileSkill.directory === undefined
              ? undefined
              : { kind: 'directory' as const, path: fileSkill.directory },
          provider: 'filesystem',
        }),
      );
      continue;
    }
    if (!svc?.get) continue;
    let def: SkillDefinitionLike | undefined;
    try {
      def = await svc.get(name, cwd === undefined ? {} : { cwd });
    } catch {
      def = undefined;
    }
    if (!def || typeof def.content !== 'string') continue;
    parts.push(renderSkillContent({ ...def, name }));
  }
  return parts.join('\n\n');
}

/** 注入前缀：明确告诉模型这些是随任务下发的技能说明，不是用户原话。 */
export const SKILLS_INJECT_HEADER = '以下技能由定时任务配置注入，请按其中的指引工作：';

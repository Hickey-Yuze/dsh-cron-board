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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { MetaSkill } from './contract.js';

/** 与宿主 `SKILL_NAME` 对齐：小写字母数字，连字符分段。 */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 单个技能正文可达 20KB+，一次注入超过 4 个会让 Prompt 严重膨胀。 */
export const MAX_SELECTED_SKILLS = 4;

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
 */
export async function collectSkills(ctx: Context, cwd?: string): Promise<MetaSkill[]> {
  const svc = skillsService(ctx);
  if (!svc?.list) return [];
  let list: SkillBaseLike[];
  try {
    list = (await svc.list(cwd === undefined ? {} : { cwd })) ?? [];
  } catch {
    return [];
  }
  const out: MetaSkill[] = [];
  const seen = new Set<string>();
  for (const s of list) {
    const name = typeof s?.name === 'string' ? s.name : '';
    if (name === '' || seen.has(name) || !SKILL_NAME_RE.test(name)) continue;
    // 只列用户可主动调用的技能（模型专用技能不该出现在任务配置里）
    if (s.invocation?.userInvocable !== true) continue;
    seen.add(name);
    const marker = readMarketMarker(s.path);
    out.push({
      name,
      description: typeof s.description === 'string' ? s.description : '',
      kind: marker?.kind === 'expert' ? 'expert' : 'skill',
      ...(marker?.title === undefined ? {} : { title: marker.title }),
    });
  }
  // 技能在前、专家在后，各自按名字排序，便于 UI 稳定分组
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'skill' ? -1 : 1));
  return out;
}

/**
 * 按名字取正文并拼成注入文本；任一失败跳过（非致命）。
 * 返回空串表示无需注入。
 */
export async function renderSelectedSkills(ctx: Context, names: string[] | undefined, cwd?: string): Promise<string> {
  if (!names || names.length === 0) return '';
  const svc = skillsService(ctx);
  if (!svc?.get) return '';
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name === '' || seen.has(name) || !SKILL_NAME_RE.test(name)) continue;
    if (seen.size >= MAX_SELECTED_SKILLS) break;
    seen.add(name);
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

/**
 * 会话渠道徽标（docs/PRD-会话渠道徽标.md 落地 · cron 渠道 · v4 自定义徽标）：
 *
 * 对齐策略（v2 教训：seat slot 内右移被宿主 justify-content:center 吃掉一半，
 * 各行表现不一致）：与 dsh-im 渠道徽标同构——把徽标节点直接插入 title span
 * 文字流开头（row.children[1]），同 DOM 同 CSS 流 → 与微信徽标天然对齐。
 *
 * 1. seat 组件仍注册宿主 `sidebar.session.row.leading`，但只作生命周期锚点
 *    （渲染 display:none 占位，slot 格子留空）；挂载时向 title 注入徽标节点
 *    （幂等 + 指纹替换），卸载不删除——运行中宿主用状态点替换 seat（PRD G5）
 *    时 title 徽标仍常驻可见，与状态点不同位不冲突。插件禁用/页面刷新时
 *    宿主重渲染 title span 自然消失。
 * 2. 徽标内容 = 所属任务的 badge 设置（contract.ts TaskBadge）：
 *    null/缺省 → 琥珀日历时钟（全局类）；emoji → 文字；icon → 预设 path mask
 *    + 色板色（内联样式，色随任务）；image → 上传图标 data URI。
 * 3. 命中判定：sessionId 属于账本 map（cron-board/session-ids → id→badge，
 *    server 侧解析）；`cron-` 前缀会话不等 map 先渲染默认时钟，map 到达后按
 *    指纹升级/替换。任务未在 map（非 cron-board 会话）零注入。
 * 4. 不改任何会话标题文本；全部 DOM 操作 try/catch 兜底——宿主结构变更最多
 *    徽标不显示，绝不报错。
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { BADGE_COLORS, BADGE_ICONS } from '../../src/contract.js';
import type { TaskBadge } from '../../src/contract.js';
import { t } from './i18n.js';
import type { RpcFn } from './rpc.js';

export const CRON_CHANNEL_COLOR = '#F59E0B';
export const BADGE_STYLE_ID = 'dsh-cron-board-badge-style';
export const BADGE_CLASS = 'dsh-cb-title-badge';
/** 徽标节点统一标记（防重 + 指纹替换）。 */
export const BADGE_ATTR = 'data-dsh-cb-badge';
/** 徽标配置变更事件（detail 保存后触发，侧边栏即时重拉）。 */
export const BADGE_UPDATE_EVENT = 'dsh-cron-board-badge-updated';
/** 行容器选择器（PRD 初值；宿主侧栏行以 data-row-key="session:<id>" 标识）。 */
export const ROW_SELECTOR = '[data-row-key^="session:"]';

/** path 段数组 → mask 用 SVG data URI（默认时钟与 icon 徽标共用一份 path 源）。 */
function maskUri(paths: readonly string[]): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${paths
    .map((d) => `<path d="${d}"/>`)
    .join('')}</svg>`;
  return encodeURIComponent(svg);
}

/* ── 账本兜底映射：页面生命周期内缓存，任务徽标变更后失效重拉 ── */

let ledgerPromise: Promise<Map<string, TaskBadge | null>> | null = null;

export function fetchLedgerMap(rpc: RpcFn): Promise<Map<string, TaskBadge | null>> {
  ledgerPromise ??= rpc('cron-board/session-ids')
    .then((res) => (res.ok ? new Map<string, TaskBadge | null>(Object.entries(res.value.map)) : new Map<string, TaskBadge | null>()))
    .catch(() => new Map<string, TaskBadge | null>());
  return ledgerPromise;
}

/** 任务徽标保存后调用：清缓存 + 广播事件，让已挂载的徽标即时重拉刷新。 */
export function invalidateLedgerMap(): void {
  ledgerPromise = null;
  try {
    window.dispatchEvent(new CustomEvent(BADGE_UPDATE_EVENT));
  } catch {
    /* 非 DOM 环境：忽略 */
  }
}

/* ── 徽标节点构造 ── */

/** 徽标指纹：注入节点幂等/替换依据（任务改徽标 → 指纹变化 → 节点替换）。 */
export function badgeFingerprint(badge: TaskBadge | null): string {
  if (badge === null) return 'default';
  if (badge.kind === 'emoji') return `emoji:${badge.value}`;
  if (badge.kind === 'icon') return `icon:${badge.value}:${badge.color ?? ''}`;
  return `image:${badge.data.length}`;
}

function applyGeometry(el: HTMLElement, size: number, marginRight: number): void {
  el.style.display = 'inline-block';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.marginRight = `${marginRight}px`;
  el.style.verticalAlign = '-2px';
}

/** 按任务徽标构造节点（默认=时钟类；其余内联样式，色/形随任务）。 */
export function buildBadgeNode(badge: TaskBadge | null): HTMLElement {
  let el: HTMLElement;
  if (badge !== null && badge.kind === 'emoji') {
    const span = document.createElement('span');
    span.textContent = badge.value;
    span.style.fontSize = '14px';
    span.style.lineHeight = '1';
    span.style.marginRight = '6px';
    el = span;
  } else if (badge !== null && badge.kind === 'image') {
    const img = document.createElement('img');
    img.src = `data:${badge.mediaType};base64,${badge.data}`;
    img.alt = '';
    applyGeometry(img, 15, 6);
    img.style.objectFit = 'contain';
    el = img;
  } else if (badge !== null && badge.kind === 'icon') {
    const span = document.createElement('span');
    const paths = BADGE_ICONS[badge.value];
    const color =
      badge.color !== undefined && badge.color in BADGE_COLORS
        ? (BADGE_COLORS[badge.color] ?? CRON_CHANNEL_COLOR)
        : CRON_CHANNEL_COLOR;
    applyGeometry(span, 15, 6);
    if (paths !== undefined) {
      const uri = `url("data:image/svg+xml,${maskUri(paths)}") no-repeat center / contain`;
      span.style.backgroundColor = color;
      span.style.webkitMask = uri;
      span.style.mask = uri;
    }
    el = span;
  } else {
    const span = document.createElement('span');
    span.className = BADGE_CLASS;
    el = span;
  }
  el.setAttribute(BADGE_ATTR, badgeFingerprint(badge));
  el.setAttribute('aria-hidden', 'true');
  el.title = t('badge.title');
  return el;
}

/* ── 一次性样式注入（幂等 + 热更新安全）：默认时钟徽标类 ── */

export function ensureBadgeStyle(): void {
  if (typeof document === 'undefined') return;
  const css = `
.${BADGE_CLASS} {
  display: inline-block;
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin-right: 6px;
  vertical-align: -2px;
  background-color: ${CRON_CHANNEL_COLOR};
  -webkit-mask: url("data:image/svg+xml,${maskUri(BADGE_ICONS.clock!)}") no-repeat center / contain;
  mask: url("data:image/svg+xml,${maskUri(BADGE_ICONS.clock!)}") no-repeat center / contain;
}`;
  let style = document.getElementById(BADGE_STYLE_ID) as HTMLStyleElement | null;
  try {
    if (style === null) {
      style = document.createElement('style');
      style.id = BADGE_STYLE_ID;
      document.head.appendChild(style);
    }
    // 热更新安全：内容比对更新，旧徽标样式不再永久占坑。
    if (style.textContent !== css) style.textContent = css;
  } catch {
    /* 宿主 head 异常：徽标退化，不报错 */
  }
}

/* ── seat 锚点组件（宿主 renderSlot 传 { sessionId }，inject 传 { rpc }） ── */

export function ChannelBadge(props: { sessionId?: string; rpc?: RpcFn }): ReactElement {
  const { sessionId, rpc } = props;
  const rowRef = useRef<HTMLSpanElement | null>(null);
  // undefined=未拉取（前缀会话先按默认渲染）；null=任务无自定义；对象=任务徽标。
  const [ledgerBadge, setLedgerBadge] = useState<TaskBadge | null | undefined>(undefined);

  useEffect(() => {
    setLedgerBadge(undefined);
    if (sessionId === undefined || sessionId === '' || rpc === undefined) return;
    let disposed = false;
    const pull = (): void => {
      void fetchLedgerMap(rpc).then((map) => {
        if (!disposed) setLedgerBadge(map.get(sessionId) ?? null);
      });
    };
    pull();
    // 任务改徽标 → detail 保存成功后 invalidate 广播 → 已挂载行即时刷新。
    window.addEventListener(BADGE_UPDATE_EVENT, pull);
    return () => {
      disposed = true;
      window.removeEventListener(BADGE_UPDATE_EVENT, pull);
    };
  }, [sessionId, rpc]);

  const hit =
    sessionId !== undefined && sessionId !== '' && (sessionId.startsWith('cron-') || ledgerBadge !== undefined);
  const badge: TaskBadge | null = ledgerBadge ?? null;

  // title 注入：命中即向 row.children[1]（title span）开头插入徽标节点。
  // 幂等（BADGE_ATTR 标记）+ 指纹替换（任务徽标变化 → 节点内容升级）；
  // 卸载不删除——运行中 seat 被状态点替换后徽标仍随 title 常驻（G5）。
  useEffect(() => {
    if (sessionId === undefined || sessionId === '' || !hit) return;
    try {
      const row = rowRef.current?.closest(ROW_SELECTOR) ?? null;
      const second = row?.children[1];
      if (second instanceof HTMLElement && second.tagName === 'SPAN') {
        const fp = badgeFingerprint(badge);
        const existing = second.querySelector<HTMLElement>(`[${BADGE_ATTR}]`);
        if (existing === null) {
          second.insertBefore(buildBadgeNode(badge), second.firstChild);
        } else if (existing.getAttribute(BADGE_ATTR) !== fp) {
          existing.replaceWith(buildBadgeNode(badge));
        }
      }
    } catch {
      /* 宿主 DOM 变更：退化，不报错 */
    }
  }, [sessionId, hit, badge]);

  // slot 格子内只渲染隐形锚点（用于 closest 定位行容器），格子保持留空。
  return <span ref={rowRef} style={{ display: 'none' }} aria-hidden="true" />;
}

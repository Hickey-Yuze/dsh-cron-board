/**
 * 会话渠道徽标（docs/PRD-会话渠道徽标.md 落地 · cron 渠道 · v3 title 注入）：
 *
 * 对齐策略（v2 教训：seat slot 内右移被宿主 justify-content:center 吃掉一半，
 * 各行表现不一致）：与 dsh-im 渠道徽标同构——把徽标节点直接插入 title span
 * 文字流开头（row.children[1]），同 DOM 同 CSS 流 → 与微信徽标天然对齐。
 *
 * 1. seat 组件仍注册宿主 `sidebar.session.row.leading`，但只作生命周期锚点
 *    （渲染 display:none 占位，slot 格子留空）；挂载时向 title 注入 15px 琥珀
 *    日历时钟（幂等，.dsh-cb-title-badge 标记），卸载不删除——运行中宿主用
 *    状态点替换 seat（PRD G5）时 title 徽标仍常驻可见，与状态点不同位不冲突，
 *    无需 B1/::before 互斥。插件禁用/页面刷新时宿主重渲染 title span 自然消失。
 * 2. 命中判定：sessionId 带 `cron-` 前缀（新会话）∨ 账本 sessionId 集合
 *    （cron-board/session-ids 端点兜底存量）。未命中零注入。
 * 3. 不改任何会话标题文本；全部 DOM 操作 try/catch 兜底——宿主结构变更最多
 *    徽标不显示，绝不报错。
 */
import { createElement, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from './i18n.js';
import type { RpcFn } from './rpc.js';

export const CRON_CHANNEL_COLOR = '#F59E0B';
export const BADGE_STYLE_ID = 'dsh-cron-board-badge-style';
export const BADGE_CLASS = 'dsh-cb-title-badge';
/** 行容器选择器（PRD 初值；宿主侧栏行以 data-row-key="session:<id>" 标识）。 */
export const ROW_SELECTOR = '[data-row-key^="session:"]';

/** 日历时钟 path（与侧边栏入口 entry.tsx ICON_SVG 同款）。 */
const CLOCK_PATHS = [
  'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3',
  'M3 10h18',
  'M8 2v4',
  'M16 2v4',
  'M17 15v2l1.5 1.5',
] as const;

/* ── 命中判定 ── */

export function isCronSession(sessionId: string, extra?: ReadonlySet<string>): boolean {
  if (sessionId.startsWith('cron-')) return true;
  return extra?.has(sessionId) ?? false;
}

/** 账本兜底集合：页面生命周期内拉一次，并发共享同一 Promise；失败静默（空集）。 */
let ledgerPromise: Promise<Set<string>> | null = null;

export function fetchLedgerIds(rpc: RpcFn): Promise<Set<string>> {
  ledgerPromise ??= rpc('cron-board/session-ids')
    .then((res) => (res.ok ? new Set<string>(res.value.ids) : new Set<string>()))
    .catch(() => new Set<string>());
  return ledgerPromise;
}

/* ── 一次性样式注入（幂等）：title 内徽标类 ── */

export function ensureBadgeStyle(): void {
  if (typeof document === 'undefined') return;
  const maskSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${CLOCK_PATHS[0]}"/><path d="${CLOCK_PATHS[1]}"/><path d="${CLOCK_PATHS[2]}"/><path d="${CLOCK_PATHS[3]}"/><circle cx="17" cy="17" r="5"/><path d="${CLOCK_PATHS[4]}"/></svg>`,
  );
  const css = `
.${BADGE_CLASS} {
  display: inline-block;
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin-right: 6px;
  vertical-align: -2px;
  background-color: ${CRON_CHANNEL_COLOR};
  -webkit-mask: url("data:image/svg+xml,${maskSvg}") no-repeat center / contain;
  mask: url("data:image/svg+xml,${maskSvg}") no-repeat center / contain;
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
  const [ledgerHit, setLedgerHit] = useState(false);

  // 命中判定：前缀即时命中；账本兜底异步补判（存量 hex 会话）。
  useEffect(() => {
    setLedgerHit(false);
    if (
      sessionId === undefined ||
      sessionId === '' ||
      sessionId.startsWith('cron-') ||
      rpc === undefined
    ) {
      return;
    }
    let disposed = false;
    void fetchLedgerIds(rpc).then((ids) => {
      if (!disposed && ids.has(sessionId)) setLedgerHit(true);
    });
    return () => {
      disposed = true;
    };
  }, [sessionId, rpc]);

  // title 注入：命中即向 row.children[1]（title span）开头插入徽标节点。
  // 幂等（.dsh-cb-title-badge 已存在跳过）；卸载不删除——运行中 seat 被状态点
  // 替换后徽标仍随 title 常驻（G5），宿主重渲染 title 时自然回收。
  useEffect(() => {
    if (sessionId === undefined || sessionId === '') return;
    if (!isCronSession(sessionId) && !ledgerHit) return;
    try {
      const row = rowRef.current?.closest(ROW_SELECTOR) ?? null;
      const second = row?.children[1];
      if (second instanceof HTMLElement && second.tagName === 'SPAN') {
        if (second.querySelector(`.${BADGE_CLASS}`) === null) {
          const badge = document.createElement('span');
          badge.className = BADGE_CLASS;
          badge.setAttribute('aria-hidden', 'true');
          second.insertBefore(badge, second.firstChild);
        }
      }
    } catch {
      /* 宿主 DOM 变更：退化，不报错 */
    }
  }, [sessionId, ledgerHit]);

  // slot 格子内只渲染隐形锚点（用于 closest 定位行容器），格子保持留空。
  return <span ref={rowRef} style={{ display: 'none' }} aria-hidden="true" />;
}

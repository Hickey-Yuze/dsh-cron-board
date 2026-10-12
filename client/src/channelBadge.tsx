/**
 * 会话渠道徽标（docs/PRD-会话渠道徽标.md 落地 · cron 渠道）：
 *
 * 1. seat 徽标：注册宿主 `sidebar.session.row.leading`（行首只读 seat，{ sessionId }）。
 *    命中判定：sessionId 带 `cron-` 前缀（新会话，src/util.ts newSessionId）∨ 在
 *    账本 sessionId 集合内（cron-board/session-ids 端点，兜底存量会话）。未命中
 *    返回 null（零渲染开销）。渲染 16px 琥珀日历时钟 + hover「定时任务会话」。
 * 2. 运行中可见（PRD B1 变体，零常驻 observer）：宿主在会话运行中用状态点替换行首
 *    seat —— 本组件 unmount 时给所在行打 data-cb-running，注入 CSS 的 ::before 在
 *    行首画同款徽标（mask 内联 SVG，无外链）；组件重新挂载（恢复空闲）时移除属性。
 *    生命周期互斥：空闲=seat 徽标，运行中=::before 徽标，绝不双标。
 * 3. 不改任何会话标题文本；全部 DOM 操作 try/catch 兜底——宿主结构变更最多徽标
 *    不显示，绝不报错；禁用插件即全部恢复。
 */
import { createElement, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from './i18n.js';
import type { RpcFn } from './rpc.js';

export const CRON_CHANNEL_COLOR = '#F59E0B';
export const BADGE_STYLE_ID = 'dsh-cron-board-badge-style';
export const RUNNING_ATTR = 'data-cb-running';
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

/* ── 一次性样式注入（幂等） ── */

export function ensureBadgeStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(BADGE_STYLE_ID) !== null) return;
  const maskSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${CLOCK_PATHS[0]}"/><path d="${CLOCK_PATHS[1]}"/><path d="${CLOCK_PATHS[2]}"/><path d="${CLOCK_PATHS[3]}"/><circle cx="17" cy="17" r="5"/><path d="${CLOCK_PATHS[4]}"/></svg>`,
  );
  const style = document.createElement('style');
  style.id = BADGE_STYLE_ID;
  style.textContent = `
${ROW_SELECTOR}[${RUNNING_ATTR}]::before {
  content: '';
  display: inline-block;
  flex: 0 0 auto;
  align-self: center;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  vertical-align: -2px;
  background-color: ${CRON_CHANNEL_COLOR};
  -webkit-mask: url("data:image/svg+xml,${maskSvg}") no-repeat center / contain;
  mask: url("data:image/svg+xml,${maskSvg}") no-repeat center / contain;
}`;
  try {
    document.head.appendChild(style);
  } catch {
    /* 宿主 head 异常：徽标退化，不报错 */
  }
}

/* ── seat 徽标组件（宿主 renderSlot 传 { sessionId }，inject 传 { rpc }） ── */

export function ChannelBadge(props: { sessionId?: string; rpc?: RpcFn }): ReactElement | null {
  const { sessionId, rpc } = props;
  const rowRef = useRef<HTMLSpanElement | null>(null);
  const [ledgerHit, setLedgerHit] = useState(false);

  // 命中判定：前缀即时返回；账本兜底异步补判（存量 hex 会话）。
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

  // B1 生命周期互斥：挂载=空闲（清属性）；unmount=宿主用状态点替换了 seat（打属性，
  // ::before 接管行首）。行容器缺失时静默退化（仅运行中徽标缺失，seat 仍正常）。
  // 同时做视觉对齐：官方 slot 在 title 之前（16px 格 + title 4px margin），而 dsh-im
  // 等渠道徽标注入在 title 内部——seat 图标右移 20px 补到 title 内容起点，title 推
  // 20px 防重叠；卸载即还原，结构变更防御性跳过（children[1] 非 span 不动）。
  useEffect(() => {
    let row: Element | null = null;
    let titleEl: HTMLElement | null = null;
    try {
      row = rowRef.current?.closest(ROW_SELECTOR) ?? null;
      row?.removeAttribute(RUNNING_ATTR);
      const second = row?.children[1];
      if (second instanceof HTMLElement && second.tagName === 'SPAN') {
        titleEl = second;
        titleEl.style.paddingLeft = '20px';
      }
    } catch {
      /* 宿主 DOM 变更：退化，不报错 */
    }
    return () => {
      try {
        row?.setAttribute(RUNNING_ATTR, '');
        if (titleEl !== null) titleEl.style.paddingLeft = '';
      } catch {
        /* 同上 */
      }
    };
  }, [sessionId]);

  if (sessionId === undefined || sessionId === '') return null;
  if (!isCronSession(sessionId) && !ledgerHit) return null;

  return (
    <span
      ref={rowRef}
      title={t('badge.title')}
      style={{ display: 'inline-flex', flexShrink: 0, alignItems: 'center', width: 16, height: 16, marginLeft: 20, marginRight: 0 }}
    >
      <svg
        viewBox="0 0 24 24"
        width={16}
        height={16}
        fill="none"
        stroke={CRON_CHANNEL_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={CLOCK_PATHS[0]} />
        <path d={CLOCK_PATHS[1]} />
        <path d={CLOCK_PATHS[2]} />
        <path d={CLOCK_PATHS[3]} />
        <circle cx="17" cy="17" r="5" />
        <path d={CLOCK_PATHS[4]} />
      </svg>
    </span>
  );
}

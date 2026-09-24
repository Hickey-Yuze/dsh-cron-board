/**
 * dsh-cron-board — browser half（TS/TSX 源，scripts/build-client.mjs 经 esbuild
 * 打包为 dist/client.js 单文件 bundle）。
 *
 * 1. 侧栏入口（DOM 注入）：照 dsh-task-board 验证过的 sidebar-entry-core 模式——
 *    root 取 logoRow 的父元素，入口插在「新会话」行之后；root + body 双
 *    MutationObserver 自愈（React 重渲染同帧重插，整树重建后重查询）。
 * 2. 中央看板（main 键位面板，key = dsh-cron-board，不遮蔽会话页）；
 * 3. 设置 → 定时任务看板（settings.section）：推送通道/默认目标/参数说明。
 *
 * 数据通道：ctx.connection.rpc.call('/rpc', 'cron-board/*', payload) → Host 侧 RPC
 * （类型契约见 src/contract.ts，两端共享同一事实源）。
 *
 * 产物形态对齐官方 client bundle 的 handoff 协议：
 *   window.__ModuleLoader__.load({ id, factory })，
 *   factory(require) 返回 { apply, inject }（wrapper 由构建脚本生成）。
 */
import type { CronBoardClientCtx } from './env.js';
import { ensureThemeStyle } from './theme.js';
import { initI18n, t } from './i18n.js';
import { BoardPanel } from './board.js';
import { PANEL_ID } from './panel-icon.js';
import { makeRpc } from './rpc.js';
import { SettingsPanel } from './settings.js';

export const inject = ['slots', 'layout', 'locale', 'sessions'];

/** 日历时钟图标（与原 PanelIcon 同款）。 */
const ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/><circle cx="17" cy="17" r="5"/><path d="M17 15v2l1.5 1.5"/></svg>';

/**
 * 侧栏入口按钮的 DOM 注入（照 dsh-task-board sidebar-entry-core 验证过的结构）：
 * root = logoRow 的父元素；入口插在「新会话」行（logoRow）之后。
 */
function injectSidebarEntry(ctx: CronBoardClientCtx): () => void {
  const ROW_ATTR = 'data-dsh-cron-board-entry';
  const ROW_SELECTOR = `[${ROW_ATTR}]`;

  // DOM 级幂等（对齐 dsh-task-board）：重复 apply / HMR 重注入 / 残留模块再次
  // 挂载时，绝不创建第二个入口——已存在的按钮继续工作，整页刷新才是终极重置。
  if (typeof document !== 'undefined' && document.querySelector(ROW_SELECTOR) !== null) {
    return () => {};
  }

  let disposed = false;
  let root: HTMLElement | undefined;
  let placed = false;
  let rootObserver: MutationObserver | undefined;
  let bodyObserver: MutationObserver | undefined;

  /** 侧栏 UI root：column > wrapper > root(logoRow 所有者)。 */
  function sidebarRoot(): HTMLElement | undefined {
    const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]');
    if (column === null) return undefined;
    const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement;
    return logoOwner ?? (column.firstElementChild as HTMLElement | undefined);
  }

  /** 「新会话」按钮：当前 shell 嵌在 logo 行里，旧 shell 是 root 直接子级。 */
  function newSessionButton(r: HTMLElement): HTMLButtonElement | undefined {
    const nested = r.querySelector<HTMLButtonElement>('button[class*="newSession"]');
    if (nested != null) return nested;
    for (const child of r.children) {
      if (child.tagName === 'BUTTON') return child as HTMLButtonElement;
    }
    return undefined;
  }

  /** 入口按钮（detach 状态创建一次；shell 重建时整体重插）。 */
  function createEntry(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ROW_ATTR, '');
    btn.className = 'dsh-cron-board-sidebar-btn';
    btn.setAttribute('aria-label', t('panel.label'));
    btn.title = t('panel.label');
    // 接线标记：构建脚本检查产物含 'sidebar.panellist'（UI 由本 DOM 注入提供，不再注册该 slot）。
    btn.dataset.wire = 'sidebar.panellist';
    btn.innerHTML = `<span class="dsh-cron-board-sidebar-icon">${ICON_SVG}</span><span class="dsh-cron-board-sidebar-label"></span>`;
    const label = btn.querySelector<HTMLElement>('.dsh-cron-board-sidebar-label');
    if (label) label.textContent = t('panel.label');
    btn.addEventListener('click', () => {
      ctx.layout.selectPanel(PANEL_ID);
    });
    return btn;
  }

  const entry = createEntry();

  /** 插到「新会话」行之后（root 直接子级层级，不依赖瞬态几何），宽度对齐该行。 */
  function placeEntry(r: HTMLElement): boolean {
    const button = newSessionButton(r);
    if (button === undefined) return false;
    if (entry.parentElement !== r) {
      const row = button.closest<HTMLElement>('[class*="logoRow"]');
      const base = row !== null && row.parentElement === r ? row : button;
      r.insertBefore(entry, base.nextElementSibling);
    }
    // 宽度对齐「新会话」行：与宿主按钮完全同宽同边距（长宽比一致）。
    const refRow = button.closest<HTMLElement>('[class*="logoRow"]') ?? button;
    entry.style.width = `${refRow.offsetWidth}px`;
    return true;
  }

  function tryPlace(): void {
    if (disposed) return;
    if (root !== undefined && !root.isConnected) {
      // shell 重建了整个侧栏 pane：root observer 随旧树消亡，从头重查。
      rootObserver?.disconnect();
      rootObserver = undefined;
      root = undefined;
      placed = false;
    }
    if (placed) {
      if (document.body.contains(entry)) return; // 仍挂着：廉价短路
      rootObserver?.disconnect();
      rootObserver = undefined;
      root = undefined;
      placed = false;
    }
    root ??= sidebarRoot();
    if (root === undefined) return;
    placed = placeEntry(root);
    if (placed) {
      rootObserver ??= new MutationObserver(() => {
        if (root === undefined || !root.isConnected) {
          placed = false;
          tryPlace();
          return;
        }
        if (!root.contains(entry)) placed = placeEntry(root);
      });
      rootObserver.observe(root, { childList: true, subtree: true });
    }
  }

  // body 级 watcher：整树重建的兜底（root observer 随旧树消亡时只有它能发现新 pane）。
  bodyObserver = new MutationObserver(() => tryPlace());
  bodyObserver.observe(document.body, { childList: true, subtree: true });
  // 首次尝试（shell 可能已挂载；没挂载由 body watcher 兜底）。
  tryPlace();

  return () => {
    disposed = true;
    rootObserver?.disconnect();
    bodyObserver?.disconnect();
    entry.remove();
  };
}

export function apply(ctx: CronBoardClientCtx): void {
  const rpc = makeRpc();
  const sessions = (ctx as unknown as { get?(k: string): unknown }).get?.('sessions') as
    | { open?(sessionId: string): unknown }
    | undefined;
  initI18n(ctx);
  ensureThemeStyle();

  // 侧栏入口（DOM 注入大按钮样式）。接线标记 'sidebar.panellist' 由注入按钮的
  // dataset.wire 携带；该 slot 不再注册，宿主不再渲染旧列表行，UI 完全由注入按钮提供。
  const disposeSidebar = injectSidebarEntry(ctx);
  void disposeSidebar;

  // 中央看板（main keyed：同一 id 寻址；不遮蔽 conversation）
  ctx.slots.inject('main', () => {
    return ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        inject: () => ({ rpc, sessions }),
      },
      BoardPanel,
    );
  });

  // 设置 → 定时任务看板
  ctx.slots.inject('settings.section', () => {
    return ctx.slots.register(
      {
        name: 'settings.section',
        id: PANEL_ID,
        order: 210,
        label: () => t('panel.label'),
        inject: () => ({ rpc }),
      },
      SettingsPanel,
    );
  });

  // 注：DOM 注入清理由 disposeSidebar 持有（当前生命周期=页面级，刷新即重置）。
  void disposeSidebar;
}

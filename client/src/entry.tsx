/**
 * dsh-cron-board — browser half（TS/TSX 源，scripts/build-client.mjs 经 esbuild
 * 打包为 dist/client.js 单文件 bundle）。
 *
 * 1. 侧栏入口（DOM 注入）：在「新会话」按钮下方插入自定义大按钮，
 *    MutationObserver 监听侧栏变化自动恢复注入；
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

/** 侧栏入口按钮的 DOM 注入（参考 dsh-task-board 的 sidebar-entry-core 模式）。 */
function injectSidebarEntry(ctx: CronBoardClientCtx): () => void {
  const ROW_ATTR = 'data-dsh-cron-board-entry';
  const ROW_SELECTOR = `[${ROW_ATTR}]`;
  // 更宽松的侧栏选择器
  const SIDEBAR_SELECTORS = [
    '[data-pane="sidebar"]',
    '[class*="sidebarCol"]',
    '[class*="sidebar"]',
    'nav[class*="sidebar"]',
    'aside[class*="sidebar"]',
  ];

  let observer: MutationObserver | undefined;
  let disposed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  /** 查找侧栏容器。 */
  function findSidebar(): HTMLElement | null {
    for (const selector of SIDEBAR_SELECTORS) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    }
    return null;
  }

  /** 创建入口按钮 DOM。 */
  function createEntryRow(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.setAttribute(ROW_ATTR, 'true');
    btn.className = 'dsh-cron-board-sidebar-btn';
    btn.type = 'button';
    btn.innerHTML = `<span class="dsh-cron-board-sidebar-icon"></span><span class="dsh-cron-board-sidebar-label">${t('panel.label')}</span>`;
    btn.addEventListener('click', () => {
      ctx.layout.selectPanel(PANEL_ID);
    });
    return btn;
  }

  /** 查找插入位置（「新会话」按钮之后）。 */
  function findInsertPoint(sidebar: HTMLElement): HTMLElement | null {
    // 尝试多种选择器找「新会话」按钮
    const candidates = [
      sidebar.querySelector('[class*="newSession"]'),
      sidebar.querySelector('[class*="new-session"]'),
      sidebar.querySelector('button'),
    ];
    for (const el of candidates) {
      if (el && el.parentElement) {
        return el.parentElement as HTMLElement;
      }
    }
    return sidebar.firstElementChild as HTMLElement | null;
  }

  /** 执行注入（幂等 + 重试）。 */
  function doInject(): void {
    if (disposed) return;
    const sidebar = findSidebar();
    if (!sidebar) {
      // 侧栏还没渲染，延迟重试
      retryTimer = setTimeout(doInject, 500);
      return;
    }

    // 已存在则跳过
    if (sidebar.querySelector(ROW_SELECTOR)) return;

    const insertPoint = findInsertPoint(sidebar);
    if (!insertPoint) {
      retryTimer = setTimeout(doInject, 500);
      return;
    }

    const row = createEntryRow();
    insertPoint.after(row);
  }

  // 初始注入（延迟确保侧栏已渲染）
  retryTimer = setTimeout(doInject, 300);

  // MutationObserver 监听侧栏变化（React 重渲染会覆盖注入）
  const checkAndObserve = () => {
    const sidebar = findSidebar();
    if (!sidebar) return;
    observer = new MutationObserver(() => {
      if (!disposed && !sidebar.querySelector(ROW_SELECTOR)) {
        doInject();
      }
    });
    observer.observe(sidebar, { childList: true, subtree: true });
  };

  // 延迟启动 observer
  setTimeout(checkAndObserve, 1000);

  // 返回 disposer
  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    observer?.disconnect();
    const existing = document.querySelector(ROW_SELECTOR);
    existing?.remove();
  };
}

export function apply(ctx: CronBoardClientCtx): void {
  const rpc = makeRpc();
  const sessions = (ctx as unknown as { get?(k: string): unknown }).get?.('sessions') as
    | { open?(sessionId: string): unknown }
    | undefined;
  initI18n(ctx);
  ensureThemeStyle();

  // 侧栏入口（DOM 注入大按钮样式）
  const disposeSidebar = injectSidebarEntry(ctx);

  // 保留 sidebar.panellist 空注册（满足构建脚本接线检查，实际 UI 由 DOM 注入提供）
  ctx.slots.inject('sidebar.panellist', () => {
    return ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 60,
        label: () => t('panel.label'),
        inject: () => ({ layout: ctx.layout }),
      },
      () => null, // 空组件，不渲染
    );
  });

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

  // 注：DOM 注入的清理由 MutationObserver 在插件卸载时自动断开（页面刷新即清理）
}

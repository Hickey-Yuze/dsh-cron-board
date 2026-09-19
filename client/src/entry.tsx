/**
 * dsh-cron-board — browser half（TS/TSX 源，scripts/build-client.mjs 经 esbuild
 * 打包为 dist/client.js 单文件 bundle）。
 *
 * 1. 侧栏面板图标（sidebar.panellist）：点击经 layout.selectPanel 切换中央面板，
 *    再次点击返回会话（selectPanel(null)）；
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
import { PANEL_ID, PanelIcon } from './panel-icon.js';
import { makeRpc } from './rpc.js';
import { SettingsPanel } from './settings.js';

export const inject = ['slots', 'layout', 'locale'];

export function apply(ctx: CronBoardClientCtx): void {
  const rpc = makeRpc();
  initI18n(ctx);
  ensureThemeStyle();

  // 侧栏看板入口（全局面板图标行；label 随宿主语言变化）
  ctx.slots.inject('sidebar.panellist', () => {
    return ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 60,
        label: () => t('panel.label'),
        inject: () => ({ layout: ctx.layout }),
      },
      PanelIcon,
    );
  });

  // 中央看板（main keyed：同一 id 寻址；不遮蔽 conversation）
  ctx.slots.inject('main', () => {
    return ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        inject: () => ({ rpc }),
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
}

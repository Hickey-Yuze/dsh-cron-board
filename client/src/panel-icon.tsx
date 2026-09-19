/**
 * 侧栏看板入口图标（sidebar.panellist 行组件）。
 * 选中态优先读宿主 usePanelInfo hook（guarded require，缺失时降级为无选中态）。
 */
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { hostRequire } from './env.js';
import { t } from './i18n.js';

export const PANEL_ID = 'dsh-cron-board';

/** 宿主 hook 缓存：模块注册表会话内稳定，故条件调用满足 hooks 规则。 */
let panelInfoHook: (() => unknown) | undefined | null = null;

function usePanelInfoFactory(): (() => unknown) | undefined {
  if (panelInfoHook === null) {
    try {
      const mod = hostRequire('@deepseek-ai/dsh-client-ui-layout/client') as { usePanelInfo?: unknown } | undefined;
      panelInfoHook = typeof mod?.usePanelInfo === 'function' ? (mod.usePanelInfo as () => unknown) : undefined;
    } catch {
      panelInfoHook = undefined;
    }
  }
  return panelInfoHook;
}

function readActive(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false;
  const o = info as Record<string, unknown>;
  if (o.activePanelId !== undefined) return o.activePanelId === PANEL_ID;
  if (typeof o.active === 'boolean') return o.active;
  if (typeof o.selected === 'boolean') return o.selected;
  return false;
}

const ICON = createElement(
  'svg',
  {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  },
  createElement('path', { d: 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3' }),
  createElement('path', { d: 'M3 10h18' }),
  createElement('path', { d: 'M8 2v4' }),
  createElement('path', { d: 'M16 2v4' }),
  createElement('circle', { cx: '17', cy: '17', r: '5' }),
  createElement('path', { d: 'M17 15v2l1.5 1.5' }),
);

export function PanelIcon(props: { layout: { selectPanel(panelId: string | null): void } }): ReactElement {
  const factory = usePanelInfoFactory();
  let active = false;
  if (factory) {
    try {
      active = readActive(factory());
    } catch {
      active = false;
    }
  }
  return createElement(
    'button',
    {
      className: `dsh-cb-icon-btn${active ? ' dsh-cb-icon-active' : ''}`,
      title: t('panel.label'),
      'aria-label': t('panel.label'),
      type: 'button',
      onClick: () => props.layout.selectPanel(active ? null : PANEL_ID),
    },
    ICON,
  );
}

/**
 * 设置页（settings.section）：推送通道状态、全局默认推送目标、调度/保留参数展示、使用说明。
 */
import { createElement, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { MetaView, SettingsView } from '../../src/contract.js';
import { parsePushKey, pushKeyOf, pushOptionLabel } from './format.js';
import { t } from './i18n.js';
import type { RpcFn } from './rpc.js';
import { Badge, Btn, Field, Select } from './ui.js';

export function SettingsPanel(props: { rpc: RpcFn }): ReactElement {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [meta, setMeta] = useState<MetaView | null>(null);
  const [defaultPush, setDefaultPush] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await props.rpc('cron-board/settings');
      if (s.ok) {
        setSettings(s.value);
        setDefaultPush(pushKeyOf(s.value.defaultPush));
      } else {
        setErr(s.error.message);
      }
      const m = await props.rpc('cron-board/meta');
      if (m.ok) setMeta(m.value);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(): Promise<void> {
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const r = await props.rpc('cron-board/settings-set', { defaultPush: parsePushKey(defaultPush) });
      if (r.ok) {
        setSettings(r.value);
        setNote(t('set.defaultPushSaved'));
      } else {
        setErr(r.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return createElement(
    'div',
    { className: 'dsh-cb-set' },
    createElement('h3', null, t('set.title')),
    createElement('div', { className: 'dsh-cb-hint' }, t('set.desc')),
    err !== null ? createElement('div', { className: 'dsh-cb-errbox' }, err) : null,
    note !== null ? createElement('div', { className: 'dsh-cb-notebox' }, note) : null,
    createElement(
      'div',
      { className: 'dsh-cb-setbox' },
      createElement(
        'div',
        { className: 'dsh-cb-setrow' },
        createElement('strong', { style: { fontSize: 12 } }, t('set.channel')),
        settings
          ? createElement(
              Badge,
              { tone: 'accent' },
              `${t('board.channel')}: http 127.0.0.1:${settings.httpPort} · retry ≤ ${settings.retryMax}`,
            )
          : null,
      ),
      createElement(Field, { label: t('set.defaultPush'), hint: meta && meta.pushMode === 'unavailable' ? t('push.unavailableHint') : undefined },
        createElement(Select, {
          value: defaultPush,
          onChange: setDefaultPush,
          options: [{ value: '', label: t('f.pushNone') }].concat(
            (meta?.targets ?? []).map((target) => {
              const bot = meta?.bots.find((b) => b.botId === target.botId);
              return { value: `${target.botId}::${target.targetId}`, label: pushOptionLabel(target, bot?.channel) };
            }),
          ),
        }),
      ),
      createElement('div', { className: 'dsh-cb-row' }, createElement(Btn, { kind: 'primary', disabled: busy, onClick: () => void save() }, t('set.defaultPushSave'))),
    ),
    settings
      ? createElement(
          'div',
          { className: 'dsh-cb-setbox' },
          createElement('strong', { style: { fontSize: 12 } }, t('set.params')),
          createElement('div', { className: 'dsh-cb-hint' }, `schedulerTickMs = ${settings.schedulerTickMs}`),
          createElement('div', { className: 'dsh-cb-hint' }, `runTimeoutMin = ${settings.runTimeoutMin}`),
          createElement('div', { className: 'dsh-cb-hint' }, `resultsKeepPerTask = ${settings.resultsKeepPerTask}`),
          createElement('div', { className: 'dsh-cb-hint' }, `executionsKeepPerTask = ${settings.executionsKeepPerTask}`),
          createElement('div', { className: 'dsh-cb-hint' }, `${t('set.dataDir')}: ${settings.dataDir}`),
        )
      : null,
    createElement(
      'div',
      { className: 'dsh-cb-setbox' },
      createElement('strong', { style: { fontSize: 12 } }, t('set.hint.title')),
      createElement(
        'ul',
        { className: 'dsh-cb-setlist' },
        createElement('li', null, t('set.hint.1')),
        createElement('li', null, t('set.hint.2')),
        createElement('li', null, t('set.hint.3')),
        createElement('li', null, t('set.hint.4')),
        createElement('li', null, t('set.hint.5')),
      ),
    ),
  );
}

/**
 * 展示格式化：相对时间、时长、推送目标键值互转。
 */
import type { MetaTarget, PushTargetRef } from '../../src/contract.js';
import { lang, tpl } from './i18n.js';

export function fmtAgo(iso: string | undefined | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms < 45_000) return tpl('ago.now', {});
  const min = Math.round(ms / 60_000);
  if (min < 60) return tpl('ago.min', { n: min });
  const hour = Math.round(min / 60);
  if (hour < 24) return tpl('ago.hour', { n: hour });
  return tpl('ago.day', { n: Math.round(hour / 24) });
}

/** 未来时间点的人类可读（下次执行倒计时）。 */
export function fmtFuture(iso: string | undefined | null): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return fmtAgo(iso);
  const min = Math.round(ms / 60_000);
  if (min < 1) return tpl('ago.future', { s: '<1 min' });
  if (min < 60) return tpl('ago.future', { s: `${min} min` });
  const hour = Math.floor(min / 60);
  return tpl('ago.future', { s: lang() === 'zh' ? `${hour} 时 ${min % 60} 分` : `${hour}h ${min % 60}m` });
}

export function fmtDur(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '—';
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return lang() === 'zh' ? `${sec} 秒` : `${sec}s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min < 60) return lang() === 'zh' ? `${min} 分 ${rest} 秒` : `${min}m ${rest}s`;
  const hour = Math.floor(min / 60);
  return lang() === 'zh' ? `${hour} 时 ${min % 60} 分` : `${hour}h ${min % 60}m`;
}

export function pushKeyOf(p: PushTargetRef | null | undefined): string {
  return p && p.botId && p.targetId ? `${p.botId}::${p.targetId}` : '';
}

export function parsePushKey(key: string): PushTargetRef | null {
  if (key === '') return null;
  const [botId, targetId] = key.split('::');
  if (!botId || !targetId) return null;
  return { botId, targetId };
}

/** 推送目标下拉选项（botId::targetId → label）。 */
export function pushOptionLabel(target: MetaTarget, botChannel: string | undefined): string {
  const name = target.name && target.name !== '' ? target.name : target.targetId;
  const channel = botChannel ?? target.kind ?? '';
  return channel === '' ? name : `${channel} · ${name}`;
}

/**
 * 看板主面板（main 键位槽位 dsh-cron-board）——macOS 风格浅色 v2：
 * 顶栏（logo+版本徽章+服务状态+搜索⌘K+新建）→ 四统计卡（图标胶囊+迷你趋势线）→
 * 筛选 chips（全部/启用中/已暂停/已归档）→ 项目分组（状态点+下次执行+行内菜单）→
 * 最近日志区块。Host snapshot 是唯一已确认 UI 状态；5s 轮询 + 动作后即时刷新。
 */
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { BoardSnapshot, Execution, MetaView, TaskView } from '../../src/contract.js';
import { describeCron } from '../../src/cron.js';
import { fmtAgo, fmtDur, fmtFuture } from './format.js';
import { lang, t, tpl } from './i18n.js';
import { DetailModal } from './detail.js';
import type { RpcFn } from './rpc.js';
import { Badge, Btn } from './ui.js';

type Chip = 'all' | 'enabled' | 'paused' | 'archived';

function statusTone(s: Execution['status']): 'ok' | 'err' | 'warn' | 'accent' {
  if (s === 'success') return 'ok';
  if (s === 'failed') return 'err';
  if (s === 'timeout' || s === 'canceled') return 'warn';
  return 'accent';
}

/* ---------------------------------- 图标 ---------------------------------- */

function SvgIcon(props: { children?: ReactNode; size?: number }): ReactElement {
  return createElement(
    'svg',
    { className: 'dsh-cb-ic', width: props.size ?? 16, height: props.size ?? 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    props.children,
  );
}

const IconClock = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('circle', { cx: 12, cy: 12, r: 9 }), createElement('path', { d: 'M12 7v5l3 3' }));
const IconBolt = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z' }));
const IconCheckCircle = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('circle', { cx: 12, cy: 12, r: 9 }), createElement('path', { d: 'm8.5 12 2.5 2.5 4.5-5' }));
const IconDoc = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5z' }), createElement('path', { d: 'M14 2v5h5' }));
const IconSend = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'm3 11 18-8-8 18-2.5-7.5L3 11z' }));
const IconRefresh = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36L21 8' }), createElement('path', { d: 'M21 3v5h-5' }));
const IconSearch = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('circle', { cx: 11, cy: 11, r: 7 }), createElement('path', { d: 'm21 21-4-4' }));
const IconCalendar = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }), createElement('path', { d: 'M8 3v4M16 3v4M3 10h18' }));
const IconDots = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('circle', { cx: 5, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' }), createElement('circle', { cx: 12, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' }), createElement('circle', { cx: 19, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' }));

/** 迷你趋势线（统计卡右上角装饰/近 7 日真实序列）。 */
function Spark(props: { data: number[]; tone: string }): ReactElement {
  const { data, tone } = props;
  const w = 64;
  const h = 22;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = Math.max(max - min, 1);
  const pts = data.map((v, i) => {
    const x = data.length <= 1 ? w / 2 : (i / (data.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastPair = pts[pts.length - 1] ?? `${w / 2},${h / 2}`;
  const lastXY = lastPair.split(',');
  return createElement(
    'svg',
    { className: `dsh-cb-spark dsh-cb-spark-${tone}`, width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': true },
    createElement('polyline', { points: pts.join(' '), fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    createElement('circle', { cx: Number(lastXY[0]), cy: Number(lastXY[1]), r: 2, fill: 'currentColor', stroke: 'none' }),
  );
}

/** 近 n 天逐日计数（endedAt||startedAt 落桶；含今天，旧→新）。 */
function dailyCounts(execs: Array<{ at: number }>, days: number): number[] {
  const day = 86_400_000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = today.getTime();
  const buckets = new Array<number>(days).fill(0);
  for (const e of execs) {
    const idx = Math.floor((e.at - base) / day);
    if (idx >= 0 && idx < days) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}

/** 装饰性平滑序列（无历史数据的卡片；随 count 稳定生成，不随轮询抖动）。 */
function seededSpark(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const wobble = Math.round(Math.sin(i * 1.7 + count) * 1.2);
    out.push(Math.max(0, count + wobble - 1));
  }
  return out;
}

/* --------------------------------- 统计卡 --------------------------------- */

function StatCard(props: {
  icon: ReactNode;
  tone: 'accent' | 'warn' | 'ok' | 'purple';
  count: number;
  unit: string;
  sub?: ReactNode;
  spark: number[];
  onClick?: () => void;
}): ReactElement {
  const { icon, tone, count, unit, sub, spark, onClick } = props;
  return createElement(
    'button',
    { type: 'button', className: `dsh-cb-stat2 dsh-cb-stat2-${tone}`, onClick },
    createElement('div', { className: 'dsh-cb-stat2-top' },
      createElement('span', { className: 'dsh-cb-stat2-chip' }, icon),
      createElement(Spark, { data: spark, tone }),
    ),
    createElement('div', { className: 'dsh-cb-stat2-body' },
      createElement('span', { className: 'dsh-cb-stat2-count' }, String(count)),
      createElement('span', { className: 'dsh-cb-stat2-unit' }, unit),
    ),
    createElement('div', { className: 'dsh-cb-stat2-sub' }, sub ?? ''),
  );
}

/* --------------------------------- 任务行 --------------------------------- */

function TaskRow(props: {
  task: TaskView;
  open: boolean;
  onToggleMenu: () => void;
  onTaskClick: (task: TaskView) => void;
  onRun: (task: TaskView) => void;
  onTestPush: (task: TaskView) => void;
  onDuplicate: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
  onToggleEnabled: (task: TaskView) => void;
}): ReactElement {
  const { task, open, onToggleMenu, onTaskClick, onRun, onTestPush, onDuplicate, onDelete, onToggleEnabled } = props;
  const last = task.executions[0];
  const paused = task.enabled === false;
  // 状态徽章：暂停 > 运行中 > 最近执行结果 > 待执行
  const badgeTone: 'default' | 'ok' | 'warn' | 'err' | 'accent' = paused
    ? 'default'
    : task.running
      ? 'accent'
      : last
        ? statusTone(last.status)
        : 'default';
  const badgeText = paused ? t('st.paused') : task.running ? t('st.running') : last ? t(`st.${last.status}`) : t('st.pending');
  const dotCls = paused
    ? 'dsh-cb-dot-hollow'
    : task.running
      ? 'dsh-cb-dot-run'
      : last
        ? `dsh-cb-dot-${statusTone(last.status)}`
        : 'dsh-cb-dot-dim';
  const meta: ReactNode[] = [
    createElement('span', { key: 'cron', className: 'dsh-cb-trow-cron' },
      createElement(IconCalendar, { size: 12 }),
      createElement('span', null, describeCron(task.cron, lang())),
    ),
  ];
  if (paused) {
    meta.push(createElement('span', { key: 'p', className: 'dsh-cb-trow-dim' }, `${t('st.paused')} · ${fmtAgo(task.updatedAt)}`));
  } else {
    if (task.nextRunAt) meta.push(createElement('span', { key: 'n', className: 'dsh-cb-trow-next' }, `${t('board.next')} · ${fmtFuture(task.nextRunAt)}`));
    if (last) meta.push(createElement('span', { key: 'l', className: 'dsh-cb-trow-dim' }, fmtAgo(last.endedAt ?? last.startedAt)));
  }

  return createElement(
    'div',
    { className: `dsh-cb-trow${paused ? ' dsh-cb-trow-paused' : ''}`, onClick: () => onTaskClick(task) },
    createElement('span', { className: `dsh-cb-dot ${dotCls}` }),
    createElement('div', { className: 'dsh-cb-trow-main' },
      createElement('div', { className: 'dsh-cb-trow-title' }, task.title),
      createElement('div', { className: 'dsh-cb-trow-meta' }, meta),
    ),
    createElement('div', { className: 'dsh-cb-trow-right', onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() },
      createElement(Badge, { tone: badgeTone }, badgeText),
      createElement('button', { type: 'button', className: 'dsh-cb-btn-outline', onClick: () => onTestPush(task) },
        createElement(IconSend, { size: 13 }),
        createElement('span', null, t('act.pushShort')),
      ),
      createElement('button', { type: 'button', className: 'dsh-cb-btn-primary', disabled: task.running || paused, onClick: () => onRun(task) }, t('act.runShort')),
      createElement('div', { className: 'dsh-cb-menu-wrap' },
        createElement('button', { type: 'button', className: 'dsh-cb-btn-ghost', title: t('act.more'), onClick: onToggleMenu }, createElement(IconDots, { size: 16 })),
        open
          ? createElement('div', { className: 'dsh-cb-menu', onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() },
              createElement('button', { type: 'button', className: 'dsh-cb-menu-item', onClick: () => onDuplicate(task) }, t('act.duplicate')),
              createElement('button', { type: 'button', className: 'dsh-cb-menu-item', onClick: () => onToggleEnabled(task) }, paused ? t('act.resume') : t('act.pause')),
              createElement('div', { className: 'dsh-cb-menu-sep' }),
              createElement('button', { type: 'button', className: 'dsh-cb-menu-item dsh-cb-menu-danger', onClick: () => onDelete(task) }, t('act.delete')),
            )
          : null,
      ),
    ),
  );
}

/* --------------------------------- 项目组 --------------------------------- */

function ProjectGroup(props: {
  name: string;
  color: string;
  count: number;
  lastSync?: string;
  expanded: boolean;
  onToggle: () => void;
  rows: ReactNode;
}): ReactElement {
  const { name, color, count, lastSync, expanded, onToggle, rows } = props;
  return createElement(
    'div',
    { className: 'dsh-cb-group' },
    createElement(
      'div',
      { className: 'dsh-cb-grouphead', onClick: onToggle },
      createElement('div', { className: 'dsh-cb-grouphead-left' },
        createElement('span', { className: 'dsh-cb-groupdot', style: { background: color } }),
        createElement('strong', { className: 'dsh-cb-groupname' }, name),
        createElement('span', { className: 'dsh-cb-groupcount' }, String(count)),
      ),
      createElement('div', { className: 'dsh-cb-grouphead-right' },
        lastSync ? createElement('span', { className: 'dsh-cb-groupsync' }, `${t('board.groupLast')} · ${fmtAgo(lastSync)}`) : null,
        createElement('span', { className: `dsh-cb-chevron${expanded ? ' dsh-cb-chevron-open' : ''}` }, '⌄'),
      ),
    ),
    expanded ? createElement('div', { className: 'dsh-cb-groupbody' }, rows) : null,
  );
}

/* --------------------------------- 主面板 --------------------------------- */

export function BoardPanel(props: { rpc: RpcFn; sessions?: { open?(sessionId: string): unknown } }): ReactElement {
  const [snap, setSnap] = useState<BoardSnapshot | null>(null);
  const [meta, setMeta] = useState<MetaView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<Chip>('all');
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null | undefined>(undefined);
  const [cloneFrom, setCloneFrom] = useState<TaskView | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const r = await props.rpc('cron-board/state');
    if (r.ok) {
      setSnap(r.value);
      setErr(null);
    } else {
      setErr(r.error.message);
    }
  }, [props.rpc]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void (async () => {
      const r = await props.rpc('cron-board/meta');
      if (r.ok) setMeta(r.value);
    })();
  }, [props.rpc]);

  // ⌘K / Ctrl+K 聚焦搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ⋯ 菜单点击外部关闭
  useEffect(() => {
    if (menuId === null) return;
    const close = () => setMenuId(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuId]);

  const tasks = snap?.tasks ?? [];
  const activeTasks = useMemo(() => tasks.filter((task) => !task.archived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((task) => task.archived), [tasks]);

  // 全量执行流（最近日志区块数据源）
  const allLogs = useMemo(() => {
    const logs: Array<{ task: TaskView; exec: Execution; at: number }> = [];
    for (const task of activeTasks) {
      for (const exec of task.executions) {
        logs.push({ task, exec, at: new Date(exec.endedAt ?? exec.startedAt).getTime() });
      }
    }
    logs.sort((a, b) => b.at - a.at);
    return logs;
  }, [activeTasks]);

  // 统计
  const todoCount = activeTasks.filter((task) => task.enabled && !task.running).length;
  const runningCount = activeTasks.filter((task) => task.running).length;
  const completedCount = activeTasks.filter((task) => task.executions[0]?.status === 'success').length;
  const enabledCount = activeTasks.filter((task) => task.enabled).length;
  const pausedCount = activeTasks.filter((task) => task.enabled === false).length;
  const logs24h = useMemo(() => {
    const cutoff = Date.now() - 86_400_000;
    return allLogs.filter((l) => l.at >= cutoff).length;
  }, [allLogs]);

  // 已完成较昨日：近 24h 成功 vs 前 24h 成功
  const completedDelta = useMemo(() => {
    const now = Date.now();
    const day = 86_400_000;
    const count = (from: number, to: number) =>
      allLogs.filter((l) => l.exec.status === 'success' && l.at >= now - to && l.at < now - from).length;
    return count(0, day) - count(day, day * 2);
  }, [allLogs]);

  // spark 序列：近 7 天真实逐日；无历史数据时用装饰序列
  const sparkCompleted = useMemo(() => {
    const s = dailyCounts(allLogs.filter((l) => l.exec.status === 'success').map((l) => ({ at: l.at })), 7);
    return s.some((v) => v > 0) ? s : seededSpark(completedCount);
  }, [allLogs, completedCount]);
  const sparkLogs = useMemo(() => {
    const s = dailyCounts(allLogs.map((l) => ({ at: l.at })), 7);
    return s.some((v) => v > 0) ? s : seededSpark(logs24h);
  }, [allLogs, logs24h]);
  const sparkTodo = useMemo(() => seededSpark(todoCount), [todoCount]);
  const sparkRunning = useMemo(() => seededSpark(runningCount), [runningCount]);

  // 筛选
  const q = search.trim().toLowerCase();
  const matchSearch = useCallback(
    (task: TaskView) =>
      q === '' ||
      task.title.toLowerCase().includes(q) ||
      task.prompt.toLowerCase().includes(q) ||
      (task.tags ?? []).some((tag) => tag.name.toLowerCase().includes(q)),
    [q],
  );
  const visibleTasks = useMemo(() => {
    if (chip === 'archived') return archivedTasks.filter(matchSearch);
    const base = chip === 'enabled' ? activeTasks.filter((task) => task.enabled) : chip === 'paused' ? activeTasks.filter((task) => task.enabled === false) : activeTasks;
    return base.filter(matchSearch);
  }, [chip, activeTasks, archivedTasks, matchSearch]);

  // 分组
  const projectColors = ['#4b6bfb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  const projectGroups = useMemo(() => {
    if (chip === 'archived') return [];
    const groups = new Map<string, TaskView[]>();
    for (const task of visibleTasks) {
      const wsId = task.pinned.workspaceId || '';
      const ws = meta?.workspaces.find((w) => w.id === wsId);
      const name = ws?.title || t('board.other');
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(task);
    }
    return Array.from(groups.entries());
  }, [visibleTasks, meta, chip]);

  const rowHandlers = {
    onTaskClick: (task: TaskView) => setDetailId(task.id),
    onRun: (task: TaskView) => void props.rpc('cron-board/task-run', { id: task.id }).then(() => void load()),
    onTestPush: (task: TaskView) => void props.rpc('cron-board/push-test', { id: task.id }).then(() => void load()),
    onDuplicate: (task: TaskView) => {
      setCloneFrom(task);
      setDetailId(null);
    },
    onDelete: (task: TaskView) => {
      if (typeof window !== 'undefined' && !window.confirm(t('dl.deleteConfirm'))) return;
      void props.rpc('cron-board/task-delete', { id: task.id }).then(() => void load());
    },
    onToggleEnabled: (task: TaskView) =>
      void props.rpc('cron-board/task-toggle', { id: task.id, enabled: task.enabled === false }).then(() => void load()),
  };

  const statusText = snap
    ? snap.pushChannel.mode === 'service'
      ? t('board.status.service')
      : snap.pushChannel.mode === 'http'
        ? t('board.status.http')
        : t('board.status.unavailable')
    : '';
  const statusToneCls = snap ? (snap.pushChannel.mode === 'service' ? 'ok' : snap.pushChannel.mode === 'http' ? 'accent' : 'warn') : 'dim';

  const shownCount = chip === 'archived' ? archivedTasks.length : activeTasks.length;
  const visibleCount = visibleTasks.length;

  return createElement(
    'div',
    { className: 'dsh-cb-root' },

    // ── 顶栏 ──
    createElement(
      'div',
      { className: 'dsh-cb-topbar' },
      createElement('div', { className: 'dsh-cb-topbar-left' },
        createElement('span', { className: 'dsh-cb-logo' }, createElement(IconClock, { size: 18 })),
        createElement('div', { className: 'dsh-cb-titlewrap' },
          createElement('div', { className: 'dsh-cb-titlerow' },
            createElement('h2', { className: 'dsh-cb-title' }, t('board.titleClean')),
            meta && meta.version !== '' ? createElement('span', { className: 'dsh-cb-ver' }, `v${meta.version}`) : null,
          ),
          createElement('div', { className: 'dsh-cb-statusline' },
            createElement('span', { className: `dsh-cb-statusdot dsh-cb-statusdot-${statusToneCls}` }),
            createElement('span', null, `Yuze · ${statusText}`),
          ),
        ),
      ),
      createElement('div', { className: 'dsh-cb-topbar-right' },
        createElement('div', { className: 'dsh-cb-searchwrap' },
          createElement(IconSearch, { size: 14 }),
          createElement('input', {
            ref: searchRef,
            className: 'dsh-cb-search',
            value: search,
            placeholder: t('board.search'),
            onChange: (e: { target: { value: string } }) => setSearch(e.target.value),
          }),
          createElement('span', { className: 'dsh-cb-kbd' }, '⌘K'),
        ),
        createElement('button', { type: 'button', className: 'dsh-cb-iconbtn', title: t('board.retry'), onClick: () => void load() }, createElement(IconRefresh, { size: 15 })),
        createElement('button', { type: 'button', className: 'dsh-cb-btn-new', onClick: () => setDetailId(null) }, `＋ ${t('board.new')}`),
      ),
    ),

    // ── 错误提示 ──
    err !== null
      ? createElement(
          'div',
          { className: 'dsh-cb-errorbox' },
          createElement('span', null, `${t('board.loadFail')}: ${err}`),
          createElement(Btn, { onClick: () => void load() }, t('board.retry')),
        )
      : null,

    // ── 统计卡 ──
    createElement(
      'div',
      { className: 'dsh-cb-stats2-row' },
      createElement(StatCard, {
        icon: createElement(IconClock, { size: 16 }),
        tone: 'accent',
        count: todoCount,
        unit: t('stat.tasks'),
        sub: t('stat.todo'),
        spark: sparkTodo,
        onClick: () => setChip(chip === 'enabled' ? 'all' : 'enabled'),
      }),
      createElement(StatCard, {
        icon: createElement(IconBolt, { size: 16 }),
        tone: 'warn',
        count: runningCount,
        unit: t('stat.tasks'),
        sub: runningCount > 0 ? tpl('stat.runningNow', { n: runningCount }) : t('stat.idle'),
        spark: sparkRunning,
        onClick: () => setChip('all'),
      }),
      createElement(StatCard, {
        icon: createElement(IconCheckCircle, { size: 16 }),
        tone: 'ok',
        count: completedCount,
        unit: t('stat.tasks'),
        sub: createElement('span', null,
          `${t('stat.completed')} · ${t('stat.vsYesterday')} `,
          createElement('span', { className: `dsh-cb-delta ${completedDelta >= 0 ? 'dsh-cb-delta-ok' : 'dsh-cb-delta-err'}` }, `${completedDelta >= 0 ? '+' : ''}${completedDelta}`),
        ),
        spark: sparkCompleted,
        onClick: () => setChip('all'),
      }),
      createElement(StatCard, {
        icon: createElement(IconDoc, { size: 16 }),
        tone: 'purple',
        count: logs24h,
        unit: t('stat.recentLogs'),
        sub: t('stat.last24h'),
        spark: sparkLogs,
        onClick: () => setLogsExpanded((v) => !v),
      }),
    ),

    // ── 筛选 chips ──
    createElement(
      'div',
      { className: 'dsh-cb-chipbar' },
      createElement('div', { className: 'dsh-cb-chips' },
        createElement('button', { type: 'button', className: `dsh-cb-chip${chip === 'all' ? ' dsh-cb-chip-active' : ''}`, onClick: () => setChip('all') },
          t('board.filter.all'), createElement('span', { className: 'dsh-cb-chip-n' }, String(activeTasks.length)),
        ),
        createElement('button', { type: 'button', className: `dsh-cb-chip${chip === 'enabled' ? ' dsh-cb-chip-active' : ''}`, onClick: () => setChip('enabled') },
          t('board.filter.enabled'), createElement('span', { className: 'dsh-cb-chip-n' }, String(enabledCount)),
        ),
        createElement('button', { type: 'button', className: `dsh-cb-chip${chip === 'paused' ? ' dsh-cb-chip-active' : ''}`, onClick: () => setChip('paused') },
          t('board.filter.paused'), createElement('span', { className: 'dsh-cb-chip-n' }, String(pausedCount)),
        ),
        createElement('button', { type: 'button', className: `dsh-cb-chip${chip === 'archived' ? ' dsh-cb-chip-active' : ''}`, onClick: () => setChip('archived') },
          t('board.archived'), createElement('span', { className: 'dsh-cb-chip-n' }, String(archivedTasks.length)),
        ),
      ),
      createElement('span', { className: 'dsh-cb-showcount' }, tpl('board.showCount', { n: visibleCount, m: shownCount })),
    ),

    // ── 分组任务列表 ──
    chip !== 'archived'
      ? createElement(
          'div',
          { className: 'dsh-cb-groups' },
          projectGroups.length === 0
            ? createElement('div', { className: 'dsh-cb-empty' }, activeTasks.length === 0 ? t('board.empty') : t('board.noTask'))
            : projectGroups.map(([name, groupTasks], idx) => {
                const lastSync = groupTasks.reduce<string | undefined>((acc, task) => {
                  const at = task.executions[0]?.endedAt ?? task.executions[0]?.startedAt;
                  if (!at) return acc;
                  if (!acc || new Date(at).getTime() > new Date(acc).getTime()) return at;
                  return acc;
                }, undefined);
                return createElement(ProjectGroup, {
                  key: name,
                  name,
                  color: projectColors[idx % projectColors.length] ?? '#4b6bfb',
                  count: groupTasks.length,
                  lastSync,
                  expanded: !collapsed.has(name),
                  onToggle: () =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(name)) next.delete(name);
                      else next.add(name);
                      return next;
                    }),
                  rows: groupTasks.length === 0
                    ? createElement('div', { className: 'dsh-cb-empty-task' }, t('board.noTask'))
                    : groupTasks.map((task) =>
                        createElement(TaskRow, {
                          key: task.id,
                          task,
                          open: menuId === task.id,
                          onToggleMenu: () => setMenuId(menuId === task.id ? null : task.id),
                          ...rowHandlers,
                        }),
                      ),
                });
              }),
        )
      : null,

    // ── 归档视图 ──
    chip === 'archived'
      ? createElement(
          'div',
          { className: 'dsh-cb-group' },
          archivedTasks.length === 0
            ? createElement('div', { className: 'dsh-cb-empty' }, t('board.archivedEmpty'))
            : createElement(
                'div',
                { className: 'dsh-cb-groupbody' },
                archivedTasks.filter(matchSearch).map((task) =>
                  createElement(
                    'div',
                    { key: task.id, className: 'dsh-cb-archrow', onClick: () => setDetailId(task.id) },
                    createElement('span', { className: 'dsh-cb-dot dsh-cb-dot-hollow' }),
                    createElement('div', { className: 'dsh-cb-trow-main' },
                      createElement('div', { className: 'dsh-cb-trow-title' }, task.title),
                      createElement('div', { className: 'dsh-cb-trow-meta' },
                        createElement('span', { className: 'dsh-cb-trow-dim' }, `${t('board.archived')} · ${fmtAgo(task.updatedAt)}`),
                      ),
                    ),
                    createElement('div', { className: 'dsh-cb-trow-right', onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() },
                      createElement(Btn, { onClick: () => setDetailId(task.id) }, t('act.edit')),
                      createElement(
                        Btn,
                        {
                          disabled: task.running,
                          onClick: () => void props.rpc('cron-board/task-restore', { id: task.id }).then(() => void load()),
                        },
                        t('act.restore'),
                      ),
                      createElement(
                        Btn,
                        {
                          kind: 'danger',
                          disabled: task.running,
                          onClick: () => {
                            if (typeof window !== 'undefined' && !window.confirm(t('dl.deleteConfirm'))) return;
                            void props.rpc('cron-board/task-delete', { id: task.id }).then(() => void load());
                          },
                        },
                        t('act.delete'),
                      ),
                    ),
                  ),
                ),
              ),
        )
      : null,

    // ── 最近日志 ──
    createElement(
      'div',
      { className: 'dsh-cb-logsec' },
      createElement(
        'div',
        { className: 'dsh-cb-logsec-head' },
        createElement('div', { className: 'dsh-cb-logsec-title' },
          t('board.logsTitle'),
          createElement('span', { className: 'dsh-cb-chip-n' }, String(logsExpanded ? allLogs.length : Math.min(allLogs.length, 5))),
        ),
        allLogs.length > 5 || logsExpanded
          ? createElement('button', { type: 'button', className: 'dsh-cb-viewall', onClick: () => setLogsExpanded((v) => !v) },
              logsExpanded ? t('board.viewLess') : `${t('board.viewAll')} →`)
          : null,
      ),
      allLogs.length === 0
        ? createElement('div', { className: 'dsh-cb-empty' }, t('board.feedEmpty'))
        : createElement(
            'div',
            { className: 'dsh-cb-logsec-body' },
            (logsExpanded ? allLogs.slice(0, 50) : allLogs.slice(0, 5)).map(({ task, exec, at }) => {
              const sub = exec.summary && exec.summary.trim() !== ''
                ? exec.summary.trim().slice(0, 60)
                : [t(`exec.trigger.${exec.trigger}`), exec.durationMs !== undefined ? fmtDur(exec.durationMs) : null, exec.push?.state === 'sent' ? t('push.sent') : null].filter(Boolean).join(' · ');
              return createElement(
                'div',
                { key: exec.id, className: 'dsh-cb-logrow', onClick: () => setDetailId(task.id) },
                createElement('span', { className: `dsh-cb-dot ${exec.status === 'running' ? 'dsh-cb-dot-run' : `dsh-cb-dot-${statusTone(exec.status)}`}` }),
                createElement('div', { className: 'dsh-cb-trow-main' },
                  createElement('div', { className: 'dsh-cb-logrow-title' }, `「${task.title}」${t(`st.${exec.status}`)}`),
                  sub !== '' ? createElement('div', { className: 'dsh-cb-logrow-sub' }, sub) : null,
                ),
                createElement('span', { className: 'dsh-cb-logrow-time' }, fmtAgo(exec.endedAt ?? exec.startedAt ?? new Date(at).toISOString())),
              );
            }),
          ),
    ),

    // ── 详情弹层 ──
    detailId !== undefined
      ? createElement(DetailModal, {
          key: detailId ?? 'new',
          rpc: props.rpc,
          snapshot: snap,
          meta,
          sessions: props.sessions,
          taskId: detailId,
          cloneFrom,
          onClose: () => {
            setDetailId(undefined);
            setCloneFrom(null);
          },
          onChanged: () => void load(),
        })
      : null,
  );
}

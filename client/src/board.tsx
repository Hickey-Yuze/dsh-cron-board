/**
 * 看板主面板（main 键位槽位 dsh-cron-board）：
 * 统计卡（总任务/运行中/今日执行/失败率）+ chip 筛选行 + 表格布局（2026-09-27 参考图改版）。
 * 背景色不变（跟随宿主令牌）。Host snapshot 是唯一已确认 UI 状态；5s 轮询 + 动作后即时刷新。
 */
import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { BoardSnapshot, Execution, MetaView, TaskView } from '../../src/contract.js';
import { describeCron } from '../../src/cron.js';
import { fmtAgo, fmtDur, fmtFuture } from './format.js';
import { lang, t } from './i18n.js';
import { DetailModal } from './detail.js';
import type { RpcFn } from './rpc.js';
import { Badge, Btn, Select, TagBadge, TextInput } from './ui.js';

function skipText(reason: string): string {
  const key = `skip.${reason}`;
  const v = t(key);
  return v === key ? reason : v;
}

/* ── SVG 图标（16px stroke，与侧栏日历时钟同风格） ── */
const svgAttrs = 'viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICO = {
  calendar: `<svg ${svgAttrs}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  play: `<svg ${svgAttrs}><polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/></svg>`,
  bolt: `<svg ${svgAttrs}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none"/></svg>`,
  warn: `<svg ${svgAttrs}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  edit: `<svg ${svgAttrs}><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  pause: `<svg ${svgAttrs}><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/></svg>`,
  resume: `<svg ${svgAttrs}><polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/></svg>`,
  send: `<svg ${svgAttrs}><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>`,
  trash: `<svg ${svgAttrs}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>`,
};

/** 表格操作图标按钮（stopPropagation 防触发整行详情）。 */
function icoBtn(icon: string, title: string, onClick: () => void, danger = false, disabled = false): ReactElement {
  void danger;
  return createElement('button', {
    className: 'dsh-cb-ico-btn',
    title,
    'aria-label': title,
    disabled,
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (!disabled) onClick();
    },
    dangerouslySetInnerHTML: { __html: icon },
  });
}

/** 任务状态胶囊语义：运行中/已暂停/失败/待执行。 */
function taskStatus(task: TaskView): { key: string; tone: string } {
  if (task.running) return { key: 'st.running', tone: 'running' };
  if (task.enabled === false) return { key: 'st.paused', tone: 'paused' };
  const last = task.executions[0];
  if (last && (last.status === 'failed' || last.status === 'timeout')) return { key: `st.${last.status}`, tone: 'failed' };
  if (last && last.status === 'success') return { key: 'st.success', tone: 'success' };
  return { key: 'st.pending', tone: 'pending' };
}

/** 统计卡片（彩色圆底图标 + 数值 + 副文案）。 */
function StatCard(props: { tint: string; icon: string; label: string; value: string; sub: string; subTone: 'ok' | 'err' | 'dim' }): ReactElement {
  const { tint, icon, label, value, sub, subTone } = props;
  return createElement(
    'div',
    { className: 'dsh-cb-stat-card dsh-cb-stat-card2' },
    createElement('div', { className: 'dsh-cb-stat-iconwrap', style: { background: tint } , dangerouslySetInnerHTML: { __html: icon } }),
    createElement('div', { className: 'dsh-cb-stat-main' },
      createElement('div', { className: 'dsh-cb-stat-label' }, label),
      createElement('div', { className: 'dsh-cb-stat-count' }, value),
      createElement('div', { className: `dsh-cb-stat-sub dsh-cb-stat-sub-${subTone}` }, sub),
    ),
  );
}

/** chip 筛选按钮。 */
function Chip(props: { label: string; count: number; active: boolean; onClick: () => void }): ReactElement {
  const { label, count, active, onClick } = props;
  return createElement(
    'button',
    { className: 'dsh-cb-chip' + (active ? ' dsh-cb-chip-active' : ''), onClick },
    label,
    createElement('span', { className: 'dsh-cb-chip-count' }, String(count)),
  );
}

export function BoardPanel(props: { rpc: RpcFn; sessions?: { open?(sessionId: string): unknown } }): ReactElement {
  const [snap, setSnap] = useState<BoardSnapshot | null>(null);
  const [meta, setMeta] = useState<MetaView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [detailId, setDetailId] = useState<string | null | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'paused' | 'failed'>('all');

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

  const tasks = snap?.tasks ?? [];
  const activeTasks = tasks.filter((task) => !task.archived);
  const archivedTasks = tasks.filter((task) => task.archived);

  /* ── 统计 ── */
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - ((now.getDay() + 6) % 7) * 86_400_000; // 本周一零点
    const sevenAgo = now.getTime() - 7 * 86_400_000;
    const allExecs = activeTasks.flatMap((task) => task.executions);
    const weekExecs = allExecs.filter((e) => new Date(e.startedAt).getTime() >= sevenAgo);
    const weekFails = weekExecs.filter((e) => e.status === 'failed' || e.status === 'timeout').length;
    const todayRuns = allExecs.filter((e) => new Date(e.startedAt).getTime() >= todayStart).length;
    return {
      total: activeTasks.length,
      weekNew: activeTasks.filter((task) => new Date(task.createdAt).getTime() >= weekStart).length,
      running: activeTasks.filter((task) => task.running).length,
      paused: activeTasks.filter((task) => task.enabled === false).length,
      todayRuns,
      totalRuns: allExecs.length,
      failRate: weekExecs.length > 0 ? Math.round((weekFails / weekExecs.length) * 1000) / 10 : 0,
      weekFails,
      failedTasks: activeTasks.filter((task) => {
        const last = task.executions[0];
        return last !== undefined && (last.status === 'failed' || last.status === 'timeout');
      }).length,
    };
  }, [activeTasks]);

  /* ── 筛选 ── */
  const filtered = useMemo(() => {
    let list = activeTasks;
    if (statusFilter === 'running') list = list.filter((task) => task.running);
    else if (statusFilter === 'paused') list = list.filter((task) => task.enabled === false);
    else if (statusFilter === 'failed') {
      list = list.filter((task) => {
        const last = task.executions[0];
        return last !== undefined && (last.status === 'failed' || last.status === 'timeout');
      });
    }
    const q = search.trim().toLowerCase();
    if (q === '') return list;
    return list.filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        task.prompt.toLowerCase().includes(q) ||
        (task.tags ?? []).some((tag) => tag.name.toLowerCase().includes(q)),
    );
  }, [activeTasks, statusFilter, search]);

  const zh = lang() === 'zh';
  const cronDesc = (task: TaskView): string => {
    const d = describeCron(task.cron, zh ? 'zh' : 'en');
    return d === task.cron ? '' : d;
  };

  const pushChannelBadge = snap
    ? createElement(
        Badge,
        {
          tone:
            snap.pushChannel.mode === 'service' ? 'ok' : snap.pushChannel.mode === 'unavailable' ? 'warn' : 'accent',
          title: snap.pushChannel.detail,
        },
        `${t('board.channel')}: ${t(`push.mode.${snap.pushChannel.mode}`)}`,
      )
    : null;

  /* ── 表格 ── */
  const tableRows = filtered.map((task) => {
    const last = task.executions[0];
    const st = taskStatus(task);
    const nextRun = task.enabled === false ? '—' : task.nextRunAt ? fmtFuture(task.nextRunAt) : '—';
    return createElement(
      'div',
      { key: task.id, className: 'dsh-cb-tr' + (task.enabled === false ? ' dsh-cb-tr-paused' : ''), onClick: () => setDetailId(task.id) },
      // 任务名称（色点 + 标题 + cron 描述副标题）
      createElement('div', { className: 'dsh-cb-td dsh-cb-td-name' },
        createElement('span', { className: 'dsh-cb-tr-dot', style: { background: task.running ? '#10b981' : task.enabled === false ? '#9ca3af' : st.tone === 'failed' ? '#ef4444' : '#4b6bfb' } }),
        createElement('div', { className: 'dsh-cb-tr-namewrap' },
          createElement('span', { className: 'dsh-cb-tr-title' }, task.title),
          cronDesc(task) !== '' ? createElement('span', { className: 'dsh-cb-tr-sub' }, cronDesc(task)) : null,
        ),
      ),
      // CRON
      createElement('div', { className: 'dsh-cb-td' }, createElement('code', { className: 'dsh-cb-cron-chip' }, task.cron)),
      // 状态
      createElement('div', { className: 'dsh-cb-td' },
        createElement('span', { className: `dsh-cb-status-pill dsh-cb-st-${st.tone}` },
          createElement('span', { className: 'dsh-cb-status-dot' }),
          t(st.key),
        ),
      ),
      // 上次执行
      createElement('div', { className: 'dsh-cb-td' },
        last
          ? createElement('div', { className: 'dsh-cb-lastwrap' },
              createElement('span', null, fmtAgo(last.endedAt ?? last.startedAt)),
              last.durationMs !== undefined ? createElement('span', { className: 'dsh-cb-lastdur' }, fmtDur(last.durationMs)) : null,
            )
          : '—',
      ),
      // 下次执行
      createElement('div', { className: 'dsh-cb-td dsh-cb-td-next' }, nextRun),
      // 操作
      createElement('div', { className: 'dsh-cb-td dsh-cb-td-actions', onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() },
        icoBtn(ICO.edit, t('act.edit'), () => setDetailId(task.id)),
        icoBtn(ICO.play, t('act.run'), () => void props.rpc('cron-board/task-run', { id: task.id }).then(() => void load()), false, task.running),
        icoBtn(task.enabled === false ? ICO.resume : ICO.pause, task.enabled === false ? t('act.resume') : t('act.pause'), () => void props.rpc('cron-board/task-toggle', { id: task.id, enabled: task.enabled === false }).then(() => void load())),
        icoBtn(ICO.send, t('act.testPush'), () => void props.rpc('cron-board/push-test', { id: task.id }).then(() => void load())),
        icoBtn(ICO.trash, t('act.delete'), () => {
          if (typeof window !== 'undefined' && !window.confirm(t('dl.deleteConfirm'))) return;
          void props.rpc('cron-board/task-delete', { id: task.id }).then(() => void load());
        }, true),
      ),
    );
  });

  return createElement(
    'div',
    { className: 'dsh-cb-root' },
    // 顶部统计卡片
    createElement(
      'div',
      { className: 'dsh-cb-stats-row' },
      createElement(StatCard, {
        tint: 'rgba(75,107,251,.12)', icon: ICO.calendar, label: t('stat.total'), value: String(stats.total),
        sub: t('stat.weekNew').replace('{n}', String(stats.weekNew)), subTone: 'ok',
      }),
      createElement(StatCard, {
        tint: 'rgba(16,185,129,.14)', icon: ICO.play, label: t('stat.running'), value: String(stats.running),
        sub: t('stat.pausedCount').replace('{n}', String(stats.paused)), subTone: 'dim',
      }),
      createElement(StatCard, {
        tint: 'rgba(245,158,11,.16)', icon: ICO.bolt, label: t('stat.today'), value: String(stats.todayRuns),
        sub: t('stat.totalRuns').replace('{n}', String(stats.totalRuns)), subTone: 'dim',
      }),
      createElement(StatCard, {
        tint: 'rgba(239,68,68,.12)', icon: ICO.warn, label: t('stat.failRate'), value: `${stats.failRate}%`,
        sub: t('stat.weekFails').replace('{n}', String(stats.weekFails)), subTone: stats.weekFails > 0 ? 'err' : 'ok',
      }),
    ),

    // 标题栏
    createElement(
      'div',
      { className: 'dsh-cb-header' },
      createElement('h2', { className: 'dsh-cb-title' }, t('board.title')),
      pushChannelBadge,
      createElement('div', { className: 'dsh-cb-spacer' }),
      createElement(TextInput, { value: search, onChange: setSearch, placeholder: t('board.search') }),
      createElement(Btn, { kind: 'primary', onClick: () => setDetailId(null) }, '⊕ ' + t('board.new')),
    ),

    // chip 筛选行
    createElement(
      'div',
      { className: 'dsh-cb-chipbar' },
      createElement(Chip, { label: t('chip.all'), count: stats.total, active: statusFilter === 'all', onClick: () => setStatusFilter('all') }),
      createElement(Chip, { label: t('stat.running'), count: stats.running, active: statusFilter === 'running', onClick: () => setStatusFilter('running') }),
      createElement(Chip, { label: t('chip.paused'), count: stats.paused, active: statusFilter === 'paused', onClick: () => setStatusFilter('paused') }),
      createElement(Chip, { label: t('chip.failed'), count: stats.failedTasks, active: statusFilter === 'failed', onClick: () => setStatusFilter('failed') }),
      createElement('div', { className: 'dsh-cb-spacer' }),
      createElement(
        Btn,
        { onClick: () => setShowArchived((v) => !v) },
        (showArchived ? '▾ ' : '▸ ') + t('board.archived') + ` (${archivedTasks.length})`,
      ),
    ),

    // 错误提示
    err !== null
      ? createElement(
          'div',
          { className: 'dsh-cb-modal-body' },
          createElement('div', { className: 'dsh-cb-errbox' }, `${t('board.loadFail')}: ${err}`),
          createElement(Btn, { onClick: () => void load() }, t('board.retry')),
        )
      : null,

    // 任务表格
    createElement(
      'div',
      { className: 'dsh-cb-table' },
      createElement(
        'div',
        { className: 'dsh-cb-thead' },
        createElement('div', { className: 'dsh-cb-th dsh-cb-td-name' }, t('col.name')),
        createElement('div', { className: 'dsh-cb-th' }, t('col.cron')),
        createElement('div', { className: 'dsh-cb-th' }, t('col.status')),
        createElement('div', { className: 'dsh-cb-th' }, t('col.lastRun')),
        createElement('div', { className: 'dsh-cb-th dsh-cb-td-next' }, t('col.nextRun')),
        createElement('div', { className: 'dsh-cb-th dsh-cb-td-actions' }, t('col.actions')),
      ),
      tableRows.length === 0 ? createElement('div', { className: 'dsh-cb-empty' }, t('board.empty')) : tableRows,
    ),

    // 归档视图
    showArchived
      ? createElement(
          'div',
          { className: 'dsh-cb-modal-body', style: { paddingTop: 0 } },
          archivedTasks.length === 0
            ? createElement('div', { className: 'dsh-cb-notebox' }, t('board.archivedEmpty'))
            : archivedTasks.map((task) =>
                createElement(
                  'div',
                  { className: 'dsh-cb-notebox', key: task.id, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  createElement('strong', { style: { fontSize: 12 } }, task.title),
                  (task.tags ?? []).map((tag) => createElement(TagBadge, { key: tag.name, tag })),
                  createElement('div', { className: 'dsh-cb-row-right' }),
                  createElement(Btn, { onClick: () => setDetailId(task.id) }, t('act.edit')),
                  createElement(
                    Btn,
                    {
                      disabled: task.running,
                      onClick: () =>
                        void props.rpc('cron-board/task-restore', { id: task.id }).then(() => void load()),
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
        )
      : null,

    // 详情弹层
    detailId !== undefined
      ? createElement(DetailModal, {
          key: detailId ?? 'new',
          rpc: props.rpc,
          snapshot: snap,
          meta,
          sessions: props.sessions,
          taskId: detailId,
          onClose: () => setDetailId(undefined),
          onChanged: () => void load(),
        })
      : null,
  );
}

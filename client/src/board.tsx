/**
 * 看板主面板（main 键位槽位 dsh-cron-board）：
 * 深色主题 + 统计概览 + 项目分组折叠布局。
 * Host snapshot 是唯一已确认 UI 状态；5s 轮询 + 动作后即时刷新。
 */
import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { BoardSnapshot, Execution, MetaView, TaskView } from '../../src/contract.js';
import { describeCron } from '../../src/cron.js';
import { fmtAgo, fmtDur, fmtFuture } from './format.js';
import { lang, t } from './i18n.js';
import { DetailModal } from './detail.js';
import type { RpcFn } from './rpc.js';
import { Badge, Btn, Dot, Select, TagBadge, TextInput } from './ui.js';

function statusTone(s: Execution['status']): 'ok' | 'err' | 'warn' | 'accent' {
  if (s === 'success') return 'ok';
  if (s === 'failed') return 'err';
  if (s === 'timeout' || s === 'canceled') return 'warn';
  return 'accent';
}

function dotTone(s: Execution['status']): 'run' | 'ok' | 'err' | 'warn' {
  if (s === 'running') return 'run';
  if (s === 'success') return 'ok';
  if (s === 'failed') return 'err';
  return 'warn';
}

function skipText(reason: string): string {
  const key = `skip.${reason}`;
  const v = t(key);
  return v === key ? reason : v;
}

/** 统计卡片 */
function StatCard(props: {
  icon: ReactNode;
  label: string;
  count: number;
  unit: string;
  change?: number;
  tone?: 'default' | 'ok' | 'warn' | 'err' | 'accent';
  onClick?: () => void;
}): ReactElement {
  const { icon, label, count, unit, change, tone = 'default', onClick } = props;
  const changeText = change !== undefined
    ? `${change >= 0 ? '↑' : '↓'}${Math.abs(change)}%`
    : null;
  const changeTone = change !== undefined ? (change >= 0 ? 'ok' : 'err') : undefined;

  return createElement(
    'div',
    { className: `dsh-cb-stat-card dsh-cb-stat-${tone}`, onClick, style: onClick ? { cursor: 'pointer' } : undefined },
    createElement('div', { className: 'dsh-cb-stat-head' },
      createElement('span', { className: 'dsh-cb-stat-label' }, label),
      createElement('div', { className: 'dsh-cb-stat-icon' }, icon),
    ),
    createElement('div', { className: 'dsh-cb-stat-body' },
      createElement('span', { className: 'dsh-cb-stat-count' }, String(count)),
      createElement('span', { className: 'dsh-cb-stat-unit' }, unit),
    ),
    changeText
      ? createElement('div', { className: 'dsh-cb-stat-foot' },
          createElement('span', { className: 'dsh-cb-stat-change-label' }, t('stat.vsYesterday')),
          createElement('span', { className: `dsh-cb-stat-change dsh-cb-change-${changeTone}` }, changeText),
        )
      : null,
  );
}

/** 任务行内联操作小按钮（stopPropagation 防触发整行打开详情）。 */
function rowAction(icon: string, title: string, onClick: () => void, danger = false): ReactElement {
  return createElement('button', {
    className: `dsh-cb-row-action${danger ? ' dsh-cb-row-action-danger' : ''}`,
    title,
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onClick();
    },
  }, icon);
}

/** 项目分组卡片 */
function ProjectGroup(props: {
  name: string;
  color: string;
  count: number;
  tasks: TaskView[];
  expanded: boolean;
  onToggle: () => void;
  onTaskClick: (task: TaskView) => void;
  onRun: (task: TaskView) => void;
  onTestPush: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}): ReactElement {
  const { name, color, count, tasks, expanded, onToggle, onTaskClick, onRun, onTestPush, onDelete } = props;

  return createElement(
    'div',
    { className: 'dsh-cb-project-group' },
    createElement(
      'div',
      { className: 'dsh-cb-project-head', onClick: onToggle },
      createElement('div', { className: 'dsh-cb-project-title-row' },
        createElement('span', { className: 'dsh-cb-project-dot', style: { background: color } }),
        createElement('strong', { className: 'dsh-cb-project-name' }, name),
        createElement('span', { className: 'dsh-cb-project-count' }, String(count)),
      ),
      createElement('span', { className: `dsh-cb-chevron ${expanded ? 'dsh-cb-chevron-open' : ''}` }, '▼'),
    ),
    expanded
      ? createElement(
          'div',
          { className: 'dsh-cb-project-body' },
          tasks.length === 0
            ? createElement('div', { className: 'dsh-cb-empty-task' }, t('board.noTask'))
            : tasks.map((task) => {
                const last = task.executions[0];
                const priority = task.tags?.[0]?.name ?? '';
                const priorityTone = priority === '高' ? 'err' : priority === '中' ? 'warn' : 'ok';
                return createElement(
                  'div',
                  { key: task.id, className: 'dsh-cb-task-item', onClick: () => onTaskClick(task) },
                  createElement('div', { className: 'dsh-cb-task-row' },
                    createElement('span', { className: 'dsh-cb-task-bullet' }),
                    createElement('span', { className: 'dsh-cb-task-title' }, task.title),
                  ),
                  createElement('div', { className: 'dsh-cb-task-meta' },
                    createElement(Badge, { tone: priorityTone as any }, priority || t('task.low')),
                    createElement('span', { className: 'dsh-cb-task-time' },
                      last ? fmtAgo(last.endedAt ?? last.startedAt) : '-',
                    ),
                    createElement('span', { className: 'dsh-cb-task-actions' },
                      rowAction('▶', t('act.run'), () => onRun(task)),
                      rowAction('✉', t('act.testPush'), () => onTestPush(task)),
                      rowAction('🗑', t('act.delete'), () => onDelete(task), true),
                    ),
                    createElement('span', { className: 'dsh-cb-task-status' },
                      last ? t(`st.${last.status}`) : t('st.pending'),
                    ),
                  ),
                );
              }),
        )
      : null,
  );
}

export function BoardPanel(props: { rpc: RpcFn; sessions?: { open?(sessionId: string): unknown } }): ReactElement {
  const [snap, setSnap] = useState<BoardSnapshot | null>(null);
  const [meta, setMeta] = useState<MetaView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [detailId, setDetailId] = useState<string | null | undefined>(undefined);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string | null>(null); // 统计卡片筛选：todo/running/completed/logs

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

  // 统计
  const todoCount = activeTasks.filter((t) => t.enabled && !t.running).length;
  const runningCount = activeTasks.filter((t) => t.running).length;
  const completedCount = activeTasks.filter((t) => {
    const last = t.executions[0];
    return last && last.status === 'success';
  }).length;
  // 日志：最近 5 条执行记录
  const recentLogs = useMemo(() => {
    const logs: Array<{ task: TaskView; exec: Execution }> = [];
    for (const task of activeTasks) {
      for (const exec of task.executions) {
        logs.push({ task, exec });
      }
    }
    logs.sort((a, b) => {
      const aTime = a.exec.endedAt ?? a.exec.startedAt;
      const bTime = b.exec.endedAt ?? b.exec.startedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    return logs.slice(0, 5);
  }, [activeTasks]);

  // 筛选后的任务
  const filteredTasks = useMemo(() => {
    if (!statusFilter) return activeTasks;
    if (statusFilter === 'todo') return activeTasks.filter((t) => t.enabled && !t.running);
    if (statusFilter === 'running') return activeTasks.filter((t) => t.running);
    if (statusFilter === 'completed') return activeTasks.filter((t) => {
      const last = t.executions[0];
      return last && last.status === 'success';
    });
    if (statusFilter === 'logs') return []; // 日志模式不显示任务列表
    return activeTasks;
  }, [activeTasks, statusFilter]);

  // 按项目分组
  const projectGroups = useMemo(() => {
    const groups = new Map<string, TaskView[]>();
    for (const task of filteredTasks) {
      const wsId = task.pinned.workspaceId || '';
      const ws = meta?.workspaces.find((w) => w.id === wsId);
      const name = ws?.title || t('board.other');
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(task);
    }
    return Array.from(groups.entries());
  }, [filteredTasks, meta]);

  const toggleProject = (name: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const projectColors = ['#4b6bfb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return activeTasks;
    return activeTasks.filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        task.prompt.toLowerCase().includes(q) ||
        (task.tags ?? []).some((tag) => tag.name.toLowerCase().includes(q)),
    );
  }, [activeTasks, search]);

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

  return createElement(
    'div',
    { className: 'dsh-cb-root' },
    // 顶部统计卡片
    createElement(
      'div',
      { className: 'dsh-cb-stats-row' },
      createElement(StatCard, {
        icon: createElement('span', null, ''),
        label: t('stat.todo'),
        count: todoCount,
        unit: t('stat.tasks'),
        tone: 'default',
        onClick: () => setStatusFilter(statusFilter === 'todo' ? null : 'todo'),
      }),
      createElement(StatCard, {
        icon: createElement('span', null, '⚡'),
        label: t('stat.running'),
        count: runningCount,
        unit: t('stat.tasks'),
        tone: 'accent',
        onClick: () => setStatusFilter(statusFilter === 'running' ? null : 'running'),
      }),
      createElement(StatCard, {
        icon: createElement('span', null, '✓'),
        label: t('stat.completed'),
        count: completedCount,
        unit: t('stat.tasks'),
        tone: 'ok',
        onClick: () => setStatusFilter(statusFilter === 'completed' ? null : 'completed'),
      }),
      createElement(StatCard, {
        icon: createElement('span', null, '📄'),
        label: t('stat.logs'),
        count: recentLogs.length,
        unit: t('stat.recentLogs'),
        tone: 'default',
        onClick: () => setStatusFilter(statusFilter === 'logs' ? null : 'logs'),
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
      createElement(Btn, { kind: 'primary', onClick: () => setDetailId(null) }, t('board.new')),
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

    // 日志视图
    statusFilter === 'logs'
      ? createElement(
          'div',
          { className: 'dsh-cb-projects' },
          recentLogs.length === 0
            ? createElement('div', { className: 'dsh-cb-empty' }, t('board.feedEmpty'))
            : recentLogs.map(({ task, exec }) =>
                createElement(
                  'div',
                  { key: exec.id, className: 'dsh-cb-log-item' },
                  createElement('div', { className: 'dsh-cb-log-head' },
                    createElement('span', { className: 'dsh-cb-log-task' }, task.title),
                    createElement(Badge, { tone: exec.status === 'success' ? 'ok' : exec.status === 'failed' ? 'err' : 'warn' },
                      t(`st.${exec.status}`)),
                  ),
                  createElement('div', { className: 'dsh-cb-log-meta' },
                    createElement('span', null, t(`exec.trigger.${exec.trigger}`)),
                    createElement('span', null, fmtAgo(exec.endedAt ?? exec.startedAt)),
                    exec.durationMs !== undefined ? createElement('span', null, fmtDur(exec.durationMs)) : null,
                  ),
                ),
              ),
        )
      : null,

    // 项目分组列表
    createElement(
      'div',
      { className: 'dsh-cb-projects' },
      projectGroups.length === 0
        ? createElement('div', { className: 'dsh-cb-empty' }, t('board.empty'))
        : projectGroups.map(([name, tasks], idx) => {
            const filteredTasks = filtered.filter((task) => {
              const wsId = task.pinned.workspaceId || '';
              const ws = meta?.workspaces.find((w) => w.id === wsId);
              return (ws?.title ?? t('board.other')) === name;
            });
            return createElement(ProjectGroup, {
              key: name,
              name,
              color: projectColors[idx % projectColors.length] ?? '#4b6bfb',
              count: filteredTasks.length,
              tasks: filteredTasks,
              expanded: expandedProjects.has(name) || idx === 0,
              onToggle: () => toggleProject(name),
              onTaskClick: (task) => setDetailId(task.id),
              onRun: (task) => void props.rpc('cron-board/task-run', { id: task.id }).then(() => void load()),
              onTestPush: (task) => void props.rpc('cron-board/push-test', { id: task.id }).then(() => void load()),
              onDelete: (task) => void props.rpc('cron-board/task-delete', { id: task.id }).then(() => void load()),
            });
          }),
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

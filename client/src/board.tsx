/**
 * 看板主面板（main 键位槽位 dsh-cron-board）：
 * 四列布局（草稿/已排程/运行中/最近执行）+ 搜索 + 项目分区 + 标签筛选 + 推送通道徽章
 * + 归档视图 + 详情弹层。
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

function TaskCard(props: { task: TaskView; onOpen: () => void }): ReactElement {
  const { task } = props;
  const last = task.executions[0];
  const perm = task.pinned.permission ?? 'read-only';
  return createElement(
    'button',
    { className: 'dsh-cb-card', onClick: props.onOpen, type: 'button' },
    createElement(
      'div',
      { className: 'dsh-cb-card-title' },
      task.needsConfirm && !task.confirmed ? createElement(Badge, { tone: 'warn' }, t('board.confirmHint')) : null,
      createElement('span', { className: 'dsh-cb-card-title-text' }, task.title),
    ),
    (task.tags ?? []).length > 0
      ? createElement(
          'div',
          { className: 'dsh-cb-filterrow', style: { marginTop: 2 } },
          (task.tags ?? []).map((tag) => createElement(TagBadge, { key: tag.name, tag })),
        )
      : null,
    createElement(
      'div',
      { className: 'dsh-cb-card-meta' },
      createElement('span', null, describeCron(task.cron, lang())),
      task.enabled && task.nextRunAt ? createElement('span', null, `${t('board.next')} ${fmtFuture(task.nextRunAt)}`) : null,
      task.lastSkipReason ? createElement('span', null, skipText(task.lastSkipReason)) : null,
    ),
    createElement(
      'div',
      { className: 'dsh-cb-badges' },
      createElement(Badge, { tone: perm === 'read-only' ? 'default' : 'warn' }, t(`perm.${perm}`)),
      last
        ? createElement(
            Badge,
            { tone: statusTone(last.status) },
            createElement(Dot, { tone: last.status === 'running' ? 'run' : dotTone(last.status) }),
            ` ${t(`st.${last.status}`)}`,
          )
        : createElement(Badge, {}, createElement(Dot, { tone: 'idle' }), ` ${t('st.pending')}`),
      task.push ? createElement(Badge, { tone: 'accent' }, `${t('board.channel')} · ${task.push.targetId}`) : null,
    ),
  );
}

export function BoardPanel(props: { rpc: RpcFn; sessions?: { open?(sessionId: string): unknown } }): ReactElement {
  const [snap, setSnap] = useState<BoardSnapshot | null>(null);
  const [meta, setMeta] = useState<MetaView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [project, setProject] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [detailId, setDetailId] = useState<string | null | undefined>(undefined); // undefined=关闭, null=新建

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

  // 全账本在用标签（含归档任务）作为筛选候选
  const allTags = useMemo(() => {
    const names: string[] = [];
    for (const task of tasks) for (const tag of task.tags ?? []) if (!names.includes(tag.name)) names.push(tag.name);
    return names;
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = activeTasks;
    if (project !== '') list = list.filter((task) => task.pinned.workspaceId === project);
    if (tagFilter.length > 0) list = list.filter((task) => (task.tags ?? []).some((tag) => tagFilter.includes(tag.name)));
    if (q !== '') {
      list = list.filter(
        (task) =>
          task.title.toLowerCase().includes(q) ||
          task.prompt.toLowerCase().includes(q) ||
          (task.tags ?? []).some((tag) => tag.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [activeTasks, search, project, tagFilter]);

  const drafts = filtered.filter((task) => !task.enabled);
  const scheduled = filtered.filter((task) => task.enabled && !task.running);
  const running = filtered.filter((task) => task.running);
  const feed = useMemo(
    () => filtered.flatMap((task) => task.executions.map((exec) => ({ task, exec }))).slice(0, 12),
    [filtered],
  );

  const column = (title: string, count: number, body: ReactNode) =>
    createElement(
      'div',
      { className: 'dsh-cb-col', key: title },
      createElement(
        'div',
        { className: 'dsh-cb-col-head' },
        title,
        createElement('span', { className: 'dsh-cb-col-count' }, String(count)),
      ),
      createElement('div', { className: 'dsh-cb-col-body' }, body),
    );

  const emptyCell = (text: string) => createElement('div', { className: 'dsh-cb-col-empty' }, text);

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

  const filterRow = createElement(
    'div',
    { className: 'dsh-cb-filterrow' },
    createElement(Select, {
      value: project,
      onChange: setProject,
      options: [{ value: '', label: t('board.projectAll') }].concat(
        (meta?.workspaces ?? []).map((w) => ({ value: w.id, label: w.title })),
      ),
    }),
    allTags.length > 0
      ? allTags.map((name) =>
          createElement(
            'button',
            {
              key: name,
              type: 'button',
              className: `dsh-cb-chip${tagFilter.includes(name) ? ' dsh-cb-chip-on' : ''}`,
              onClick: () =>
                setTagFilter((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name])),
            },
            name,
          ),
        )
      : null,
    createElement('div', { className: 'dsh-cb-spacer' }),
    createElement(
      Btn,
      { kind: showArchived ? 'primary' : 'ghost', onClick: () => setShowArchived((v) => !v) },
      `${t('board.archived')}${archivedTasks.length > 0 ? ` (${archivedTasks.length})` : ''}`,
    ),
  );

  const archivedView = showArchived
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
    : null;

  return createElement(
    'div',
    { className: 'dsh-cb-root' },
    createElement(
      'div',
      { className: 'dsh-cb-header' },
      createElement('h2', { className: 'dsh-cb-title' }, t('board.title')),
      pushChannelBadge,
      snap ? createElement('span', { className: 'dsh-cb-sub' }, `${t('board.revision')} ${snap.revision}`) : null,
      createElement('div', { className: 'dsh-cb-spacer' }),
      createElement(TextInput, { value: search, onChange: setSearch, placeholder: t('board.search') }),
      createElement(Btn, { kind: 'primary', onClick: () => setDetailId(null) }, t('board.new')),
    ),
    filterRow,
    err !== null
      ? createElement(
          'div',
          { className: 'dsh-cb-modal-body' },
          createElement('div', { className: 'dsh-cb-errbox' }, `${t('board.loadFail')}: ${err}`),
          createElement(Btn, { onClick: () => void load() }, t('board.retry')),
        )
      : null,
    archivedView,
    createElement(
      'div',
      { className: 'dsh-cb-cols' },
      column(
        `${t('col.draft')}`,
        drafts.length,
        drafts.length === 0
          ? emptyCell(t('board.empty'))
          : drafts.map((task) => createElement(TaskCard, { key: task.id, task, onOpen: () => setDetailId(task.id) })),
      ),
      column(
        `${t('col.scheduled')}`,
        scheduled.length,
        scheduled.length === 0
          ? emptyCell(t('board.empty'))
          : scheduled.map((task) => createElement(TaskCard, { key: task.id, task, onOpen: () => setDetailId(task.id) })),
      ),
      column(
        `${t('col.running')}`,
        running.length,
        running.length === 0
          ? emptyCell(t('board.feedEmpty'))
          : running.map((task) => createElement(TaskCard, { key: task.id, task, onOpen: () => setDetailId(task.id) })),
      ),
      column(
        `${t('col.recent')}`,
        feed.length,
        feed.length === 0
          ? emptyCell(t('board.feedEmpty'))
          : feed.map(({ task, exec }) =>
              createElement(
                'button',
                {
                  className: 'dsh-cb-card',
                  key: `${task.id}-${exec.id}`,
                  onClick: () => setDetailId(task.id),
                  type: 'button',
                },
                createElement(
                  'div',
                  { className: 'dsh-cb-card-title' },
                  createElement(Dot, { tone: dotTone(exec.status) }),
                  createElement('span', { className: 'dsh-cb-card-title-text' }, task.title),
                ),
                createElement(
                  'div',
                  { className: 'dsh-cb-exec-meta' },
                  createElement('span', null, `${t(`exec.trigger.${exec.trigger}`)} · ${t(`st.${exec.status}`)}`),
                  createElement('span', null, fmtAgo(exec.endedAt ?? exec.startedAt)),
                  exec.durationMs !== undefined ? createElement('span', null, fmtDur(exec.durationMs)) : null,
                  exec.push ? createElement('span', null, `${t('exec.push')}: ${t(`push.${exec.push.state}`)}`) : null,
                ),
              ),
            ),
      ),
    ),
    meta && meta.pushMode === 'unavailable' && tasks.some((task) => task.push)
      ? createElement(
          'div',
          { className: 'dsh-cb-modal-body', style: { paddingTop: 0 } },
          createElement('div', { className: 'dsh-cb-notebox' }, t('push.unavailableHint')),
        )
      : null,
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

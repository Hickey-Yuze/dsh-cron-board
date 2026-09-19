/**
 * 任务详情弹层：新建/编辑表单 + 权限确认门 + 立即执行/测试推送 + 执行历史与结果查看。
 * 表单状态仅在挂载时从快照初始化（轮询刷新不重置）；切换任务由父组件 key 重挂载。
 */
import { createElement, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { BoardSnapshot, MetaView, TaskView } from '../../src/contract.js';
import { describeCron, isValidCron } from '../../src/cron.js';
import { fmtAgo, fmtDur, parsePushKey, pushKeyOf, pushOptionLabel } from './format.js';
import { lang, t } from './i18n.js';
import type { RpcFn } from './rpc.js';
import { Badge, Btn, Dot, ErrorBox, Field, Select, TextArea, TextInput } from './ui.js';

function pushOptions(meta: MetaView | null): { value: string; label: string }[] {
  const options = [{ value: '', label: t('f.pushNone') }];
  if (meta) {
    for (const target of meta.targets) {
      const bot = meta.bots.find((b) => b.botId === target.botId);
      options.push({ value: `${target.botId}::${target.targetId}`, label: pushOptionLabel(target, bot?.channel) });
    }
  }
  return options;
}

export function DetailModal(props: {
  rpc: RpcFn;
  snapshot: BoardSnapshot | null;
  meta: MetaView | null;
  taskId: string | null;
  onClose: () => void;
  onChanged: () => void;
}): ReactElement {
  const mounted = props.snapshot;
  const task: TaskView | null = props.taskId ? (mounted?.tasks.find((x) => x.id === props.taskId) ?? null) : null;

  const [title, setTitle] = useState(task?.title ?? '');
  const [prompt, setPrompt] = useState(task?.prompt ?? '');
  const [cron, setCron] = useState(task?.cron ?? '0 9 * * 1');
  const [enabled, setEnabled] = useState(task?.enabled ?? true);
  const [workspaceId, setWorkspaceId] = useState(task?.pinned.workspaceId ?? '');
  const [presetId, setPresetId] = useState(task?.pinned.presetId ?? '');
  const [permission, setPermission] = useState(task?.pinned.permission ?? '');
  const [pushKey, setPushKey] = useState(pushKeyOf(task?.push));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resultText, setResultText] = useState<{ execId: string; markdown: string } | null>(null);

  // Esc 关闭（编辑中 busy 时忽略，防误触丢内容）；遮罩点击不关闭
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;
  const busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => {
    const onKey = (e: { key?: string }) => {
      if (e?.key === 'Escape' && !busyRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cronOk = isValidCron(cron.trim());
  const cronPreview =
    cronOk && describeCron(cron.trim(), lang()) !== cron.trim() ? describeCron(cron.trim(), lang()) : t('f.cronPreview');
  const perm = (permission !== '' ? permission : task?.pinned.permission) ?? undefined;

  async function save(): Promise<void> {
    if (title.trim() === '' || prompt.trim() === '' || !cronOk) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await props.rpc('cron-board/task-upsert', {
        task: {
          id: task?.id,
          title: title.trim(),
          prompt,
          cron: cron.trim(),
          enabled,
          pinned: {
            workspaceId: workspaceId === '' ? undefined : workspaceId,
            presetId: presetId === '' ? undefined : presetId,
            permission:
              permission === '' ? undefined : (permission as 'read-only' | 'workspace-write' | 'danger-full-access'),
          },
          push: parsePushKey(pushKey),
        },
      });
      if (r.ok) {
        props.onChanged();
        props.onClose();
      } else {
        setErr(r.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function action(
    fn: () => Promise<{ ok: true; value: unknown } | { ok: false; error: { message: string } }>,
    okMsg: string,
  ): Promise<void> {
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const r = await fn();
      if (r.ok) {
        setNote(okMsg);
        props.onChanged();
      } else {
        setErr(r.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function viewResult(execId: string): Promise<void> {
    if (!task) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await props.rpc('cron-board/exec-result', { taskId: task.id, execId });
      if (r.ok) setResultText({ execId, markdown: r.value.markdown });
      else setErr(r.error.message);
    } finally {
      setBusy(false);
    }
  }

  return createElement(
    'div',
    {
      className: 'dsh-cb-modal-mask',
      // 点击遮罩不关闭（2026-09-19 用户要求：误触会丢编辑内容）；仅通过 关闭/取消/保存/Esc 退出
    },
    createElement(
      'div',
      { className: 'dsh-cb-modal' },
      createElement(
        'div',
        { className: 'dsh-cb-modal-head' },
        createElement(
          'h3',
          { className: 'dsh-cb-title', style: { margin: 0, fontSize: 14 } },
          task ? t('dl.editTitle') : t('dl.newTitle'),
        ),
        createElement('div', { className: 'dsh-cb-spacer' }),
        task
          ? createElement(
              Badge,
              { tone: task.enabled ? 'accent' : 'default' },
              task.enabled ? t('act.enable') : t('act.disable'),
            )
          : null,
        createElement(Btn, { kind: 'ghost', onClick: props.onClose }, t('act.close')),
      ),
      createElement(
        'div',
        { className: 'dsh-cb-modal-body' },
        task
          ? createElement(
              'div',
              { className: `dsh-cb-gatebox${task.confirmed ? ' dsh-cb-gate-ok' : ''}` },
              createElement(
                'div',
                { className: 'dsh-cb-row' },
                createElement('strong', { style: { fontSize: 12 } }, t('gate.title')),
                task.needsConfirm
                  ? task.confirmed
                    ? createElement(Badge, { tone: 'ok' }, t('gate.confirmed'))
                    : createElement(Badge, { tone: 'warn' }, t('gate.needConfirm'))
                  : createElement(Badge, {}, t('perm.read-only')),
              ),
              task.needsConfirm ? createElement('span', { className: 'dsh-cb-hint' }, t('gate.body')) : null,
              task.needsConfirm && !task.confirmed
                ? createElement(
                    'div',
                    { className: 'dsh-cb-row' },
                    createElement(
                      Btn,
                      {
                        disabled: busy,
                        onClick: () =>
                          void action(() => props.rpc('cron-board/task-confirm', { id: task.id }), t('dl.confirmed')),
                      },
                      t('act.confirm'),
                    ),
                  )
                : null,
            )
          : null,
        createElement(Field, { label: t('f.title') }, createElement(TextInput, { value: title, onChange: setTitle, placeholder: t('f.titlePh') })),
        createElement(Field, { label: t('f.prompt') }, createElement(TextArea, { value: prompt, onChange: setPrompt, placeholder: t('f.promptPh') })),
        createElement(
          Field,
          { label: t('f.cron'), hint: cronPreview },
          createElement(TextInput, { value: cron, onChange: setCron }),
          !cronOk
            ? createElement('span', { className: 'dsh-cb-hint', style: { color: 'var(--dsh-cb-err, #d5372f)' } }, 'cron: invalid')
            : null,
        ),
        createElement(
          'div',
          { className: 'dsh-cb-row' },
          createElement(
            'div',
            { style: { flex: 1, minWidth: 180 } },
            createElement(
              Field,
              { label: t('f.workspace') },
              createElement(Select, {
                value: workspaceId,
                onChange: setWorkspaceId,
                options: [{ value: '', label: t('f.workspaceDefault') }].concat(
                  (props.meta?.workspaces ?? []).map((w) => ({ value: w.id, label: w.title })),
                ),
              }),
            ),
          ),
          createElement(
            'div',
            { style: { flex: 1, minWidth: 180 } },
            createElement(
              Field,
              { label: t('f.preset') },
              createElement(Select, {
                value: presetId,
                onChange: setPresetId,
                options: [{ value: '', label: t('f.presetDefault') }].concat(
                  (props.meta?.presets ?? []).map((p) => ({ value: p.id, label: p.title })),
                ),
              }),
            ),
          ),
        ),
        createElement(
          'div',
          { className: 'dsh-cb-row' },
          createElement(
            'div',
            { style: { flex: 1, minWidth: 180 } },
            createElement(
              Field,
              { label: t('f.permission'), hint: perm !== undefined && perm !== 'read-only' ? t('gate.body') : undefined },
              createElement(Select, {
                value: permission,
                onChange: setPermission,
                options: [
                  { value: '', label: t('f.permissionDefault') },
                  { value: 'read-only', label: t('perm.read-only') },
                  { value: 'workspace-write', label: t('perm.workspace-write') },
                  { value: 'danger-full-access', label: t('perm.danger-full-access') },
                ],
              }),
            ),
          ),
          createElement(
            'div',
            { style: { flex: 1, minWidth: 180 } },
            createElement(
              Field,
              { label: t('f.push') },
              createElement(Select, { value: pushKey, onChange: setPushKey, options: pushOptions(props.meta) }),
            ),
          ),
        ),
        task && task.executions.length > 0 && task.needsConfirm && task.confirmed
          ? createElement('div', { className: 'dsh-cb-notebox' }, t('dl.ranOnce'))
          : null,
        err !== null ? createElement(ErrorBox, {}, err) : null,
        note !== null ? createElement('div', { className: 'dsh-cb-notebox' }, note) : null,
        resultText !== null
          ? createElement(
              'div',
              { className: 'dsh-cb-field' },
              createElement('span', { className: 'dsh-cb-label' }, `${t('exec.resultTitle')} · ${resultText.execId}`),
              createElement('pre', { className: 'dsh-cb-result' }, resultText.markdown),
            )
          : null,
        createElement(
          'div',
          { className: 'dsh-cb-row' },
          createElement(Btn, { kind: 'primary', disabled: busy || !cronOk, onClick: () => void save() }, t('act.save')),
          task
            ? createElement(
                Btn,
                {
                  disabled: busy || task.running,
                  onClick: () => void action(() => props.rpc('cron-board/task-run', { id: task.id }), t('dl.runQueued')),
                },
                t('act.run'),
              )
            : null,
          task
            ? createElement(
                Btn,
                {
                  disabled: busy,
                  onClick: () => void action(() => props.rpc('cron-board/push-test', { id: task.id }), t('dl.pushTested')),
                },
                t('act.testPush'),
              )
            : null,
          task
            ? createElement(
                Btn,
                {
                  disabled: enabled === task.enabled,
                  onClick: () =>
                    void action(
                      () => props.rpc('cron-board/task-toggle', { id: task.id, enabled }),
                      enabled ? t('act.enable') : t('act.disable'),
                    ),
                },
                enabled ? t('act.enable') : t('act.disable'),
              )
            : null,
          createElement('div', { className: 'dsh-cb-row-right' }),
          task
            ? createElement(
                Btn,
                {
                  kind: 'danger',
                  disabled: busy || task.running,
                  onClick: () => {
                    if (typeof window !== 'undefined' && !window.confirm(t('dl.deleteConfirm'))) return;
                    void action(() => props.rpc('cron-board/task-delete', { id: task.id }), t('act.close')).then(() =>
                      props.onClose(),
                    );
                  },
                },
                t('act.delete'),
              )
            : null,
        ),
        task
          ? createElement(
              'div',
              { className: 'dsh-cb-field' },
              createElement('span', { className: 'dsh-cb-label' }, t('col.recent')),
              task.executions.length === 0
                ? createElement('span', { className: 'dsh-cb-hint' }, t('board.feedEmpty'))
                : task.executions.map((exec) =>
                    createElement(
                      'div',
                      { className: 'dsh-cb-exec', key: exec.id },
                      createElement(
                        'div',
                        { className: 'dsh-cb-exec-head' },
                        createElement(Dot, {
                          tone:
                            exec.status === 'running'
                              ? 'run'
                              : exec.status === 'success'
                                ? 'ok'
                                : exec.status === 'failed'
                                  ? 'err'
                                  : 'warn',
                        }),
                        createElement('strong', { style: { fontSize: 12 } }, t(`st.${exec.status}`)),
                        createElement(Badge, {}, t(`exec.trigger.${exec.trigger}`)),
                        exec.push
                          ? createElement(
                              Badge,
                              {
                                tone:
                                  exec.push.state === 'sent' ? 'ok' : exec.push.state === 'failed' ? 'err' : 'default',
                              },
                              `${t('exec.push')}: ${t(`push.${exec.push.state}`)}`,
                            )
                          : null,
                        createElement('div', { className: 'dsh-cb-row-right' }),
                        exec.push?.state === 'failed'
                          ? createElement(
                              Btn,
                              {
                                kind: 'ghost',
                                disabled: busy,
                                onClick: () =>
                                  void action(
                                    () => props.rpc('cron-board/push-retry', { taskId: task.id, execId: exec.id }),
                                    t('dl.pushTested'),
                                  ),
                              },
                              t('act.retryPush'),
                            )
                          : null,
                        exec.resultPath !== undefined && exec.status !== 'running'
                          ? createElement(Btn, { kind: 'ghost', disabled: busy, onClick: () => void viewResult(exec.id) }, t('act.viewResult'))
                          : null,
                      ),
                      createElement(
                        'div',
                        { className: 'dsh-cb-exec-meta' },
                        createElement('span', null, fmtAgo(exec.startedAt)),
                        exec.durationMs !== undefined
                          ? createElement('span', null, `${t('exec.duration')} ${fmtDur(exec.durationMs)}`)
                          : null,
                        exec.exitReason !== undefined ? createElement('span', null, exec.exitReason) : null,
                      ),
                    ),
                  ),
            )
          : null,
      ),
    ),
  );
}

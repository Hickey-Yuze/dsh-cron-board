/**
 * 任务详情弹层：新建/编辑表单 + 权限确认门 + 立即执行/测试推送 + 执行历史与结果查看。
 * 表单状态仅在挂载时从快照初始化（轮询刷新不重置）；切换任务由父组件 key 重挂载。
 */
import { createElement, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { BoardSnapshot, MetaView, TaskTag, TaskView } from '../../src/contract.js';
import { describeCron, isValidCron } from '../../src/cron.js';
import { fmtAgo, fmtDur, parsePushKey, pushKeyOf, pushOptionLabel } from './format.js';
import { lang, t } from './i18n.js';
import type { RpcFn } from './rpc.js';
import { Badge, Btn, Dot, ErrorBox, Field, Select, TagBadge, TextArea, TextInput } from './ui.js';

/**
 * Portal 挂载点：弹层渲染进 document.body，脱离看板容器。
 * position:fixed 在带 transform 的祖先里会退化为相对该祖先定位——宿主面板滚动/动画容器
 * 可能带 transform，导致弹层「看着在原地、点击命中在别处」（v1.1.0 新建弹层卡死实测）。
 * react-dom 不可用时降级原地渲染。
 */
let portalApi: { createPortal?(node: ReactNode, container: Element): ReactNode } | null | undefined;
function getPortal(): { createPortal?(node: ReactNode, container: Element): ReactNode } | null {
  if (portalApi !== undefined) return portalApi;
  try {
    portalApi = require('react-dom') as { createPortal?(node: ReactNode, container: Element): ReactNode };
  } catch {
    portalApi = null;
  }
  return portalApi;
}

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
  sessions?: { open?(sessionId: string): unknown };
  taskId: string | null;
  onClose: () => void;
  onChanged: () => void;
}): ReactElement {
  const mounted = props.snapshot;
  const task: TaskView | null = props.taskId ? (mounted?.tasks.find((x) => x.id === props.taskId) ?? null) : null;

  const [title, setTitle] = useState(task?.title ?? '');
  const [prompt, setPrompt] = useState(task?.prompt ?? '');
  const [cronFields, setCronFields] = useState<string[]>(splitCronFields(task?.cron ?? '0 9 * * 1'));
  const cron = cronFields.map((f) => (f.trim() === '' ? '*' : f.trim())).join(' ');
  const [enabled, setEnabled] = useState(task?.enabled ?? true);
  const [workspaceId, setWorkspaceId] = useState(task?.pinned.workspaceId ?? '');
  const [presetId, setPresetId] = useState(task?.pinned.presetId ?? '');
  const [permission, setPermission] = useState(task?.pinned.permission ?? '');
  const [pushKey, setPushKey] = useState(pushKeyOf(task?.push));
  const [reuseSession, setReuseSession] = useState(task?.reuseSession !== false);
  const [pinnedSession, setPinnedSession] = useState(task?.pinned.sessionId ?? '');
  const [tags, setTags] = useState<TaskTag[]>(task?.tags ?? []);
  const [tagDraft, setTagDraft] = useState<{ name: string; promptPrefix: string }>({ name: '', promptPrefix: '' });
  const [aiText, setAiText] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resultText, setResultText] = useState<{ execId: string; markdown: string } | null>(null);
  const archived = task?.archived === true;

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
    // 同名任务硬拦截（编辑排除自身；归档任务不算）——阻止重复生成
    const dup = (mounted?.tasks ?? []).some(
      (x) => x.id !== task?.id && x.archived !== true && x.title.trim() === title.trim(),
    );
    if (dup) {
      setErr(t('dl.duplicateBlocked'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await props.rpc('cron-board/task-upsert', {
        task: {
          id: props.taskId ?? task?.id, // 优先用 props.taskId（编辑模式），避免快照未加载时 task 为 null
          title: title.trim(),
          prompt,
          cron: cron.trim(),
          enabled: Boolean(enabled), // 强制布尔，防止序列化异常
          pinned: {
            workspaceId: workspaceId === '' ? undefined : workspaceId,
            presetId: presetId === '' ? undefined : presetId,
            permission:
              permission === '' ? undefined : (permission as 'read-only' | 'workspace-write' | 'danger-full-access'),
            sessionId: pinnedSession === '' ? undefined : pinnedSession,
          },
          push: parsePushKey(pushKey),
          reuseSession,
          tags: tags.length > 0 ? tags : undefined,
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

  /** AI 解析：粘贴文本 → 表单填充（不自动保存，解析失败不动已输入内容）。 */
  async function runAiParse(): Promise<void> {
    const text = aiText.trim();
    if (text === '' || aiParsing) return;
    setAiParsing(true);
    setErr(null);
    try {
      const r = await props.rpc('cron-board/parse-prompt', { text });
      if (r.ok) {
        if (typeof r.value.title === 'string' && r.value.title !== '') setTitle(r.value.title);
        if (typeof r.value.prompt === 'string' && r.value.prompt !== '') setPrompt(r.value.prompt);
        if (typeof r.value.cron === 'string' && r.value.cron !== '' && isValidCron(r.value.cron)) {
          setCronFields(splitCronFields(r.value.cron));
        }
        setNote(t('f.aiHint'));
      } else {
        setErr(r.error.message);
      }
    } finally {
      setAiParsing(false);
    }
  }

  function addTag(): void {
    const name = tagDraft.name.trim();
    if (name === '' || tags.some((x) => x.name === name) || tags.length >= 8) return;
    const prefix = tagDraft.promptPrefix.trim();
    setTags((prev) => [...prev, prefix !== '' ? { name, promptPrefix: prefix } : { name }]);
    setTagDraft({ name: '', promptPrefix: '' });
  }

  const modalTree = createElement(
    'div',
    {
      className: 'dsh-cb-modal-mask',
      // 点击遮罩不关闭（2026-09-19 用户要求：误触会丢编辑内容）；仅通过 关闭/取消/保存/Esc 退出
      onMouseDown: (e: { stopPropagation?: () => void }) => e.stopPropagation?.(),
      onClick: (e: { stopPropagation?: () => void }) => e.stopPropagation?.(),
    },
    createElement(
      'div',
      {
        className: 'dsh-cb-modal',
        onMouseDown: (e: { stopPropagation?: () => void }) => e.stopPropagation?.(),
        onClick: (e: { stopPropagation?: () => void }) => e.stopPropagation?.(),
      },
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
        archived ? createElement('div', { className: 'dsh-cb-notebox' }, t('dl.archived')) : null,
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
        !task && !archived
          ? createElement(
              'div',
              { className: 'dsh-cb-field' },
              createElement('span', { className: 'dsh-cb-label' }, t('f.aiParse')),
              createElement(TextArea, { value: aiText, onChange: setAiText, placeholder: t('f.aiPlaceholder'), rows: 3 }),
              createElement(
                'div',
                { className: 'dsh-cb-row' },
                createElement(Btn, { disabled: aiParsing || aiText.trim() === '', onClick: () => void runAiParse() }, aiParsing ? t('f.aiParsing') : t('f.aiParse')),
                createElement('span', { className: 'dsh-cb-hint' }, t('f.aiHint')),
              ),
            )
          : null,
        createElement(Field, { label: t('f.title') }, createElement(TextInput, { value: title, onChange: setTitle, placeholder: t('f.titlePh'), disabled: archived })),
        createElement(Field, { label: t('f.prompt') }, createElement(TextArea, { value: prompt, onChange: setPrompt, placeholder: t('f.promptPh'), disabled: archived })),
        createElement(
          Field,
          { label: t('f.cronFields'), hint: cronPreview },
          createElement(
            'div',
            { className: 'dsh-cb-crongrid' },
            (['min', 'hour', 'dom', 'mon', 'dow'] as const).map((key, i) =>
              createElement(
                'div',
                { className: 'dsh-cb-croncell', key },
                createElement('span', { className: 'dsh-cb-label' }, t(`f.cronField.${key}`)),
                createElement('input', {
                  className: 'dsh-cb-input',
                  value: cronFields[i] ?? '',
                  placeholder: '*',
                  disabled: archived,
                  onChange: (e: { target: { value: string } }) =>
                    setCronFields((prev) => prev.map((v, j) => (j === i ? e.target.value : v))),
                }),
              ),
            ),
          ),
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
        createElement(
          'div',
          { className: 'dsh-cb-checkrow' },
          createElement('input', {
            type: 'checkbox',
            checked: reuseSession,
            disabled: archived,
            onChange: (e: { target: { checked: boolean } }) => setReuseSession(e.target.checked),
          }),
          createElement('span', { style: { fontSize: 12 } }, t('f.reuseSession')),
          createElement('span', { className: 'dsh-cb-hint' }, t('f.reuseHint')),
        ),
        reuseSession
          ? createElement(
              'div',
              { className: 'dsh-cb-field', style: { maxWidth: 420 } },
              createElement('span', { className: 'dsh-cb-label' }, t('f.pickSession')),
              createElement(Select, {
                value: pinnedSession,
                onChange: setPinnedSession,
                options: [
                  { value: '', label: t('f.pickSessionAuto') },
                  ...(props.meta?.sessions ?? [])
                    .filter((x) => {
                      const wsPath = meta?.workspaces.find((w) => w.id === workspaceId)?.path;
                      return wsPath && x.cwd ? x.cwd === wsPath : true;
                    })
                    .map((x) => ({
                      value: x.id,
                      label: `${x.title} · ${x.id.slice(0, 8)}`,
                    })),
                ],
              }),
            )
          : null,
        createElement(
          'div',
          { className: 'dsh-cb-checkrow' },
          createElement('input', {
            type: 'checkbox',
            id: 'dsh-cb-enabled',
            checked: enabled,
            disabled: archived,
            onChange: (e: { target: { checked: boolean } }) => setEnabled(e.target.checked),
          }),
          createElement('label', { htmlFor: 'dsh-cb-enabled', style: { fontSize: 12 } }, t('f.enableAfterSave')),
          createElement('span', { className: 'dsh-cb-hint' }, t('f.enableHint')),
        ),
        createElement(
          Field,
          { label: t('f.tags') },
          createElement(
            'div',
            { className: 'dsh-cb-tagrow' },
            tags.length > 0
              ? createElement(
                  'div',
                  { className: 'dsh-cb-filterrow' },
                  tags.map((tag) =>
                    createElement(
                      'span',
                      { className: 'dsh-cb-tagitem', key: tag.name },
                      createElement(TagBadge, { tag }),
                      archived
                        ? null
                        : createElement(
                            Btn,
                            { kind: 'ghost', onClick: () => setTags((prev) => prev.filter((x) => x.name !== tag.name)) },
                            t('f.tagRemove'),
                          ),
                    ),
                  ),
                )
              : null,
            !archived && tags.length < 8
              ? createElement(
                  'div',
                  { className: 'dsh-cb-tagitem' },
                  createElement(TextInput, {
                    value: tagDraft.name,
                    onChange: (v) => setTagDraft((prev) => ({ ...prev, name: v })),
                    placeholder: t('f.tagName'),
                  }),
                  createElement(TextInput, {
                    value: tagDraft.promptPrefix,
                    onChange: (v) => setTagDraft((prev) => ({ ...prev, promptPrefix: v })),
                    placeholder: t('f.tagPrefix'),
                  }),
                  createElement(Btn, { disabled: tagDraft.name.trim() === '', onClick: addTag }, t('f.tagAdd')),
                )
              : null,
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
          archived
            ? createElement(
                Btn,
                {
                  disabled: busy,
                  onClick: () =>
                    void action(() => props.rpc('cron-board/task-restore', { id: task!.id }), t('dl.restored')).then(
                      () => props.onClose(),
                    ),
                },
                t('act.restore'),
              )
            : createElement(Btn, { kind: 'primary', disabled: busy || !cronOk, onClick: () => void save() }, t('act.save')),
          task && !archived
            ? createElement(
                Btn,
                {
                  disabled: busy || task.running,
                  onClick: () => void action(() => props.rpc('cron-board/task-run', { id: task.id }), t('dl.runQueued')),
                },
                t('act.run'),
              )
            : null,
          task && !archived
            ? createElement(
                Btn,
                {
                  disabled: busy,
                  onClick: () => void action(() => props.rpc('cron-board/push-test', { id: task.id }), t('dl.pushTested')),
                },
                t('act.testPush'),
              )
            : null,
          task && !archived
            ? createElement(
                Btn,
                {
                  disabled: busy || enabled === task.enabled,
                  onClick: () =>
                    void action(
                      () => props.rpc('cron-board/task-toggle', { id: task.id, enabled }),
                      enabled ? t('act.enable') : t('act.disable'),
                    ),
                },
                enabled ? t('act.enable') : t('act.disable'),
              )
            : null,
          task && !archived
            ? createElement(
                Btn,
                {
                  disabled: busy || task.running,
                  onClick: () =>
                    void action(() => props.rpc('cron-board/task-archive', { id: task.id }), t('act.archive')).then(() =>
                      props.onClose(),
                    ),
                },
                t('act.archive'),
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
                        }),                        createElement('strong', { style: { fontSize: 12 } }, t(`st.${exec.status}`)),
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
                        exec.sessionId !== '' && props.sessions?.open && exec.status !== 'running'
                          ? createElement(
                              Btn,
                              {
                                kind: 'ghost',
                                title: exec.sessionId,
                                onClick: () => props.sessions?.open?.(exec.sessionId),
                              },
                              t('board.openSession'),
                            )
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
  // v1.3.3 恢复 Portal：v1.3.0 重构后 root 容器有 overflow/transform，inline 渲染导致 fixed 定位错位、点击命中偏移
  const portal = getPortal()?.createPortal;
  if (portal && typeof document !== 'undefined') {
    try {
      return portal(modalTree, document.body) as ReactElement;
    } catch {
      /* 降级原地渲染 */
    }
  }
  return modalTree;
}

/** 把已有 cron 表达式拆成 5 个字段输入（缺段补空=通配，仅取前 5 段）。 */
function splitCronFields(expr: string): string[] {
  const parts = expr.trim().split(/\s+/).filter((p) => p !== '');
  return [0, 1, 2, 3, 4].map((i) => parts[i] ?? '');
}

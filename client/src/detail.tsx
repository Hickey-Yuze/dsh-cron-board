/**
 * 任务详情弹层 v2（对齐设计稿 cron-board-edit-modal-light）：
 * 头部（标题+副标题+状态徽章+×）→ 权限确认门卡 → 标题/PROMPT → 排程分区（CRON 徽章+
 * 预览胶囊+五列字段+预设 chips）→ 运行环境 → 权限与推送 → 会话开关 → 标签 → 任务图片
 * （虚线拖拽上传）→ 会话徽标 → 重新武装警告 → 操作按钮行 → 最近执行。
 * 表单状态仅在挂载时从快照初始化（轮询刷新不重置）；切换任务由父组件 key 重挂载。
 */
import { createElement, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { BoardSnapshot, MetaView, TaskBadge, TaskTag, TaskView } from '../../src/contract.js';
import { BADGE_COLORS, BADGE_ICONS, BADGE_IMAGE_MAX_BYTES, BADGE_IMAGE_TYPES, IM_BADGE_ICONS, resolveBadgeColor } from '../../src/contract.js';
import { CRON_CHANNEL_COLOR, invalidateLedgerMap } from './channelBadge.js';
import { describeCron, isValidCron } from '../../src/cron.js';
import { fmtAgo, fmtDur, fmtFuture, parsePushKey, pushKeyOf, pushOptionLabel } from './format.js';
import { lang, t } from './i18n.js';
import type { RpcFn } from './rpc.js';
import { Badge, ErrorBox, Select, TagBadge, TextArea, TextInput } from './ui.js';

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

/**
 * 任务图片压缩（模型视觉输入标准规格）：长边 1568px、JPEG q0.85、白底
 * （PNG 透明/GIF 动图首帧统一转 JPEG）。小体积原图原样保留。
 * 目的：控制 RPC 请求体大小（base64 后单张通常 200~400KB）并省视觉 token。
 */
async function compressForModel(file: File): Promise<{ mediaType: string; data: string }> {
  const buf = await file.arrayBuffer();
  if (buf.byteLength <= 512 * 1024 && (file.type === 'image/png' || file.type === 'image/jpeg')) {
    return { mediaType: file.type, data: toBase64(new Uint8Array(buf)) };
  }
  try {
    const bitmap = await createImageBitmap(new Blob([buf], { type: file.type }));
    const long = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1568 / long);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c2d = canvas.getContext('2d');
    if (!c2d) throw new Error('canvas 不可用');
    c2d.fillStyle = '#ffffff';
    c2d.fillRect(0, 0, w, h);
    c2d.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), 'image/jpeg', 0.85);
    });
    return { mediaType: 'image/jpeg', data: toBase64(new Uint8Array(await blob.arrayBuffer())) };
  } catch {
    // 降级：原样发送（可能触发请求体超限，由服务端报明确错误）
    const fallbackType = file.type === 'image/gif' || file.type === 'image/webp' ? file.type : 'image/png';
    return { mediaType: fallbackType, data: toBase64(new Uint8Array(buf)) };
  }
}

/** Uint8Array → 规范 base64（分块避免 apply 栈溢出）。 */
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
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

/* --------------------------------- v2 小件 --------------------------------- */

function SvgIcon(props: { children?: ReactNode; size?: number }): ReactElement {
  return createElement(
    'svg',
    { className: 'dsh-cb-ic', width: props.size ?? 16, height: props.size ?? 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    props.children,
  );
}
const IconShieldCheck = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z' }), createElement('path', { d: 'm9 12 2 2 4-4' }));
const IconShieldAlert = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z' }), createElement('path', { d: 'M12 8v5' }), createElement('circle', { cx: 12, cy: 16, r: 0.6, fill: 'currentColor', stroke: 'none' }));
const IconLock = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }), createElement('path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }));
const IconX = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M6 6l12 12M18 6 6 18' }));
const IconClock = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('circle', { cx: 12, cy: 12, r: 9 }), createElement('path', { d: 'M12 7v5l3 3' }));
const IconSave = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M5 3h11l3 3v15H5V3z' }), createElement('path', { d: 'M8 3v5h7V3M8 21v-7h8v7' }));
const IconPlay = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M7 4.5v15l12-7.5-12-7.5z' }));
const IconSend = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'm3 11 18-8-8 18-2.5-7.5L3 11z' }));
const IconCheck = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'm4.5 12.5 5 5 10-11' }));
const IconArchive = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('rect', { x: 3, y: 4, width: 18, height: 5, rx: 1 }), createElement('path', { d: 'M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4' }));
const IconTrash = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13' }));
const IconUpload = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'M12 16V5m0 0-4 4m4-4 4 4' }), createElement('path', { d: 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2' }));
const IconChevronR = (p: { size?: number }) => createElement(SvgIcon, { size: p.size }, createElement('path', { d: 'm9 6 6 6-6 6' }));

/** v2 开关（会话分区）。 */
function Switch(props: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }): ReactElement {
  return createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': props.on,
    className: `dsh-cb-switch${props.on ? ' dsh-cb-switch-on' : ''}`,
    disabled: props.disabled === true,
    onClick: () => props.onChange(!props.on),
  });
}

/** v2 分区（细分割线 + 标题行）。 */
function Section(props: { title: string; badge?: ReactNode; children?: ReactNode }): ReactElement {
  return createElement(
    'div',
    { className: 'dsh-cb-sec' },
    createElement('div', { className: 'dsh-cb-sec-head' },
      createElement('span', { className: 'dsh-cb-sec-title' }, props.title),
      props.badge ?? null,
    ),
    props.children,
  );
}

/** 字段标签行（label 左 + hint 右）。 */
function LabelRow(props: { label: string; hint?: string }): ReactElement {
  return createElement('div', { className: 'dsh-cb-labelrow' },
    createElement('span', { className: 'dsh-cb-label' }, props.label),
    props.hint ? createElement('span', { className: 'dsh-cb-labelrow-hint' }, props.hint) : null,
  );
}

/** v2 操作按钮（保存/执行/推送等）。 */
function Btn2(props: { kind?: 'primary' | 'outline' | 'ghost' | 'danger-text'; icon?: ReactNode; label: string; disabled?: boolean; onClick: () => void }): ReactElement {
  const cls = props.kind === 'primary'
    ? 'dsh-cb-btn-primary dsh-cb-btn2'
    : props.kind === 'ghost'
      ? 'dsh-cb-btn-ghost dsh-cb-btn2'
      : props.kind === 'danger-text'
        ? 'dsh-cb-btn-danger-text'
        : 'dsh-cb-btn-outline dsh-cb-btn2';
  return createElement('button', { type: 'button', className: cls, disabled: props.disabled === true, onClick: props.onClick },
    props.icon ?? null,
    createElement('span', null, props.label),
  );
}

/** 徽标预览（编辑框内所见即所得；与侧边栏渲染同构）。 */
function BadgePreview(props: { badge: TaskBadge | null }): ReactElement {
  const b = props.badge;
  if (b !== null && b.kind === 'emoji') {
    return createElement('span', { style: { fontSize: 20, lineHeight: 1 } }, b.value);
  }
  if (b !== null && b.kind === 'image') {
    return createElement('img', {
      src: 'data:' + b.mediaType + ';base64,' + b.data,
      alt: '',
      style: { width: 22, height: 22, objectFit: 'contain' },
    });
  }
  const color = resolveBadgeColor(b !== null && b.kind === 'icon' ? b.color : undefined, CRON_CHANNEL_COLOR);
  if (b !== null && b.kind === 'icon' && b.value in IM_BADGE_ICONS) {
    const def = IM_BADGE_ICONS[b.value]!;
    return createElement(
      'svg',
      { viewBox: def.viewBox, width: 22, height: 22 },
      def.parts.map((p, i) =>
        p.strokeColor !== undefined
          ? createElement('path', {
              d: p.d,
              key: i,
              fill: p.fill ?? 'none',
              stroke: p.strokeColor,
              strokeWidth: p.strokeWidth ?? 2,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            })
          : createElement('path', { d: p.d, key: i, fill: p.fill ?? color }),
      ),
    );
  }
  const paths = (b !== null && b.kind === 'icon' ? (BADGE_ICONS[b.value] ?? BADGE_ICONS.clock) : BADGE_ICONS.clock)!;
  return createElement(
    'svg',
    { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
    paths.map((d, i) => createElement('path', { d, key: i })),
  );
}

export function DetailModal(props: {
  rpc: RpcFn;
  snapshot: BoardSnapshot | null;
  meta: MetaView | null;
  sessions?: { open?(sessionId: string): unknown };
  taskId: string | null;
  /** 复制模式：以该任务为模板预填表单（taskId=null 新建）；操作按钮区仍按 task 判定。 */
  cloneFrom?: TaskView | null;
  onClose: () => void;
  onChanged: () => void;
}): ReactElement {
  const mounted = props.snapshot;
  const task: TaskView | null = props.taskId ? (mounted?.tasks.find((x) => x.id === props.taskId) ?? null) : null;
  // 表单初始化数据源：编辑用 task；复制用 cloneFrom（不依赖 snapshot 时序）。
  const src: TaskView | null = task ?? props.cloneFrom ?? null;

  const [title, setTitle] = useState(src ? (task ? src.title : src.title + ' 副本') : '');
  const [prompt, setPrompt] = useState(src?.prompt ?? '');
  const [cronFields, setCronFields] = useState<string[]>(splitCronFields(src?.cron ?? '0 9 * * 1'));
  const cron = cronFields.map((f) => (f.trim() === '' ? '*' : f.trim())).join(' ');
  const [enabled, setEnabled] = useState(src?.enabled ?? true);
  const [workspaceId, setWorkspaceId] = useState(src?.pinned.workspaceId ?? '');
  const [presetId, setPresetId] = useState(src?.pinned.presetId ?? '');
  const [permission, setPermission] = useState(src?.pinned.permission ?? '');
  const [pushKey, setPushKey] = useState(pushKeyOf(src?.push));
  const [reuseSession, setReuseSession] = useState(src?.reuseSession !== false);
  const [tags, setTags] = useState<TaskTag[]>(src?.tags ?? []);
  const [tagDraft, setTagDraft] = useState<{ name: string; promptPrefix: string }>({ name: '', promptPrefix: '' });
  // 任务图片编辑：undefined=不变（不传字段）；[]=清空；[...]=替换。base64 存 dataUrl 供预览。
  const [images, setImages] = useState<Array<{ name?: string; mediaType: string; data: string }> | undefined>(undefined);
  const [existingImageCount] = useState(src?.promptImageRefs?.length ?? 0);
  const [badge, setBadge] = useState<TaskBadge | null>(src?.badge ?? null);
  const badgeFileRef = useRef<HTMLInputElement | null>(null);
  const badgeColorRef = useRef<HTMLInputElement | null>(null);
  const imageFileRef = useRef<HTMLInputElement | null>(null);
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
  const cronDesc = cronOk ? describeCron(cron.trim(), lang()) : '';
  const cronPreviewOk = cronOk && cronDesc !== cron.trim();
  const perm = (permission !== '' ? permission : task?.pinned.permission) ?? undefined;
  const permHigh = perm !== undefined && perm !== 'read-only';

  // cron 预设 chips：与当前字段匹配者高亮；全不匹配=自定义
  const cronPresets: Array<{ key: string; fields: string[] }> = [
    { key: 'mon', fields: ['9', '17', '*', '*', '1'] },
    { key: 'daily', fields: ['0', '9', '*', '*', '*'] },
    { key: 'weekday', fields: ['0', '9', '*', '*', '1-5'] },
    { key: 'hourly', fields: ['0', '*', '*', '*', '*'] },
  ];
  const norm = (v: string | undefined) => (v === undefined || v.trim() === '' ? '*' : v.trim());
  const matchedPreset = cronPresets.find((p) => p.fields.every((f, i) => norm(cronFields[i]) === f));
  const isCustom = cronOk && matchedPreset === undefined;

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
          },
          push: parsePushKey(pushKey),
          reuseSession,
          tags: tags.length > 0 ? tags : undefined,
          ...(images !== undefined
            ? { images }
            : src?.promptImageRefs && src.promptImageRefs.length > 0
              ? { imageRefs: src.promptImageRefs }
              : {}),
          ...(badge !== (src?.badge ?? null) ? { badge } : {}),
        },
      });
      if (r.ok) {
        invalidateLedgerMap(); // 侧边栏已挂载徽标即时重拉刷新
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
    onSuccess?: () => void,
  ): Promise<void> {
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const r = await fn();
      if (r.ok) {
        setNote(okMsg);
        onSuccess?.();
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

  function addImageFiles(files: File[]): void {
    if (files.length === 0) return;
    void (async () => {
      const next: Array<{ name?: string; mediaType: string; data: string }> = [];
      for (const file of files.slice(0, 4)) {
        if (!file.type.startsWith('image/')) continue;
        next.push({ name: file.name, ...(await compressForModel(file)) });
      }
      setImages((prev) => [...(prev ?? []), ...next].slice(0, 4));
    })();
  }

  // ── 权限确认门卡（绿=已确认 / 橙=待确认 / 灰=跟随默认档）──
  const gateCard = task
    ? createElement(
        'div',
        { className: `dsh-cb-gatecard ${task.needsConfirm ? (task.confirmed ? 'dsh-cb-gatecard-ok' : 'dsh-cb-gatecard-warn') : 'dsh-cb-gatecard-neutral'}` },
        createElement('span', { className: 'dsh-cb-gatecard-icon' },
          task.needsConfirm ? (task.confirmed ? createElement(IconShieldCheck, { size: 17 }) : createElement(IconShieldAlert, { size: 17 })) : createElement(IconLock, { size: 17 }),
        ),
        createElement(
          'div',
          { className: 'dsh-cb-gatecard-main' },
          createElement('div', { className: 'dsh-cb-gatecard-title' },
            task.needsConfirm ? (task.confirmed ? t('gate.okTitle') : t('gate.warnTitle')) : t('gate.neutralTitle'),
          ),
          task.needsConfirm
            ? createElement('div', { className: 'dsh-cb-gatecard-body' }, t('gate.body'))
            : createElement('div', { className: 'dsh-cb-gatecard-body' }, `${t('f.permission')}: ${t('perm.read-only')}`),
          task.needsConfirm && !task.confirmed
            ? createElement(
                'div',
                { className: 'dsh-cb-gatecard-actions' },
                createElement(Btn2, {
                  kind: 'primary',
                  label: t('act.confirm'),
                  disabled: busy,
                  onClick: () => void action(() => props.rpc('cron-board/task-confirm', { id: task.id }), t('dl.confirmed')),
                }),
              )
            : null,
        ),
      )
    : null;

  // ── cron 预览胶囊 ──
  const cronPill = createElement(
    'div',
    { className: `dsh-cb-cronpill${cronOk ? '' : ' dsh-cb-cronpill-bad'}` },
    createElement(IconClock, { size: 13 }),
    createElement('span', { className: 'dsh-cb-cronpill-desc' }, cronOk ? (cronPreviewOk ? cronDesc : cron.trim()) : cron.trim()),
    task?.nextRunAt && cronOk ? createElement('span', { className: 'dsh-cb-cronpill-next' }, `${t('board.next')} ${fmtFuture(task.nextRunAt)}`) : null,
  );

  const modalTree = createElement(
    'div',
    {
      className: 'dsh-cb-modal-mask',
      // 点击遮罩不关闭（2026-09-19 用户要求：误触会丢编辑内容）；仅通过 关闭/保存/Esc 退出
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

      // ── 头部（sticky）──
      createElement(
        'div',
        { className: 'dsh-cb-modal-head2' },
        createElement(
          'div',
          { className: 'dsh-cb-modal-head2-main' },
          createElement('h3', { className: 'dsh-cb-modal-title' }, task ? t('dl.editTitle') : t('dl.newTitle')),
          src
            ? createElement('div', { className: 'dsh-cb-modal-sub' },
                [
                  task ? src.title : null,
                  (() => { const ws = (props.meta?.workspaces ?? []).find((w) => w.id === src.pinned.workspaceId); return ws ? ws.title : null; })(),
                  cronOk ? cronDesc || cron.trim() : null,
                ].filter(Boolean).join(' · '),
              )
            : null,
        ),
        createElement(
          'div',
          { className: 'dsh-cb-modal-head2-right' },
          task
            ? createElement(Badge, { tone: task.enabled ? 'accent' : 'default' }, task.enabled ? t('st.enabledOn') : t('st.paused'))
            : null,
          createElement('button', { type: 'button', className: 'dsh-cb-xbtn', title: t('act.close'), onClick: props.onClose }, createElement(IconX, { size: 16 })),
        ),
      ),

      // ── 内容（滚动区）──
      createElement(
        'div',
        { className: 'dsh-cb-modal-body2' },
        archived ? createElement('div', { className: 'dsh-cb-gatecard dsh-cb-gatecard-neutral' },
          createElement('span', { className: 'dsh-cb-gatecard-icon' }, createElement(IconArchive, { size: 17 })),
          createElement('div', { className: 'dsh-cb-gatecard-main' },
            createElement('div', { className: 'dsh-cb-gatecard-title' }, t('dl.archived')),
          ),
        ) : null,

        gateCard,

        // AI 解析（仅新建）
        !task && !archived
          ? createElement(
              'div',
              { className: 'dsh-cb-aicard' },
              createElement(LabelRow, { label: t('f.aiParse') }),
              createElement(TextArea, { value: aiText, onChange: setAiText, placeholder: t('f.aiPlaceholder'), rows: 3 }),
              createElement(
                'div',
                { className: 'dsh-cb-airow' },
                createElement(Btn2, { kind: 'outline', label: aiParsing ? t('f.aiParsing') : t('f.aiParse'), disabled: aiParsing || aiText.trim() === '', onClick: () => void runAiParse() }),
                createElement('span', { className: 'dsh-cb-hint' }, t('f.aiHint')),
              ),
            )
          : null,

        // 标题 / PROMPT
        createElement('div', { className: 'dsh-cb-field' },
          createElement('span', { className: 'dsh-cb-label' }, t('f.title')),
          createElement(TextInput, { value: title, onChange: setTitle, placeholder: t('f.titlePh'), disabled: archived }),
        ),
        createElement('div', { className: 'dsh-cb-field' },
          createElement(LabelRow, { label: t('f.prompt'), hint: t('f.promptHint') }),
          createElement(TextArea, { value: prompt, onChange: setPrompt, placeholder: t('f.promptPh'), rows: 7, disabled: archived }),
        ),

        // ── 排程 ──
        createElement(Section, { title: t('f.cronSection'), badge: createElement('span', { className: 'dsh-cb-sec-badge' }, t('f.cronBadge')) },
          createElement('div', { className: 'dsh-cb-sec-hint' }, t('f.cronDesc')),
          cronPill,
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
          !cronOk ? createElement('span', { className: 'dsh-cb-hint dsh-cb-hint-err' }, 'cron: invalid') : null,
          createElement(
            'div',
            { className: 'dsh-cb-presetrow' },
            cronPresets.map((p) =>
              createElement('button', {
                key: p.key,
                type: 'button',
                className: `dsh-cb-chip${matchedPreset?.key === p.key ? ' dsh-cb-chip-active' : ''}`,
                disabled: archived,
                onClick: () => setCronFields([...p.fields]),
              }, t(`f.cronPreset.${p.key}`)),
            ),
            createElement('button', {
              type: 'button',
              className: `dsh-cb-chip${isCustom ? ' dsh-cb-chip-active' : ''}`,
              disabled: true,
              style: { cursor: 'default' },
            }, t('f.cronPreset.custom')),
          ),
        ),

        // ── 运行环境 ──
        createElement(Section, { title: t('f.envSection') },
          createElement(
            'div',
            { className: 'dsh-cb-grid2' },
            createElement('div', { className: 'dsh-cb-field' },
              createElement('span', { className: 'dsh-cb-label' }, t('f.workspace')),
              createElement(Select, {
                value: workspaceId,
                onChange: setWorkspaceId,
                disabled: archived,
                options: [{ value: '', label: t('f.workspaceDefault') }].concat(
                  (props.meta?.workspaces ?? []).map((w) => ({ value: w.id, label: w.title })),
                ),
              }),
            ),
            createElement('div', { className: 'dsh-cb-field' },
              createElement('span', { className: 'dsh-cb-label' }, t('f.preset')),
              createElement(Select, {
                value: presetId,
                onChange: setPresetId,
                disabled: archived,
                options: [{ value: '', label: t('f.presetDefault') }].concat(
                  (props.meta?.presets ?? []).map((p) => ({ value: p.id, label: p.title })),
                ),
              }),
            ),
          ),
        ),

        // ── 权限与推送 ──
        createElement(Section, { title: t('f.permSection') },
          createElement(
            'div',
            { className: 'dsh-cb-grid2' },
            createElement('div', { className: 'dsh-cb-field' },
              createElement('span', { className: 'dsh-cb-label' }, t('f.permission')),
              createElement(Select, {
                value: permission,
                onChange: setPermission,
                disabled: archived,
                options: [
                  { value: '', label: t('f.permissionDefault') },
                  { value: 'read-only', label: t('perm.read-only') },
                  { value: 'workspace-write', label: t('perm.workspace-write') },
                  { value: 'danger-full-access', label: t('perm.danger-full-access') },
                ],
              }),
              createElement('div', { className: `dsh-cb-fieldhint ${permHigh ? 'dsh-cb-fieldhint-warn' : ''}` },
                permHigh ? t('f.permHintHigh') : '',
              ),
            ),
            createElement('div', { className: 'dsh-cb-field' },
              createElement('span', { className: 'dsh-cb-label' }, t('f.push')),
              createElement(Select, { value: pushKey, onChange: setPushKey, disabled: archived, options: pushOptions(props.meta) }),
              createElement('div', { className: 'dsh-cb-fieldhint' }, t('f.pushHint')),
            ),
          ),
        ),

        // ── 会话 ──
        createElement(Section, { title: t('f.sessionSection') },
          createElement(
            'div',
            { className: 'dsh-cb-switchrow' },
            createElement(
              'div',
              { className: 'dsh-cb-switchrow-main' },
              createElement('div', { className: 'dsh-cb-switchrow-title' }, t('f.reuseSession')),
              createElement('div', { className: 'dsh-cb-switchrow-desc' }, t('f.reuseHint')),
            ),
            createElement(Switch, { on: reuseSession, disabled: archived, onChange: setReuseSession }),
          ),
          createElement(
            'div',
            { className: 'dsh-cb-switchrow' },
            createElement(
              'div',
              { className: 'dsh-cb-switchrow-main' },
              createElement('div', { className: 'dsh-cb-switchrow-title' }, t('f.enableAfterSave')),
              createElement('div', { className: 'dsh-cb-switchrow-desc' }, t('f.enableHint')),
            ),
            createElement(Switch, { on: enabled, disabled: archived, onChange: setEnabled }),
          ),
        ),

        // ── 标签 ──
        createElement(Section, { title: t('f.tags') },
          tags.length > 0
            ? createElement(
                'div',
                { className: 'dsh-cb-tagchips' },
                tags.map((tag) =>
                  createElement(
                    'span',
                    { className: 'dsh-cb-tagchip', key: tag.name },
                    createElement(TagBadge, { tag }),
                    archived ? null : createElement('button', {
                      type: 'button',
                      className: 'dsh-cb-tagchip-x',
                      title: t('f.tagRemove'),
                      onClick: () => setTags((prev) => prev.filter((x) => x.name !== tag.name)),
                    }, '×'),
                  ),
                ),
              )
            : null,
          !archived && tags.length < 8
            ? createElement(
                'div',
                { className: 'dsh-cb-tagaddrow' },
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
                createElement(Btn2, { kind: 'outline', label: t('f.tagAdd'), disabled: tagDraft.name.trim() === '', onClick: addTag }),
              )
            : null,
        ),

        // ── 任务图片 ──
        !archived
          ? createElement(Section, { title: t('f.images'), badge: createElement('span', { className: 'dsh-cb-sec-badge' }, '≤ 4') },
              createElement('div', { className: 'dsh-cb-sec-hint' }, t('f.imagesHint')),
              images === undefined && existingImageCount > 0
                ? createElement('div', { className: 'dsh-cb-sec-hint' }, t('f.existingImages').replace('{n}', String(existingImageCount)))
                : null,
              createElement('input', {
                ref: imageFileRef,
                type: 'file',
                accept: 'image/png,image/jpeg,image/webp,image/gif',
                multiple: true,
                style: { display: 'none' },
                onChange: (e: { target?: { files?: FileList | null; value?: string } }) => {
                  const files = Array.from(e?.target?.files ?? []);
                  if (e.target) e.target.value = '';
                  addImageFiles(files);
                },
              }),
              (images ?? []).length < 4
                ? createElement('div', {
                    className: 'dsh-cb-drop',
                    onClick: () => imageFileRef.current?.click(),
                    onDragOver: (e: { preventDefault: () => void }) => e.preventDefault(),
                    onDrop: (e: { preventDefault: () => void; dataTransfer?: { files?: FileList | null } }) => {
                      e.preventDefault();
                      addImageFiles(Array.from(e.dataTransfer?.files ?? []));
                    },
                  },
                    createElement(IconUpload, { size: 20 }),
                    createElement('div', { className: 'dsh-cb-drop-main' }, t('f.dropUpload')),
                    createElement('div', { className: 'dsh-cb-drop-sub' }, t('f.dropFormats')),
                  )
                : null,
              (images ?? []).length > 0
                ? createElement(
                    'div',
                    { className: 'dsh-cb-imgprev' },
                    (images ?? []).map((img, idx) =>
                      createElement(
                        'span',
                        { className: 'dsh-cb-imgcell', key: idx },
                        createElement('img', {
                          src: 'data:' + img.mediaType + ';base64,' + img.data,
                          alt: img.name ?? String(idx),
                        }),
                        createElement('button', {
                          type: 'button',
                          className: 'dsh-cb-imgcell-x',
                          title: t('f.tagRemove'),
                          onClick: () => setImages((prev) => (prev ?? []).filter((_, i) => i !== idx)),
                        }, '×'),
                      ),
                    ),
                    createElement(Btn2, { kind: 'ghost', label: t('f.clearImages'), disabled: busy, onClick: () => setImages([]) }),
                  )
                : null,
            )
          : null,

        // ── 会话徽标 ──
        !archived
          ? createElement(Section, { title: t('f.badge') },
              createElement('div', { className: 'dsh-cb-sec-hint' }, t('f.badgeHint')),
              createElement(
                'div',
                { className: 'dsh-cb-badgerow' },
                // 预览（所见即所得）
                createElement('span', { className: 'dsh-cb-badge-preview' }, createElement(BadgePreview, { badge })),
                // emoji 自由输入（清空=恢复默认）
                createElement('input', {
                  className: 'dsh-cb-badge-input',
                  value: badge !== null && badge.kind === 'emoji' ? badge.value : '',
                  placeholder: '😀',
                  maxLength: 8,
                  onChange: (e: { target?: { value?: string } }) => {
                    const v = e?.target?.value ?? '';
                    setBadge(v.trim() === '' ? null : { kind: 'emoji', value: v });
                  },
                }),
                // 预设图标
                createElement(
                  'select',
                  {
                    className: 'dsh-cb-badge-select',
                    value: badge !== null && badge.kind === 'icon' ? badge.value : '',
                    onChange: (e: { target: { value: string } }) => {
                      const v = e.target.value;
                      if (v === '') setBadge(null);
                      else setBadge({ kind: 'icon', value: v, color: badge !== null && badge.kind === 'icon' ? badge.color : undefined });
                    },
                  },
                  createElement('option', { value: '' }, t('f.badgeDefault')),
                  createElement(
                    'optgroup',
                    { label: t('f.badgePreset') },
                    Object.keys(BADGE_ICONS).map((k) => createElement('option', { key: k, value: k }, k)),
                  ),
                  createElement(
                    'optgroup',
                    { label: 'dsh-im' },
                    Object.keys(IM_BADGE_ICONS).map((k) => createElement('option', { key: k, value: k }, k)),
                  ),
                ),
                // 色板（点色点=图标模式+用色；图标未选时默认 clock；选中态双环）
                createElement(
                  'span',
                  { className: 'dsh-cb-swatches' },
                  ...Object.entries(BADGE_COLORS).map(([key, color]) =>
                    createElement('button', {
                      key,
                      type: 'button',
                      className: 'dsh-cb-swatch',
                      title: key,
                      'data-on': badge !== null && badge.kind === 'icon' && badge.color === key ? '1' : '0',
                      style: { background: color, color },
                      onClick: () =>
                        setBadge({ kind: 'icon', value: badge !== null && badge.kind === 'icon' ? badge.value : 'clock', color: key }),
                    }),
                  ),
                  createElement('button', {
                    key: '__custom',
                    type: 'button',
                    className: 'dsh-cb-swatch dsh-cb-swatch-custom',
                    title: t('f.badgeCustom'),
                    'data-on': badge !== null && badge.kind === 'icon' && badge.color !== undefined && badge.color in BADGE_COLORS ? '0' : badge !== null && badge.kind === 'icon' && badge.color !== undefined ? '1' : '0',
                    style: { color: badge !== null && badge.kind === 'icon' && badge.color !== undefined && !(badge.color in BADGE_COLORS) ? badge.color : undefined },
                    onClick: () => badgeColorRef.current?.click(),
                  }),
                  createElement('input', {
                    ref: badgeColorRef,
                    type: 'color',
                    style: { display: 'none' },
                    onChange: (e: { target?: { value?: string } }) => {
                      const v = e?.target?.value;
                      if (!v) return;
                      setBadge({ kind: 'icon', value: badge !== null && badge.kind === 'icon' ? badge.value : 'clock', color: v.toLowerCase() });
                    },
                  }),
                ),
                // 隐藏 file input + 上传/清除按钮
                createElement('input', {
                  ref: badgeFileRef,
                  type: 'file',
                  accept: 'image/png,image/svg+xml,image/webp,image/x-icon,.ico',
                  style: { display: 'none' },
                  onChange: (e: { target?: { files?: FileList | null; value?: string } }) => {
                    const file = (e?.target?.files ?? [])[0];
                    if (e.target) e.target.value = '';
                    if (!file) return;
                    if (file.size > BADGE_IMAGE_MAX_BYTES) {
                      setErr(t('f.badgeTooBig'));
                      return;
                    }
                    const mt =
                      file.type !== '' && (BADGE_IMAGE_TYPES as readonly string[]).includes(file.type)
                        ? file.type
                        : file.name.toLowerCase().endsWith('.ico')
                          ? 'image/x-icon'
                          : '';
                    if (mt === '') {
                      setErr(t('f.badgeBadType'));
                      return;
                    }
                    void (async () => {
                      try {
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                          const fr = new FileReader();
                          fr.onload = () => resolve(String(fr.result));
                          fr.onerror = () => reject(fr.error);
                          fr.readAsDataURL(file);
                        });
                        setBadge({ kind: 'image', mediaType: mt, data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
                        setErr(null);
                      } catch {
                        setErr(t('f.badgeReadFail'));
                      }
                    })();
                  },
                }),
                createElement('button', { type: 'button', className: 'dsh-cb-badge-btn', onClick: () => badgeFileRef.current?.click() }, t('f.badgeUpload')),
                badge !== null ? createElement('button', { type: 'button', className: 'dsh-cb-badge-btn', onClick: () => setBadge(null) }, t('f.badgeClear')) : null,
              ),
            )
          : null,

        // 修改将重新武装确认门（橙卡）
        task && task.executions.length > 0 && task.needsConfirm && task.confirmed
          ? createElement(
              'div',
              { className: 'dsh-cb-gatecard dsh-cb-gatecard-warn dsh-cb-gatecard-flat' },
              createElement('span', { className: 'dsh-cb-gatecard-icon' }, createElement(IconShieldAlert, { size: 17 })),
              createElement(
                'div',
                { className: 'dsh-cb-gatecard-main' },
                createElement('div', { className: 'dsh-cb-gatecard-title' }, t('dl.rearmTitle')),
                createElement('div', { className: 'dsh-cb-gatecard-body' }, t('dl.rearmBody')),
              ),
            )
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

        // ── 操作按钮行 ──
        createElement(
          'div',
          { className: 'dsh-cb-actionrow' },
          archived
            ? createElement(Btn2, {
                kind: 'primary',
                icon: createElement(IconCheck, { size: 14 }),
                label: t('act.restore'),
                disabled: busy,
                onClick: () =>
                  void action(() => props.rpc('cron-board/task-restore', { id: task!.id }), t('dl.restored')).then(
                    () => props.onClose(),
                  ),
              })
            : createElement(Btn2, { kind: 'primary', icon: createElement(IconSave, { size: 14 }), label: t('act.save'), disabled: busy || !cronOk, onClick: () => void save() }),
          task && !archived
            ? createElement(Btn2, {
                kind: 'outline',
                icon: createElement(IconPlay, { size: 13 }),
                label: t('act.run'),
                disabled: busy || task.running,
                onClick: () => void action(() => props.rpc('cron-board/task-run', { id: task.id }), t('dl.runQueued')),
              })
            : null,
          task && !archived
            ? createElement(Btn2, {
                kind: 'outline',
                icon: createElement(IconSend, { size: 13 }),
                label: t('act.testPush'),
                disabled: busy,
                onClick: () => void action(() => props.rpc('cron-board/push-test', { id: task.id }), t('dl.pushTested')),
              })
            : null,
          task && !archived
            ? createElement(Btn2, {
                kind: 'outline',
                icon: createElement(IconCheck, { size: 13 }),
                label: task.enabled ? t('act.disable') : t('act.enable'),
                disabled: busy,
                onClick: () => {
                  const next = !task.enabled;
                  void action(
                    () => props.rpc('cron-board/task-toggle', { id: task.id, enabled: next }),
                    next ? t('act.enable') : t('act.disable'),
                    () => setEnabled(next),
                  );
                },
              })
            : null,
          task && !archived
            ? createElement(Btn2, {
                kind: 'outline',
                icon: createElement(IconArchive, { size: 13 }),
                label: t('act.archive'),
                disabled: busy || task.running,
                onClick: () =>
                  void action(() => props.rpc('cron-board/task-archive', { id: task.id }), t('act.archive')).then(() =>
                    props.onClose(),
                  ),
              })
            : null,
          createElement('div', { className: 'dsh-cb-row-right' }),
          task
            ? createElement(Btn2, {
                kind: 'danger-text',
                icon: createElement(IconTrash, { size: 13 }),
                label: t('act.delete'),
                disabled: busy || task.running,
                onClick: () => {
                  if (typeof window !== 'undefined' && !window.confirm(t('dl.deleteConfirm'))) return;
                  void action(() => props.rpc('cron-board/task-delete', { id: task.id }), t('act.close')).then(() =>
                    props.onClose(),
                  );
                },
              })
            : null,
        ),

        // ── 最近执行 ──
        task
          ? createElement(Section, { title: t('col.recent'), badge: createElement('span', { className: 'dsh-cb-sec-badge dsh-cb-sec-badge-dim' }, String(task.executions.length)) },
              task.executions.length === 0
                ? createElement('div', { className: 'dsh-cb-sec-hint' }, t('board.feedEmpty'))
                : createElement(
                    'div',
                    { className: 'dsh-cb-exec2-list' },
                    task.executions.map((exec) =>
                      createElement(
                        'div',
                        { className: 'dsh-cb-exec2', key: exec.id },
                        createElement('span', {
                          className: `dsh-cb-dot ${exec.status === 'running' ? 'dsh-cb-dot-run' : exec.status === 'success' ? 'dsh-cb-dot-ok' : exec.status === 'failed' ? 'dsh-cb-dot-err' : 'dsh-cb-dot-warn'}`,
                        }),
                        createElement(
                          'div',
                          { className: 'dsh-cb-exec2-main' },
                          createElement(
                            'div',
                            { className: 'dsh-cb-exec2-head' },
                            createElement('strong', { className: 'dsh-cb-exec2-status' }, t(`st.${exec.status}`)),
                            createElement('span', { className: 'dsh-cb-exec2-tag' }, t(`exec.trigger.${exec.trigger}`)),
                            exec.push
                              ? createElement('span', { className: `dsh-cb-exec2-push ${exec.push.state === 'sent' ? 'dsh-cb-exec2-push-ok' : exec.push.state === 'failed' ? 'dsh-cb-exec2-push-bad' : ''}` },
                                  `· ${t('exec.push')} · ${t(`push.${exec.push.state}`)}`,
                                )
                              : null,
                          ),
                          createElement(
                            'div',
                            { className: 'dsh-cb-exec2-meta' },
                            fmtAgo(exec.startedAt),
                            exec.durationMs !== undefined ? ` · ${t('exec.duration')} ${fmtDur(exec.durationMs)}` : '',
                            exec.exitReason !== undefined ? ` · ${exec.exitReason}` : '',
                          ),
                        ),
                        createElement(
                          'div',
                          { className: 'dsh-cb-exec2-actions' },
                          exec.push?.state === 'failed'
                            ? createElement('button', {
                                type: 'button',
                                className: 'dsh-cb-linkbtn',
                                disabled: busy,
                                onClick: () =>
                                  void action(
                                    () => props.rpc('cron-board/push-retry', { taskId: task.id, execId: exec.id }),
                                    t('dl.pushTested'),
                                  ),
                              }, t('act.retryPush'))
                            : null,
                          exec.sessionId !== '' && props.sessions?.open && exec.status !== 'running'
                            ? createElement('button', {
                                type: 'button',
                                className: 'dsh-cb-linkbtn',
                                title: exec.sessionId,
                                onClick: () => props.sessions?.open?.(exec.sessionId),
                              }, t('board.openSession'))
                            : null,
                          exec.resultPath !== undefined && exec.status !== 'running'
                            ? createElement('button', {
                                type: 'button',
                                className: 'dsh-cb-linkbtn dsh-cb-linkbtn-accent',
                                disabled: busy,
                                onClick: () => void viewResult(exec.id),
                              }, `${t('act.viewResult')} ›`)
                            : null,
                        ),
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

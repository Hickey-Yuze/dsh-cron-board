/**
 * 主题令牌（--dsh-cb-* 两层令牌机制）+ 样式表注入。
 * 浅色主题（跟随宿主） + 统计概览 + 项目分组布局。
 */

const STYLE_ID = 'dsh-cron-board-style';

const CSS = `
/* 隐藏 sidebar.panellist 渲染的旧入口（UI 改由 DOM 注入按钮提供） */
.dsh-cb-icon-btn {
  display: none !important;
}

/* 侧栏入口大按钮（对齐「新会话」样式） */
.dsh-cron-board-sidebar-btn {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  margin: 4px auto 8px !important;
  padding: 11px 16px !important;
  border: 1px solid rgba(20, 20, 30, 0.10) !important;
  border-radius: 10px !important;
  background: #ffffff !important;
  color: #1c1c22 !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
  font-family: inherit !important;
  box-shadow: 0 1px 2px rgba(20, 20, 30, 0.04) !important;
}

.dsh-cron-board-sidebar-btn:hover {
  background: #f6f6f8 !important;
  border-color: rgba(20, 20, 30, 0.18) !important;
}

.dsh-cron-board-sidebar-btn:active {
  transform: scale(0.985) !important;
}

.dsh-cron-board-sidebar-icon {
  display: inline-flex !important;
  align-items: center !important;
  line-height: 1 !important;
}

.dsh-cron-board-sidebar-label {
  font-size: 14px !important;
  display: inline-block !important;
}

.dsh-cb-root, .dsh-cb-modal, .dsh-cb-icon-btn, .dsh-cb-pop {
  --dsh-cb-bg: var(--dsw-alias-bg-base, #fafafa);
  --dsh-cb-bg-2: var(--dsw-alias-bg-layer-2, #f6f6f8);
  --dsh-cb-bg-3: var(--dsw-alias-bg-layer-3, #eef0f4);
  --dsh-cb-card: var(--dsw-alias-bg-layer-1, #ffffff);
  --dsh-cb-card-2: var(--dsw-alias-bg-layer-2, #f6f6f8);
  --dsh-cb-card-3: var(--dsw-alias-bg-layer-3, #eef0f4);
  --dsh-cb-border: var(--dsw-alias-border-l1, rgba(20, 20, 30, 0.08));
  --dsh-cb-border-2: var(--dsw-alias-border-l2, rgba(20, 20, 30, 0.16));
  --dsh-cb-text: var(--dsw-alias-label-primary, #1c1c22);
  --dsh-cb-dim: var(--dsw-alias-label-secondary, #6d6d7a);
  --dsh-cb-accent: var(--dsw-alias-brand-primary, #4b6bfb);
  --dsh-cb-accent-light: rgba(75, 107, 251, 0.2);
  --dsh-cb-ok: var(--dsw-alias-state-success-primary, #10b981);
  --dsh-cb-ok-bg: rgba(16, 185, 129, 0.1);
  --dsh-cb-warn: var(--dsw-alias-state-warn-primary, #f59e0b);
  --dsh-cb-warn-bg: rgba(245, 158, 11, 0.1);
  --dsh-cb-err: var(--dsw-alias-state-error-primary, #ef4444);
  --dsh-cb-err-bg: rgba(239, 68, 68, 0.1);
  --dsh-cb-hover: rgba(127, 127, 140, 0.08);
  --dsh-cb-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --dsh-cb-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --dsh-cb-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  --dsh-cb-shadow-xl: 0 12px 32px rgba(0, 0, 0, 0.16);
  --dsh-cb-radius-sm: 8px;
  --dsh-cb-radius-md: 12px;
  --dsh-cb-radius-lg: 16px;
  --dsh-cb-radius-xl: 20px;
}

/* ── 侧栏入口图标 ── */
.dsh-cb-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; margin: 4px auto; padding: 0;
  border: none; border-radius: var(--dsh-cb-radius-md); background: transparent; cursor: pointer;
  color: var(--dsh-cb-dim);
  transition: all 0.2s ease;
}
.dsh-cb-icon-btn:hover { background: var(--dsh-cb-hover); color: var(--dsh-cb-text); }
.dsh-cb-icon-btn.dsh-cb-icon-active { background: var(--dsh-cb-accent); color: #fff; box-shadow: var(--dsh-cb-shadow-md); }
.dsh-cb-icon-btn svg { width: 22px; height: 22px; display: block; }

/* ── 根容器 ─ */
.dsh-cb-root { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--dsh-cb-text); background: var(--dsh-cb-bg); }

/* ── 统计卡片行 ── */
.dsh-cb-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 16px 20px; flex: none; }
.dsh-cb-stat-card {
  background: var(--dsh-cb-card);
  border: 1px solid var(--dsh-cb-border);
  border-radius: var(--dsh-cb-radius-md);
  padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
  position: relative; overflow: hidden;
  transition: all 0.2s ease;
  cursor: default;
}
.dsh-cb-stat-card[style*="cursor: pointer"]:hover {
  border-color: var(--dsh-cb-accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(75, 107, 251, 0.15);
}
.dsh-cb-stat-card[style*="cursor: pointer"]:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(75, 107, 251, 0.1);
}
.dsh-cb-stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at top right, rgba(75, 107, 251, 0.1), transparent 70%);
  opacity: 0.5;
}
.dsh-cb-stat-head { display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
.dsh-cb-stat-label { font-size: 12px; color: var(--dsh-cb-dim); font-weight: 500; }
.dsh-cb-stat-icon { font-size: 20px; opacity: 0.8; }
.dsh-cb-stat-body { display: flex; align-items: baseline; gap: 6px; position: relative; z-index: 1; }
.dsh-cb-stat-count { font-size: 32px; font-weight: 700; color: var(--dsh-cb-text); line-height: 1; }
.dsh-cb-stat-unit { font-size: 12px; color: var(--dsh-cb-dim); }
.dsh-cb-stat-foot { display: flex; align-items: center; gap: 6px; font-size: 11px; position: relative; z-index: 1; }
.dsh-cb-stat-change-label { color: var(--dsh-cb-dim); }
.dsh-cb-stat-change { font-weight: 600; }
.dsh-cb-change-ok { color: var(--dsh-cb-ok); }
.dsh-cb-change-err { color: var(--dsh-cb-err); }

.dsh-cb-stat-ok { border-color: rgba(16, 185, 129, 0.3); }
.dsh-cb-stat-ok::before { background: radial-gradient(circle at top right, rgba(16, 185, 129, 0.15), transparent 70%); }
.dsh-cb-stat-warn { border-color: rgba(245, 158, 11, 0.3); }
.dsh-cb-stat-warn::before { background: radial-gradient(circle at top right, rgba(245, 158, 11, 0.15), transparent 70%); }
.dsh-cb-stat-err { border-color: rgba(239, 68, 68, 0.3); }
.dsh-cb-stat-err::before { background: radial-gradient(circle at top right, rgba(239, 68, 68, 0.15), transparent 70%); }
.dsh-cb-stat-accent { border-color: rgba(75, 107, 251, 0.3); }
.dsh-cb-stat-accent::before { background: radial-gradient(circle at top right, rgba(75, 107, 251, 0.15), transparent 70%); }

/* ── 标题栏 ── */
.dsh-cb-header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--dsh-cb-border); flex: none; }
.dsh-cb-title { font-size: 16px; font-weight: 700; margin: 0; letter-spacing: -0.02em; white-space: nowrap; }
.dsh-cb-sub { font-size: 12px; color: var(--dsh-cb-dim); font-weight: 500; }
.dsh-cb-spacer { flex: 1; }
.dsh-cb-search {
  width: 200px; padding: 6px 12px; font-size: 13px; color: var(--dsh-cb-text);
  background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: var(--dsh-cb-radius-sm); outline: none;
  transition: all 0.2s ease;
}
.dsh-cb-search:focus { border-color: var(--dsh-cb-accent); box-shadow: 0 0 0 3px var(--dsh-cb-accent-light); }
.dsh-cb-search::placeholder { color: var(--dsh-cb-dim); }

/* ── 项目分组 ── */
.dsh-cb-projects { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.dsh-cb-project-group {
  background: var(--dsh-cb-card);
  border: 1px solid var(--dsh-cb-border);
  border-radius: var(--dsh-cb-radius-md);
  overflow: hidden;
}
.dsh-cb-project-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.dsh-cb-project-head:hover { background: var(--dsh-cb-hover); }
.dsh-cb-project-title-row { display: flex; align-items: center; gap: 10px; }
.dsh-cb-project-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.dsh-cb-project-name { font-size: 14px; font-weight: 650; color: var(--dsh-cb-text); }
.dsh-cb-project-count { font-size: 11px; color: var(--dsh-cb-dim); background: var(--dsh-cb-card-3); padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.dsh-cb-chevron { font-size: 10px; color: var(--dsh-cb-dim); transition: transform 0.2s ease; }
.dsh-cb-chevron-open { transform: rotate(180deg); }

.dsh-cb-project-body { padding: 8px 16px 12px; display: flex; flex-direction: column; gap: 8px; }
.dsh-cb-empty-task { padding: 16px; text-align: center; font-size: 12px; color: var(--dsh-cb-dim); }

/* ── 任务项 ── */
.dsh-cb-task-item {
  padding: 10px 12px;
  background: var(--dsh-cb-card-2);
  border: 1px solid var(--dsh-cb-border);
  border-radius: var(--dsh-cb-radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-cb-task-item:hover { background: var(--dsh-cb-card-3); border-color: var(--dsh-cb-border-2); }
.dsh-cb-task-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.dsh-cb-task-bullet { width: 6px; height: 6px; border-radius: 50%; background: var(--dsh-cb-dim); flex: none; }
.dsh-cb-task-title { font-size: 13px; font-weight: 600; color: var(--dsh-cb-text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-cb-task-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.dsh-cb-task-time { color: var(--dsh-cb-dim); }
.dsh-cb-task-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.dsh-cb-task-status { color: var(--dsh-cb-dim); }
.dsh-cb-row-action { border: none; background: var(--dsh-cb-card-2); color: var(--dsh-cb-text); font-size: 12px; font-weight: 500; line-height: 1; padding: 6px 14px; border-radius: 999px; cursor: pointer; transition: background .15s, color .15s; }
.dsh-cb-row-action:hover { background: var(--dsh-cb-accent); color: #fff; }
.dsh-cb-row-action-danger { color: #d64545; background: rgba(214,69,69,.08); }
.dsh-cb-row-action-danger:hover { background: #d64545; color: #fff; }

/* ── 日志项 ── */
.dsh-cb-log-item {
  padding: 10px 12px;
  background: var(--dsh-cb-card-2);
  border: 1px solid var(--dsh-cb-border);
  border-radius: var(--dsh-cb-radius-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-cb-log-head { display: flex; align-items: center; justify-content: space-between; }
.dsh-cb-log-task { font-size: 13px; font-weight: 600; color: var(--dsh-cb-text); }
.dsh-cb-log-meta { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--dsh-cb-dim); }

/* ── 徽章 ─ */
.dsh-cb-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--dsh-cb-border); color: var(--dsh-cb-dim); background: var(--dsh-cb-card-2); font-weight: 600; white-space: nowrap; }
.dsh-cb-badge.dsh-cb-ok { color: var(--dsh-cb-ok); border-color: var(--dsh-cb-ok); background: var(--dsh-cb-ok-bg); }
.dsh-cb-badge.dsh-cb-warn { color: var(--dsh-cb-warn); border-color: var(--dsh-cb-warn); background: var(--dsh-cb-warn-bg); }
.dsh-cb-badge.dsh-cb-err { color: var(--dsh-cb-err); border-color: var(--dsh-cb-err); background: var(--dsh-cb-err-bg); }
.dsh-cb-badge.dsh-cb-accent { color: var(--dsh-cb-accent); border-color: var(--dsh-cb-accent); background: rgba(75, 107, 251, 0.15); }

/* ── 按钮 ── */
.dsh-cb-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; font-size: 13px; border-radius: var(--dsh-cb-radius-sm); border: 1px solid var(--dsh-cb-border-2); background: var(--dsh-cb-card); color: var(--dsh-cb-text); cursor: pointer; font: inherit; font-weight: 500; transition: all 0.15s ease; white-space: nowrap; }
.dsh-cb-btn:hover:not(:disabled):not(.dsh-cb-primary):not(.dsh-cb-danger):not(.dsh-cb-ghost) { background: var(--dsh-cb-hover); }
.dsh-cb-btn:disabled { opacity: .4; cursor: not-allowed; }
.dsh-cb-btn.dsh-cb-primary { background: var(--dsh-cb-card); border-color: var(--dsh-cb-border); color: var(--dsh-cb-text); box-shadow: var(--dsh-cb-shadow-sm); border-radius: 999px; padding: 10px 20px; font-size: 14px; }
.dsh-cb-btn.dsh-cb-primary:hover:not(:disabled) { background: var(--dsh-cb-hover); border-color: var(--dsh-cb-accent); }
.dsh-cb-btn.dsh-cb-danger { color: var(--dsh-cb-err); border-color: var(--dsh-cb-err); }
.dsh-cb-btn.dsh-cb-danger:hover:not(:disabled) { background: var(--dsh-cb-err-bg); }
.dsh-cb-btn.dsh-cb-ghost { border-color: transparent; background: transparent; color: var(--dsh-cb-dim); }
.dsh-cb-btn.dsh-cb-ghost:hover:not(:disabled) { background: var(--dsh-cb-hover); color: var(--dsh-cb-text); }

/* ── 详情弹层 ── */
.dsh-cb-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100000; pointer-events: auto; }
.dsh-cb-modal { width: min(720px, calc(100vw - 48px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column; overflow: hidden; background: var(--dsh-cb-card); border: 1px solid var(--dsh-cb-border); border-radius: var(--dsh-cb-radius-xl); box-shadow: var(--dsh-cb-shadow-xl); color: var(--dsh-cb-text); pointer-events: auto; }
.dsh-cb-modal-head { display: flex; align-items: center; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--dsh-cb-border); flex-shrink: 0; }
.dsh-cb-modal-body { padding: 18px 22px 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; min-height: 0; }
.dsh-cb-field { display: flex; flex-direction: column; gap: 6px; }
.dsh-cb-label { font-size: 12px; font-weight: 700; color: var(--dsh-cb-dim); text-transform: uppercase; letter-spacing: 0.05em; }
.dsh-cb-input, .dsh-cb-select, .dsh-cb-textarea {
  font: inherit; font-size: 13px; color: var(--dsh-cb-text);
  background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: var(--dsh-cb-radius-sm); padding: 9px 12px; outline: none; width: 100%;
  box-sizing: border-box;
  transition: all 0.2s ease;
}
.dsh-cb-input:focus, .dsh-cb-select:focus, .dsh-cb-textarea:focus { border-color: var(--dsh-cb-accent); box-shadow: 0 0 0 3px var(--dsh-cb-accent-light); }
.dsh-cb-textarea { resize: vertical; min-height: 100px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.dsh-cb-hint { font-size: 11px; color: var(--dsh-cb-dim); }
.dsh-cb-errbox { font-size: 12px; color: var(--dsh-cb-err); background: var(--dsh-cb-err-bg); border: 1px solid var(--dsh-cb-err); border-radius: var(--dsh-cb-radius-sm); padding: 10px 12px; }
.dsh-cb-notebox { font-size: 12px; color: var(--dsh-cb-text); background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-left: 3px solid var(--dsh-cb-warn); border-radius: var(--dsh-cb-radius-sm); padding: 10px 12px; }
.dsh-cb-gatebox { border: 1px solid var(--dsh-cb-warn); border-radius: var(--dsh-cb-radius-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; background: var(--dsh-cb-warn-bg); }
.dsh-cb-gatebox.dsh-cb-gate-ok { border-color: var(--dsh-cb-ok); background: var(--dsh-cb-ok-bg); }
.dsh-cb-row { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.dsh-cb-row-right { margin-left: auto; }

.dsh-cb-exec { border: 1px solid var(--dsh-cb-border); border-radius: var(--dsh-cb-radius-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; background: var(--dsh-cb-card-2); }
.dsh-cb-exec-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dsh-cb-exec-meta { color: var(--dsh-cb-dim); font-size: 11px; display: flex; gap: 12px; flex-wrap: wrap; }

.dsh-cb-result { margin: 0; padding: 12px 14px; background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: var(--dsh-cb-radius-md); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto; }

/* ── Cron 五字段分列输入 ─ */
.dsh-cb-crongrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.dsh-cb-croncell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

/* ── 任务标签 ── */
.dsh-cb-tagbadge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; line-height: 16px; white-space: nowrap; }
.dsh-cb-filterrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-cb-chip { border: 1px solid var(--dsh-cb-border); background: transparent; color: var(--dsh-cb-dim); border-radius: 999px; padding: 3px 12px; font-size: 11px; cursor: pointer; font-weight: 500; transition: all 0.15s ease; }
.dsh-cb-chip:hover { background: var(--dsh-cb-hover); color: var(--dsh-cb-text); }
.dsh-cb-chip-on { background: var(--dsh-cb-accent); color: #fff; border-color: var(--dsh-cb-accent); }
.dsh-cb-select-sm { max-width: 180px; }

/* ── 标签编辑器 ── */
.dsh-cb-tagrow { display: flex; flex-direction: column; gap: 8px; }
.dsh-cb-tagitem { display: flex; align-items: center; gap: 8px; }
.dsh-cb-tagitem .dsh-cb-input { flex: 1; min-width: 0; }

/* ── 复用开关行 ── */
.dsh-cb-checkrow { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.dsh-cb-checkrow input[type="checkbox"] { accent-color: var(--dsh-cb-accent); margin: 0; width: 16px; height: 16px; }

/* ── 归档视图 ── */
.dsh-cb-archbar { display: flex; align-items: center; gap: 10px; }
.dsh-cb-archcard { opacity: 0.7; }

/* ─ 设置页 ── */
.dsh-cb-set { display: flex; flex-direction: column; gap: 16px; max-width: 640px; color: var(--dsh-cb-text); font-size: 13px; }
.dsh-cb-set h3 { font-size: 15px; margin: 0; font-weight: 700; }
.dsh-cb-setbox { border: 1px solid var(--dsh-cb-border); border-radius: var(--dsh-cb-radius-lg); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; background: var(--dsh-cb-card); box-shadow: var(--dsh-cb-shadow-sm); }
.dsh-cb-setrow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.dsh-cb-setlist { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; color: var(--dsh-cb-dim); font-size: 12px; }

/* ─ 空状态 ── */
.dsh-cb-empty { padding: 40px; text-align: center; color: var(--dsh-cb-dim); font-size: 14px; }
`;

export function ensureThemeStyle(): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (el) return;
  el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

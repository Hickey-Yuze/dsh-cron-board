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
.dsh-cron-board-sidebar-btn.dsh-cb-collapsed {
  padding: 0 !important;
  gap: 0 !important;
  font-size: 0 !important;
  aspect-ratio: 1 / 1 !important;
}
.dsh-cron-board-sidebar-btn.dsh-cb-collapsed .dsh-cron-board-sidebar-label {
  display: none !important;
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

/* 全插件固定亮色：不跟随宿主主题（用户宿主 body 带系统深色属性但主观使用
 * 亮色；此前 alias 传导在宿主暗色 CSS 下部分缺失导致白底输入框混搭）。
 * 字面量锚定，specificity 与上方变量块同组、后定义者胜。 */
.dsh-cb-root, .dsh-cb-modal, .dsh-cb-icon-btn, .dsh-cb-pop {
  --dsh-cb-bg: #fafafa;
  --dsh-cb-bg-2: #f6f6f8;
  --dsh-cb-bg-3: #eef0f4;
  --dsh-cb-card: #ffffff;
  --dsh-cb-card-2: #f6f6f8;
  --dsh-cb-card-3: #eef0f4;
  --dsh-cb-border: rgba(20, 20, 30, 0.08);
  --dsh-cb-border-2: rgba(20, 20, 30, 0.16);
  --dsh-cb-text: #1c1c22;
  --dsh-cb-dim: #6d6d7a;
  --dsh-cb-accent: #4b6bfb;
  --dsh-cb-accent-light: rgba(75, 107, 251, 0.2);
  --dsh-cb-ok: #10b981;
  --dsh-cb-ok-bg: rgba(16, 185, 129, 0.1);
  --dsh-cb-warn: #f59e0b;
  --dsh-cb-warn-bg: rgba(245, 158, 11, 0.1);
  --dsh-cb-err: #ef4444;
  --dsh-cb-err-bg: rgba(239, 68, 68, 0.1);
  --dsh-cb-hover: rgba(127, 127, 140, 0.08);
  --dsh-cb-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --dsh-cb-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --dsh-cb-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  --dsh-cb-shadow-xl: 0 12px 32px rgba(0, 0, 0, 0.16);
}

/* 终杀加固：弹层关键面直接字面量 !important——对抗 renderer 中可能残留的
 * 任何旧版样式块（迭代期间暗色自持块 specificity 0-2-1 高于亮色锚定 0-1-0，
 * 双 style 并存时旧块会赢）。!important 压过一切非 !important 规则。 */
.dsh-cb-modal {
  background: #ffffff !important;
  color: #1c1c22 !important;
  border-color: rgba(20, 20, 30, 0.08) !important;
}
.dsh-cb-modal-head { border-bottom-color: rgba(20, 20, 30, 0.08) !important; }
.dsh-cb-modal .dsh-cb-title { color: #1c1c22 !important; }
.dsh-cb-modal .dsh-cb-label { color: #6d6d7a !important; }
.dsh-cb-modal .dsh-cb-hint { color: #6d6d7a !important; }
.dsh-cb-modal .dsh-cb-input,
.dsh-cb-modal .dsh-cb-select,
.dsh-cb-modal .dsh-cb-textarea {
  background: #f6f6f8 !important;
  color: #1c1c22 !important;
  border-color: rgba(20, 20, 30, 0.16) !important;
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
.dsh-cb-task-paused { opacity: .55; }
.dsh-cb-task-paused .dsh-cb-task-title { text-decoration: line-through; text-decoration-color: rgba(20,20,30,.25); }
.dsh-cb-row-action { border: 1px solid var(--dsh-cb-border-2); background: var(--dsh-cb-card); color: var(--dsh-cb-text); font-size: 12px; font-weight: 500; line-height: 1; padding: 6px 14px; border-radius: 999px; cursor: pointer; transition: background .15s, color .15s, border-color .15s; box-shadow: 0 1px 2px rgba(20,20,30,.05); }
.dsh-cb-row-action:hover { background: var(--dsh-cb-accent); border-color: var(--dsh-cb-accent); color: #fff; }
.dsh-cb-row-action:active { transform: scale(.96); }
.dsh-cb-row-action-danger { color: #d64545; background: rgba(214,69,69,.06); border-color: rgba(214,69,69,.35); }
.dsh-cb-row-action-danger:hover { background: #d64545; border-color: #d64545; color: #fff; }

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

/* ── 任务徽标设置 ── */
.dsh-cb-badgerow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-cb-badge-preview { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--dsh-cb-border-2); background: var(--dsh-cb-card-2); display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.dsh-cb-badge-input { font: inherit; font-size: 14px; width: 64px; padding: 5px 8px; color: var(--dsh-cb-text); background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: 8px; }
.dsh-cb-badge-select { font: inherit; font-size: 13px; width: auto; padding: 5px 8px; color: var(--dsh-cb-text); background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: 8px; }
.dsh-cb-swatches { display: flex; align-items: center; gap: 6px; }
.dsh-cb-swatch { width: 18px; height: 18px; border-radius: 9px; border: none; padding: 0; cursor: pointer; outline: 1px solid rgba(20, 20, 30, 0.14); transition: transform 0.1s ease; }
.dsh-cb-swatch:hover { transform: scale(1.12); }
.dsh-cb-swatch:active { transform: scale(0.94); }
.dsh-cb-swatch[data-on='1'] { box-shadow: 0 0 0 2px var(--dsh-cb-card), 0 0 0 4px currentColor; }
.dsh-cb-swatch-custom { background: conic-gradient(#f87171, #fbbf24, #34d399, #38bdf8, #a78bfa, #f87171); }
.dsh-cb-badge-btn { padding: 3px 10px; font-size: 12px; line-height: 18px; border-radius: 8px; border: 1px solid var(--dsh-cb-border); background: var(--dsh-cb-card); color: var(--dsh-cb-dim); cursor: pointer; white-space: nowrap; }
.dsh-cb-badge-btn:hover { color: var(--dsh-cb-text); border-color: var(--dsh-cb-border-2); }
.dsh-cb-badge-btn:active { transform: scale(.96); }

/* ================= macOS 风格浅色 v2（设计稿 cron-board-ui-light 对齐） ================= */

.dsh-cb-root {
  --dsh-cb-purple: #a855f7;
  --dsh-cb-purple-bg: rgba(168, 85, 247, 0.10);
  padding: 18px 20px 28px;
  background: #f5f5f7;
  min-height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── 顶栏 ── */
.dsh-cb-topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
  background: var(--dsh-cb-card); border: 1px solid var(--dsh-cb-border); border-radius: 14px;
  padding: 12px 16px; box-shadow: var(--dsh-cb-shadow-sm);
}
.dsh-cb-topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dsh-cb-topbar-right { display: flex; align-items: center; gap: 8px; }
.dsh-cb-logo {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center;
  background: #eef1f6; border: 1px solid rgba(20, 20, 30, 0.08);
  box-shadow: 0 1px 4px rgba(20, 20, 30, 0.10);
}
.dsh-cb-logo-img { width: 100%; height: 100%; object-fit: cover; display: block; user-select: none; }
.dsh-cb-titlewrap { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dsh-cb-titlerow { display: flex; align-items: center; gap: 8px; }
.dsh-cb-title { font-size: 15px; font-weight: 700; color: var(--dsh-cb-text); margin: 0; letter-spacing: -0.2px; }
.dsh-cb-ver {
  font-size: 11px; font-weight: 600; color: #1b66f3; background: rgba(27, 102, 243, 0.10);
  border-radius: 6px; padding: 1px 7px; line-height: 16px;
}
.dsh-cb-statusline { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dsh-cb-dim); }
.dsh-cb-statusdot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dsh-cb-statusdot-ok { background: #10b981; }
.dsh-cb-statusdot-warn { background: #f59e0b; }
.dsh-cb-statusdot-accent { background: #1b66f3; }
.dsh-cb-statusdot-dim { background: #c9ccd4; }

.dsh-cb-searchwrap {
  display: flex; align-items: center; gap: 7px; width: 230px;
  background: #f5f5f7; border: 1px solid var(--dsh-cb-border); border-radius: 9px; padding: 6px 10px;
  color: var(--dsh-cb-dim); transition: border-color .15s ease, box-shadow .15s ease;
}
.dsh-cb-searchwrap:focus-within { border-color: rgba(27, 102, 243, 0.55); box-shadow: 0 0 0 3px rgba(27, 102, 243, 0.12); }
.dsh-cb-search {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
  font-size: 12.5px; color: var(--dsh-cb-text); font-family: inherit; padding: 0;
}
.dsh-cb-search::placeholder { color: #a1a4ad; }
.dsh-cb-kbd {
  font-size: 10px; color: #a1a4ad; background: #fff; border: 1px solid var(--dsh-cb-border);
  border-radius: 5px; padding: 1px 5px; line-height: 14px; flex-shrink: 0;
}
.dsh-cb-iconbtn {
  width: 30px; height: 30px; border-radius: 8px; border: 0; background: transparent;
  color: var(--dsh-cb-dim); display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s ease, color .15s ease;
}
.dsh-cb-iconbtn:hover { background: rgba(20, 20, 30, 0.06); color: var(--dsh-cb-text); }
.dsh-cb-btn-new {
  border: 0; background: linear-gradient(135deg, #2f7bff, #1b5fe0); color: #fff;
  border-radius: 9px; padding: 7px 14px; font-size: 12.5px; font-weight: 600;
  cursor: pointer; font-family: inherit; box-shadow: 0 2px 6px rgba(27, 102, 243, 0.24);
  transition: filter .15s ease, transform .1s ease; white-space: nowrap;
}
.dsh-cb-btn-new:hover { filter: brightness(1.06); }
.dsh-cb-btn-new:active { transform: scale(0.97); }

.dsh-cb-errorbox {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: var(--dsh-cb-err-bg); border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px; padding: 10px 14px; margin-top: 12px; font-size: 12.5px; color: var(--dsh-cb-err);
}

/* ── 统计卡 ── */
.dsh-cb-stats2-row {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px;
}
.dsh-cb-stat2 {
  display: flex; flex-direction: column; gap: 8px; text-align: left;
  background: var(--dsh-cb-card); border: 1px solid var(--dsh-cb-border); border-radius: 14px;
  padding: 14px 16px; cursor: pointer; font-family: inherit;
  box-shadow: var(--dsh-cb-shadow-sm); transition: box-shadow .15s ease, transform .15s ease;
}
.dsh-cb-stat2:hover { box-shadow: var(--dsh-cb-shadow-md); transform: translateY(-1px); }
.dsh-cb-stat2-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.dsh-cb-stat2-chip { width: 32px; height: 32px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; }
.dsh-cb-spark { flex-shrink: 0; }
.dsh-cb-spark polyline { stroke: currentColor; }
.dsh-cb-spark circle { fill: currentColor; }
.dsh-cb-stat2-body { display: flex; align-items: baseline; gap: 5px; }
.dsh-cb-stat2-count { font-size: 24px; font-weight: 700; color: var(--dsh-cb-text); letter-spacing: -0.5px; line-height: 1.1; }
.dsh-cb-stat2-unit { font-size: 12px; color: var(--dsh-cb-dim); }
.dsh-cb-stat2-sub { font-size: 12px; color: var(--dsh-cb-dim); min-height: 16px; }
.dsh-cb-delta { font-weight: 600; }
.dsh-cb-delta-ok { color: #10b981; }
.dsh-cb-delta-err { color: #ef4444; }

.dsh-cb-stat2-accent .dsh-cb-stat2-chip { background: rgba(27, 102, 243, 0.10); color: #1b66f3; }
.dsh-cb-stat2-accent .dsh-cb-spark { color: #1b66f3; }
.dsh-cb-stat2-warn .dsh-cb-stat2-chip { background: rgba(245, 158, 11, 0.12); color: #d97706; }
.dsh-cb-stat2-warn .dsh-cb-spark { color: #c9ccd4; }
.dsh-cb-stat2-ok .dsh-cb-stat2-chip { background: rgba(16, 185, 129, 0.10); color: #059669; }
.dsh-cb-stat2-ok .dsh-cb-spark { color: #10b981; }
.dsh-cb-stat2-purple .dsh-cb-stat2-chip { background: var(--dsh-cb-purple-bg); color: var(--dsh-cb-purple); }
.dsh-cb-stat2-purple .dsh-cb-spark { color: var(--dsh-cb-purple); }

/* ── 筛选 chips ── */
.dsh-cb-chipbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 16px; }
.dsh-cb-chips { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.dsh-cb-chip {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid transparent; background: transparent; border-radius: 999px;
  padding: 5px 12px; font-size: 12.5px; color: var(--dsh-cb-dim); cursor: pointer; font-family: inherit;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.dsh-cb-chip:hover { color: var(--dsh-cb-text); background: rgba(20, 20, 30, 0.04); }
.dsh-cb-chip-active {
  background: var(--dsh-cb-card); color: var(--dsh-cb-text); font-weight: 600;
  border-color: var(--dsh-cb-border); box-shadow: var(--dsh-cb-shadow-sm);
}
.dsh-cb-chip-n { font-size: 11px; color: #a1a4ad; font-weight: 500; }
.dsh-cb-showcount { font-size: 12px; color: var(--dsh-cb-dim); }

/* ── 项目分组 ── */
.dsh-cb-groups { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
.dsh-cb-group {
  background: var(--dsh-cb-card); border: 1px solid var(--dsh-cb-border); border-radius: 14px;
  box-shadow: var(--dsh-cb-shadow-sm);
}
.dsh-cb-grouphead {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 16px; cursor: pointer; user-select: none;
}
.dsh-cb-grouphead-left, .dsh-cb-grouphead-right { display: flex; align-items: center; gap: 8px; }
.dsh-cb-groupdot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.dsh-cb-groupname { font-size: 13.5px; font-weight: 600; color: var(--dsh-cb-text); }
.dsh-cb-groupcount {
  font-size: 11px; color: var(--dsh-cb-dim); background: #f0f1f5;
  border-radius: 999px; padding: 1px 8px; line-height: 16px;
}
.dsh-cb-groupsync { font-size: 11.5px; color: #a1a4ad; }
.dsh-cb-chevron { color: #a1a4ad; font-size: 14px; line-height: 1; transition: transform .15s ease; display: inline-block; }
.dsh-cb-chevron-open { transform: rotate(0deg); }
.dsh-cb-grouphead:not(:hover) .dsh-cb-chevron { opacity: .7; }
.dsh-cb-chevron:not(.dsh-cb-chevron-open) { transform: rotate(-90deg); }
.dsh-cb-groupbody { padding: 0 8px 8px; display: flex; flex-direction: column; }

/* ── 任务行 ── */
.dsh-cb-trow {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 12px; border-radius: 10px; cursor: pointer;
  transition: background .12s ease;
}
.dsh-cb-trow:hover { background: #f6f7f9; }
.dsh-cb-trow + .dsh-cb-trow { border-top: 1px solid rgba(20, 20, 30, 0.05); border-top-left-radius: 0; border-top-right-radius: 0; }
.dsh-cb-trow-paused .dsh-cb-trow-title { color: var(--dsh-cb-dim); }
.dsh-cb-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.dsh-cb-dot-hollow { background: transparent; border: 1.5px solid #c9ccd4; }
.dsh-cb-dot-ok { background: #10b981; }
.dsh-cb-dot-err { background: #ef4444; }
.dsh-cb-dot-warn { background: #f59e0b; }
.dsh-cb-dot-accent { background: #1b66f3; }
.dsh-cb-dot-dim { background: #d4d6dc; }
.dsh-cb-dot-run {
  background: #1b66f3;
  animation: dsh-cb-pulse 1.6s ease-out infinite;
}
@keyframes dsh-cb-pulse {
  0% { box-shadow: 0 0 0 0 rgba(27, 102, 243, 0.35); }
  70% { box-shadow: 0 0 0 6px rgba(27, 102, 243, 0); }
  100% { box-shadow: 0 0 0 0 rgba(27, 102, 243, 0); }
}
.dsh-cb-trow-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dsh-cb-trow-title { font-size: 13.5px; font-weight: 600; color: var(--dsh-cb-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-cb-trow-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: #a1a4ad; }
.dsh-cb-trow-cron { display: inline-flex; align-items: center; gap: 4px; }
.dsh-cb-trow-next { color: var(--dsh-cb-dim); }
.dsh-cb-trow-dim { color: #a1a4ad; }
.dsh-cb-trow-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; position: relative; }
.dsh-cb-btn-outline {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--dsh-cb-border-2); background: var(--dsh-cb-card); color: var(--dsh-cb-dim);
  border-radius: 8px; padding: 5px 11px; font-size: 12px; cursor: pointer; font-family: inherit;
  transition: color .15s ease, border-color .15s ease;
}
.dsh-cb-btn-outline:hover { color: var(--dsh-cb-text); border-color: rgba(20, 20, 30, 0.28); }
.dsh-cb-btn-primary {
  border: 0; background: linear-gradient(135deg, #2f7bff, #1b5fe0); color: #fff;
  border-radius: 8px; padding: 6px 13px; font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: inherit; box-shadow: 0 1px 4px rgba(27, 102, 243, 0.22);
  transition: filter .15s ease, transform .1s ease;
}
.dsh-cb-btn-primary:hover:not(:disabled) { filter: brightness(1.06); }
.dsh-cb-btn-primary:active:not(:disabled) { transform: scale(0.96); }
.dsh-cb-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
.dsh-cb-btn-ghost {
  width: 26px; height: 26px; border-radius: 7px; border: 0; background: transparent;
  color: #a1a4ad; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.dsh-cb-btn-ghost:hover, .dsh-cb-btn-ghost[aria-expanded="true"] { background: rgba(20, 20, 30, 0.06); color: var(--dsh-cb-text); }

/* 行内 ⋯ 菜单 */
.dsh-cb-menu-wrap { position: relative; }
.dsh-cb-menu {
  position: absolute; right: 0; top: calc(100% + 6px); min-width: 128px; z-index: 100000;
  background: var(--dsh-cb-card); border: 1px solid var(--dsh-cb-border); border-radius: 10px;
  box-shadow: var(--dsh-cb-shadow-lg); padding: 4px;
}
.dsh-cb-menu-item {
  display: block; width: 100%; text-align: left; border: 0; background: transparent;
  padding: 7px 12px; font-size: 12.5px; color: var(--dsh-cb-text); border-radius: 7px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
}
.dsh-cb-menu-item:hover { background: #f4f5f7; }
.dsh-cb-menu-danger { color: var(--dsh-cb-err); }
.dsh-cb-menu-danger:hover { background: var(--dsh-cb-err-bg); }
.dsh-cb-menu-sep { height: 1px; background: var(--dsh-cb-border); margin: 4px 6px; }

/* 归档行 */
.dsh-cb-archrow {
  display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 10px; cursor: pointer;
}
.dsh-cb-archrow:hover { background: #f6f7f9; }
.dsh-cb-archrow + .dsh-cb-archrow { border-top: 1px solid rgba(20, 20, 30, 0.05); }

/* ── 最近日志区块 ── */
.dsh-cb-logsec {
  background: var(--dsh-cb-card); border: 1px solid var(--dsh-cb-border); border-radius: 14px;
  box-shadow: var(--dsh-cb-shadow-sm); margin-top: 16px;
}
.dsh-cb-logsec-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 8px; }
.dsh-cb-logsec-title { display: flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 600; color: var(--dsh-cb-text); }
.dsh-cb-viewall { border: 0; background: transparent; color: #1b66f3; font-size: 12px; cursor: pointer; font-family: inherit; padding: 2px 4px; border-radius: 6px; }
.dsh-cb-viewall:hover { text-decoration: underline; }
.dsh-cb-logsec-body {
  display: flex; flex-direction: column; padding: 0 8px 8px;
  max-height: 320px; overflow-y: auto; overscroll-behavior: contain;
}
.dsh-cb-logsec-body-open { max-height: 60vh; }
.dsh-cb-logsec-body::-webkit-scrollbar { width: 6px; }
.dsh-cb-logsec-body::-webkit-scrollbar-thumb { background: rgba(20, 20, 30, 0.14); border-radius: 3px; }
.dsh-cb-logsec-body::-webkit-scrollbar-thumb:hover { background: rgba(20, 20, 30, 0.26); }
.dsh-cb-logsec-body::-webkit-scrollbar-track { background: transparent; }
.dsh-cb-logsec-body { scrollbar-width: thin; scrollbar-color: rgba(20, 20, 30, 0.2) transparent; }
.dsh-cb-logrow {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; cursor: pointer;
  transition: background .12s ease;
}
.dsh-cb-logrow:hover { background: #f6f7f9; }
.dsh-cb-logrow + .dsh-cb-logrow { border-top: 1px solid rgba(20, 20, 30, 0.05); }
.dsh-cb-logrow-title { font-size: 13px; font-weight: 500; color: var(--dsh-cb-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-cb-logrow-sub { font-size: 11.5px; color: #a1a4ad; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-cb-logrow-time { font-size: 11.5px; color: #a1a4ad; flex-shrink: 0; margin-left: auto; }

/* 空态与响应式 */
.dsh-cb-root .dsh-cb-empty { padding: 28px 16px; text-align: center; font-size: 12.5px; color: var(--dsh-cb-dim); }
.dsh-cb-root .dsh-cb-empty-task { padding: 18px 12px; text-align: center; font-size: 12px; color: var(--dsh-cb-dim); }
@media (max-width: 980px) {
  .dsh-cb-stats2-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dsh-cb-searchwrap { width: 170px; }
}
@media (max-width: 640px) {
  .dsh-cb-root { padding: 12px; }
  .dsh-cb-stats2-row { grid-template-columns: 1fr; }
  .dsh-cb-trow-right .dsh-cb-btn-outline { display: none; }
}
`;

export function ensureThemeStyle(): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (el === null) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  // 热更新安全：bundle 换版后内容比对更新，旧样式不再永久占坑。
  if (el.textContent !== CSS) el.textContent = CSS;
}

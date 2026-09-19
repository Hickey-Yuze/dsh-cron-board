/**
 * 主题令牌（--dsh-cb-* 两层令牌机制）+ 样式表注入。
 * 颜色纪律：优先映射宿主 dsw alias 令牌（明暗主题自动跟随），fallback 放实测值；
 * 本插件自有的附加语义色（推送状态等）也全部走 --dsh-cb-* 令牌，不写裸 hex 于组件。
 */

const STYLE_ID = 'dsh-cron-board-style';

const CSS = `
.dsh-cb-root, .dsh-cb-modal, .dsh-cb-icon-btn, .dsh-cb-pop {
  --dsh-cb-card: var(--dsw-alias-bg-layer-1, #ffffff);
  --dsh-cb-card-2: var(--dsw-alias-bg-layer-2, #f6f6f8);
  --dsh-cb-border: var(--dsw-alias-border-l1, rgba(20, 20, 30, 0.12));
  --dsh-cb-border-2: var(--dsw-alias-border-l2, rgba(20, 20, 30, 0.22));
  --dsh-cb-text: var(--dsw-alias-label-primary, #1c1c22);
  --dsh-cb-dim: var(--dsw-alias-label-secondary, #6d6d7a);
  --dsh-cb-accent: var(--dsw-alias-brand-primary, #4b6bfb);
  --dsh-cb-ok: var(--dsw-alias-state-success-primary, #1a9e55);
  --dsh-cb-warn: var(--dsw-alias-state-warn-primary, #d97706);
  --dsh-cb-err: var(--dsw-alias-state-error-primary, #d5372f);
  --dsh-cb-hover: rgba(127, 127, 140, 0.14);
  --dsh-cb-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

/* ── 侧栏入口图标 ── */
.dsh-cb-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; margin: 2px auto; padding: 0;
  border: none; border-radius: 10px; background: transparent; cursor: pointer;
  color: var(--dsh-cb-dim);
}
.dsh-cb-icon-btn:hover { background: var(--dsh-cb-hover); color: var(--dsh-cb-text); }
.dsh-cb-icon-btn.dsh-cb-icon-active { background: var(--dsh-cb-hover); color: var(--dsh-cb-accent); }
.dsh-cb-icon-btn svg { width: 20px; height: 20px; display: block; }

/* ── 看板 ── */
.dsh-cb-root { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--dsh-cb-text); background: var(--dsw-alias-bg-base, #fafafa); }
.dsh-cb-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--dsh-cb-border); flex: none; }
.dsh-cb-title { font-size: 15px; font-weight: 650; margin: 0; }
.dsh-cb-sub { font-size: 12px; color: var(--dsh-cb-dim); }
.dsh-cb-spacer { flex: 1; }
.dsh-cb-search {
  width: 200px; padding: 5px 10px; font-size: 12px; color: var(--dsh-cb-text);
  background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: 8px; outline: none;
}
.dsh-cb-search:focus { border-color: var(--dsh-cb-accent); }
.dsh-cb-cols { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 12px 16px; flex: 1; min-height: 0; overflow: auto; }
.dsh-cb-col { display: flex; flex-direction: column; min-height: 0; background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: 12px; }
.dsh-cb-col-head { padding: 10px 12px 6px; font-size: 12px; font-weight: 650; color: var(--dsh-cb-dim); display: flex; gap: 6px; align-items: center; }
.dsh-cb-col-count { font-weight: 500; opacity: .75; }
.dsh-cb-col-body { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 40px; }
.dsh-cb-col-empty { padding: 10px; font-size: 12px; color: var(--dsh-cb-dim); text-align: center; }

.dsh-cb-card { text-align: left; width: 100%; border: 1px solid var(--dsh-cb-border); border-radius: 10px; background: var(--dsh-cb-card); padding: 10px 12px; cursor: pointer; color: var(--dsh-cb-text); font: inherit; }
.dsh-cb-card:hover { border-color: var(--dsh-cb-accent); }
.dsh-cb-card-title { font-size: 13px; font-weight: 600; margin: 0 0 4px; display: flex; gap: 6px; align-items: center; min-width: 0; }
.dsh-cb-card-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-cb-card-meta { font-size: 11px; color: var(--dsh-cb-dim); display: flex; flex-wrap: wrap; gap: 4px 10px; }
.dsh-cb-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }

.dsh-cb-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--dsh-cb-border); color: var(--dsh-cb-dim); background: var(--dsh-cb-card-2); }
.dsh-cb-badge.dsh-cb-ok { color: var(--dsh-cb-ok); border-color: var(--dsh-cb-ok); }
.dsh-cb-badge.dsh-cb-warn { color: var(--dsh-cb-warn); border-color: var(--dsh-cb-warn); }
.dsh-cb-badge.dsh-cb-err { color: var(--dsh-cb-err); border-color: var(--dsh-cb-err); }
.dsh-cb-badge.dsh-cb-accent { color: var(--dsh-cb-accent); border-color: var(--dsh-cb-accent); }

.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dot.dsh-cb-run { background: var(--dsh-cb-accent); }
.dot.dsh-cb-ok { background: var(--dsh-cb-ok); }
.dot.dsh-cb-err { background: var(--dsh-cb-err); }
.dot.dsh-cb-warn { background: var(--dsh-cb-warn); }
.dot.dsh-cb-idle { background: var(--dsh-cb-dim); opacity: .5; }

/* ── 按钮 ── */
.dsh-cb-btn { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; font-size: 12px; border-radius: 8px; border: 1px solid var(--dsh-cb-border-2); background: var(--dsh-cb-card); color: var(--dsh-cb-text); cursor: pointer; font: inherit; }
.dsh-cb-btn:hover:not(:disabled) { background: var(--dsh-cb-hover); }
.dsh-cb-btn:disabled { opacity: .5; cursor: not-allowed; }
.dsh-cb-btn.dsh-cb-primary { background: var(--dsh-cb-accent); border-color: var(--dsh-cb-accent); color: #fff; }
.dsh-cb-btn.dsh-cb-primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--dsh-cb-accent); }
.dsh-cb-btn.dsh-cb-danger { color: var(--dsh-cb-err); border-color: var(--dsh-cb-err); }
.dsh-cb-btn.dsh-cb-ghost { border-color: transparent; background: transparent; color: var(--dsh-cb-dim); }

/* ── 详情弹层 ── */
.dsh-cb-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dsh-cb-modal { width: min(760px, calc(100vw - 48px)); max-height: calc(100vh - 64px); overflow-y: auto; background: var(--dsh-cb-card); border: 1px solid var(--dsh-cb-border); border-radius: 14px; box-shadow: var(--dsh-cb-shadow); color: var(--dsh-cb-text); }
.dsh-cb-modal-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--dsh-cb-border); position: sticky; top: 0; background: var(--dsh-cb-card); z-index: 1; }
.dsh-cb-modal-body { padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 12px; }
.dsh-cb-field { display: flex; flex-direction: column; gap: 5px; }
.dsh-cb-label { font-size: 12px; font-weight: 600; color: var(--dsh-cb-dim); }
.dsh-cb-input, .dsh-cb-select, .dsh-cb-textarea {
  font: inherit; font-size: 13px; color: var(--dsh-cb-text);
  background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: 8px; padding: 7px 10px; outline: none; width: 100%;
  box-sizing: border-box;
}
.dsh-cb-input:focus, .dsh-cb-select:focus, .dsh-cb-textarea:focus { border-color: var(--dsh-cb-accent); }
.dsh-cb-textarea { resize: vertical; min-height: 96px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.dsh-cb-hint { font-size: 11px; color: var(--dsh-cb-dim); }
.dsh-cb-errbox { font-size: 12px; color: var(--dsh-cb-err); background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-err); border-radius: 8px; padding: 8px 10px; }
.dsh-cb-notebox { font-size: 12px; color: var(--dsh-cb-text); background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-left: 3px solid var(--dsh-cb-warn); border-radius: 8px; padding: 8px 10px; }
.dsh-cb-gatebox { border: 1px solid var(--dsh-cb-warn); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.dsh-cb-gatebox.dsh-cb-gate-ok { border-color: var(--dsh-cb-ok); }
.dsh-cb-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dsh-cb-row-right { margin-left: auto; }

.dsh-cb-exec { border: 1px solid var(--dsh-cb-border); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.dsh-cb-exec-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dsh-cb-exec-meta { color: var(--dsh-cb-dim); font-size: 11px; display: flex; gap: 10px; flex-wrap: wrap; }

.dsh-cb-result { margin: 0; padding: 10px 12px; background: var(--dsh-cb-card-2); border: 1px solid var(--dsh-cb-border); border-radius: 10px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto; }

/* ── 设置页 ── */
.dsh-cb-set { display: flex; flex-direction: column; gap: 14px; max-width: 640px; color: var(--dsh-cb-text); font-size: 13px; }
.dsh-cb-set h3 { font-size: 14px; margin: 0; }
.dsh-cb-setbox { border: 1px solid var(--dsh-cb-border); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; background: var(--dsh-cb-card); }
.dsh-cb-setrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dsh-cb-setlist { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; color: var(--dsh-cb-dim); font-size: 12px; }
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

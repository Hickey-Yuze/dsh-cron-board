window.__ModuleLoader__.load({
	id: "dsh-cron-board",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
		
		// client/src/entry.tsx
		var entry_exports = {};
		__export(entry_exports, {
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(entry_exports);
		
		// client/src/theme.ts
		var STYLE_ID = "dsh-cron-board-style";
		var CSS = `
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
		function ensureThemeStyle() {
		  if (typeof document === "undefined") return;
		  let el = document.getElementById(STYLE_ID);
		  if (el) return;
		  el = document.createElement("style");
		  el.id = STYLE_ID;
		  el.textContent = CSS;
		  document.head.appendChild(el);
		}
		
		// client/src/i18n.ts
		var zh = {
		  "panel.label": "定时任务",
		  "board.title": "定时任务看板",
		  "board.new": "新建任务",
		  "board.search": "搜索任务…",
		  "board.channel": "推送",
		  "board.revision": "版本",
		  "board.loadFail": "看板数据加载失败",
		  "board.retry": "重试",
		  "board.empty": "暂无任务，点击「新建任务」创建",
		  "board.runFeed": "最近执行",
		  "board.feedEmpty": "还没有执行记录",
		  "board.next": "下次",
		  "board.lastRun": "上次",
		  "board.confirmHint": "权限待确认",
		  "col.draft": "草稿",
		  "col.scheduled": "已排程",
		  "col.running": "运行中",
		  "col.recent": "最近执行",
		  "st.running": "运行中",
		  "st.success": "成功",
		  "st.failed": "失败",
		  "st.timeout": "超时",
		  "st.pending": "待执行",
		  "push.sent": "已送达",
		  "push.failed": "未送达",
		  "push.disabled": "未配置",
		  "push.mode.service": "dshIm 服务",
		  "push.mode.unavailable": "未接通",
		  "push.unavailableHint": "dsh-im 未部署：推送将标记未送达，部署后自动恢复；结果仍会正常落盘。",
		  "skip.missed-trigger-skipped": "错过的触发已跳过",
		  "skip.task-running-skipped": "运行中跳过本次",
		  "skip.awaiting-confirmation": "权限待确认，跳过本次",
		  "skip.invalid-cron": "cron 表达式无效",
		  "perm.read-only": "只读",
		  "perm.workspace-write": "工作区可写",
		  "perm.danger-full-access": "完全访问",
		  "act.run": "立即执行",
		  "act.save": "保存",
		  "act.cancel": "取消",
		  "act.delete": "删除",
		  "act.edit": "编辑",
		  "act.close": "关闭",
		  "act.confirm": "确认权限",
		  "act.testPush": "测试推送",
		  "act.retryPush": "补推",
		  "act.viewResult": "结果",
		  "act.enable": "启用",
		  "act.disable": "停用",
		  "f.title": "标题",
		  "f.titlePh": "例：每日运营周报",
		  "f.prompt": "任务 Prompt",
		  "f.promptPh": "到达触发点后，将以独立会话发送给 agent 执行的完整指令…",
		  "f.cron": "Cron 表达式（分 时 日 月 周）",
		  "f.cronPreview": "无匹配描述，将按表达式原文展示",
		  "f.workspace": "钉住工作区（可选）",
		  "f.workspaceDefault": "跟随默认",
		  "f.preset": "钉住 agent 预设（可选）",
		  "f.presetDefault": "不更改",
		  "f.permission": "权限档",
		  "f.permissionDefault": "跟随默认（read-only）",
		  "f.push": "推送目标",
		  "f.pushNone": "不推送",
		  "gate.title": "权限确认门",
		  "gate.body": "该任务的有效权限高于默认档（read-only）。首次定时触发前需要在此人工确认一次；权限、Prompt、预设或工作区任一变更后需重新确认。未确认时 cron 会跳过并滚动到下一次触发点。",
		  "gate.confirmed": "已确认，允许无人值守执行",
		  "gate.needConfirm": "待确认",
		  "exec.trigger.manual": "手动",
		  "exec.trigger.cron": "定时",
		  "exec.duration": "耗时",
		  "exec.push": "推送",
		  "exec.noResult": "结果文件不存在或已按保留策略清理",
		  "exec.resultTitle": "执行结果",
		  "dl.newTitle": "新建定时任务",
		  "dl.editTitle": "编辑任务",
		  "dl.deleteConfirm": "确定删除该任务？执行历史与结果文件将一并清除。",
		  "dl.saved": "已保存",
		  "dl.saveFail": "保存失败",
		  "dl.runQueued": "已开始执行",
		  "dl.pushTested": "测试消息已发送",
		  "dl.confirmed": "已确认，定时执行已放行",
		  "dl.ranOnce": "该任务已执行过，修改后确认门将重新武装",
		  "set.title": "定时任务看板",
		  "set.desc": "cron 定时 agent 会话任务 + 执行终态机器人推送。看板入口在左侧栏。",
		  "set.channel": "推送通道",
		  "set.defaultPush": "全局默认推送目标",
		  "set.defaultPushSave": "保存默认目标",
		  "set.defaultPushSaved": "已保存",
		  "set.params": "调度与保留",
		  "set.dataDir": "数据目录",
		  "set.hint.title": "使用说明",
		  "set.hint.1": "任务到点后新建独立 DSH 会话执行，会话终态即任务终态。",
		  "set.hint.2": "高于默认权限档的任务需在看板确认一次，cron 才会无人值守执行。",
		  "set.hint.3": "错过的触发不补跑；同任务运行中到点跳过并滚动。",
		  "set.hint.4": "推送目标来自 dsh-im 的「调用标识 botId + 目标 targetId」。",
		  "set.hint.5": "本插件数据独立存放，不读写宿主 .dsh\\cron。",
		  "ago.now": "刚刚",
		  "ago.min": "{n} 分钟前",
		  "ago.hour": "{n} 小时前",
		  "ago.day": "{n} 天前",
		  "ago.future": "{s} 后"
		};
		var en = {
		  "panel.label": "Cron Board",
		  "board.title": "Cron Task Board",
		  "board.new": "New Task",
		  "board.search": "Search tasks…",
		  "board.channel": "Push",
		  "board.revision": "rev",
		  "board.loadFail": "Failed to load board data",
		  "board.retry": "Retry",
		  "board.empty": 'No tasks yet — click "New Task" to create one',
		  "board.runFeed": "Recent runs",
		  "board.feedEmpty": "No executions yet",
		  "board.next": "Next",
		  "board.lastRun": "Last",
		  "board.confirmHint": "Confirm required",
		  "col.draft": "Draft",
		  "col.scheduled": "Scheduled",
		  "col.running": "Running",
		  "col.recent": "Recent runs",
		  "st.running": "Running",
		  "st.success": "Success",
		  "st.failed": "Failed",
		  "st.timeout": "Timeout",
		  "st.pending": "Pending",
		  "push.sent": "Sent",
		  "push.failed": "Not sent",
		  "push.disabled": "No target",
		  "push.mode.service": "dshIm service",
		  "push.mode.unavailable": "Not connected",
		  "push.unavailableHint": "dsh-im not deployed: pushes will be marked not-sent and recover automatically once deployed; results are still archived.",
		  "skip.missed-trigger-skipped": "Missed trigger skipped",
		  "skip.task-running-skipped": "Skipped while running",
		  "skip.awaiting-confirmation": "Skipped: awaiting confirmation",
		  "skip.invalid-cron": "Invalid cron expression",
		  "perm.read-only": "Read-only",
		  "perm.workspace-write": "Workspace write",
		  "perm.danger-full-access": "Full access",
		  "act.run": "Run now",
		  "act.save": "Save",
		  "act.cancel": "Cancel",
		  "act.delete": "Delete",
		  "act.edit": "Edit",
		  "act.close": "Close",
		  "act.confirm": "Confirm permission",
		  "act.testPush": "Test push",
		  "act.retryPush": "Retry push",
		  "act.viewResult": "Result",
		  "act.enable": "Enable",
		  "act.disable": "Disable",
		  "f.title": "Title",
		  "f.titlePh": "e.g. Daily ops report",
		  "f.prompt": "Task prompt",
		  "f.promptPh": "Full instruction sent to a fresh agent session when triggered…",
		  "f.cron": "Cron (min hour dom month dow)",
		  "f.cronPreview": "No human description — shown as raw expression",
		  "f.workspace": "Pin workspace (optional)",
		  "f.workspaceDefault": "Follow default",
		  "f.preset": "Pin agent preset (optional)",
		  "f.presetDefault": "Keep current",
		  "f.permission": "Permission",
		  "f.permissionDefault": "Follow default (read-only)",
		  "f.push": "Push target",
		  "f.pushNone": "No push",
		  "gate.title": "Permission confirmation gate",
		  "gate.body": "This task runs above the default permission (read-only). Confirm once here before its first scheduled trigger; any change to permission, prompt, preset or workspace re-arms the gate. Unconfirmed tasks are skipped and rolled forward by cron.",
		  "gate.confirmed": "Confirmed — unattended runs allowed",
		  "gate.needConfirm": "Awaiting confirmation",
		  "exec.trigger.manual": "Manual",
		  "exec.trigger.cron": "Cron",
		  "exec.duration": "Duration",
		  "exec.push": "Push",
		  "exec.noResult": "Result file missing or pruned by retention policy",
		  "exec.resultTitle": "Execution result",
		  "dl.newTitle": "New scheduled task",
		  "dl.editTitle": "Edit task",
		  "dl.deleteConfirm": "Delete this task? History and result files will be removed.",
		  "dl.saved": "Saved",
		  "dl.saveFail": "Save failed",
		  "dl.runQueued": "Execution started",
		  "dl.pushTested": "Test message sent",
		  "dl.confirmed": "Confirmed — cron may run unattended",
		  "dl.ranOnce": "This task has run before; editing re-arms the confirmation gate",
		  "set.title": "Cron Task Board",
		  "set.desc": "Scheduled agent-session tasks via cron, with bot push on completion. The board lives in the sidebar.",
		  "set.channel": "Push channel",
		  "set.defaultPush": "Global default push target",
		  "set.defaultPushSave": "Save default target",
		  "set.defaultPushSaved": "Saved",
		  "set.params": "Scheduling & retention",
		  "set.dataDir": "Data directory",
		  "set.hint.title": "Notes",
		  "set.hint.1": "Each run creates a fresh DSH session; the session turn end settles the task.",
		  "set.hint.2": "Tasks above the default permission need one confirmation before unattended cron runs.",
		  "set.hint.3": "Missed triggers are never re-queued; running tasks skip and roll forward.",
		  "set.hint.4": "Push targets come from dsh-im: botId + targetId.",
		  "set.hint.5": "Data is stored independently; the host .dsh\\cron directory is never touched.",
		  "ago.now": "just now",
		  "ago.min": "{n} min ago",
		  "ago.hour": "{n} h ago",
		  "ago.day": "{n} d ago",
		  "ago.future": "in {s}"
		};
		var dicts = { zh, en };
		var currentLang = "zh";
		function normalizeLang(snapshot) {
		  const id = snapshot;
		  const raw = typeof id?.id === "string" ? id.id : typeof id?.locale === "string" ? id.locale : "";
		  return raw.toLowerCase().startsWith("zh") ? "zh" : "en";
		}
		function initI18n(ctx) {
		  try {
		    currentLang = normalizeLang(ctx.locale?.getLocale());
		    ctx.locale?.subscribe(() => {
		      if (ctx.locale) currentLang = normalizeLang(ctx.locale.getLocale());
		    });
		  } catch {
		    currentLang = "zh";
		  }
		}
		function lang() {
		  return currentLang;
		}
		function t(key) {
		  return dicts[currentLang]?.[key] ?? dicts.zh?.[key] ?? key;
		}
		function tpl(key, params) {
		  let s = t(key);
		  for (const [k, v] of Object.entries(params)) {
		    s = s.split(`{${k}}`).join(String(v));
		  }
		  return s;
		}
		
		// client/src/board.tsx
		var import_react3 = require("react");
		
		// src/cron.ts
		var MINUTE_MIN = 0;
		var MINUTE_MAX = 59;
		var HOUR_MIN = 0;
		var HOUR_MAX = 23;
		var DOM_MIN = 1;
		var DOM_MAX = 31;
		var MONTH_MIN = 1;
		var MONTH_MAX = 12;
		var DOW_MIN = 0;
		var DOW_MAX = 7;
		function parseField(raw, name, min, max, isDow = false) {
		  const values = /* @__PURE__ */ new Set();
		  let wild = false;
		  const terms = raw.split(",");
		  if (terms.length === 0 || terms.some((t2) => t2.length === 0)) {
		    throw new Error(`cron: 字段 ${name} 为空或不合法: "${raw}"`);
		  }
		  for (const term of terms) {
		    let body = term;
		    let step = 1;
		    const slash = term.indexOf("/");
		    if (slash >= 0) {
		      body = term.slice(0, slash);
		      const stepRaw = term.slice(slash + 1);
		      step = Number(stepRaw);
		      if (!Number.isInteger(step) || step < 1) throw new Error(`cron: 字段 ${name} 步长不合法: "${term}"`);
		    }
		    let lo, hi;
		    if (body === "*") {
		      lo = min;
		      hi = max;
		      if (slash < 0) wild = true;
		    } else if (body.includes("-")) {
		      const parts = body.split("-");
		      if (parts.length !== 2) throw new Error(`cron: 字段 ${name} 范围不合法: "${term}"`);
		      lo = Number(parts[0]);
		      hi = Number(parts[1]);
		    } else {
		      lo = Number(body);
		      hi = slash >= 0 ? max : lo;
		    }
		    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`cron: 字段 ${name} 数值不合法: "${term}"`);
		    if (isDow) {
		      if (lo === 7) lo = 0;
		      if (hi === 7) hi = 0;
		    }
		    if (lo < min || hi > max || lo > hi) {
		      throw new Error(`cron: 字段 ${name} 超界: "${term}"（允许 ${min}-${max}）`);
		    }
		    for (let v = lo; v <= hi; v += step) values.add(v);
		  }
		  if (values.size === 0) throw new Error(`cron: 字段 ${name} 无有效值: "${raw}"`);
		  return { values, wild };
		}
		function parseCron(expr) {
		  const parts = expr.trim().split(/\s+/);
		  if (parts.length !== 5) throw new Error(`cron: 需要 5 段（分 时 日 月 周），收到 ${parts.length} 段: "${expr}"`);
		  const minute = parseField(parts[0], "分", MINUTE_MIN, MINUTE_MAX);
		  const hour = parseField(parts[1], "时", HOUR_MIN, HOUR_MAX);
		  const dom = parseField(parts[2], "日", DOM_MIN, DOM_MAX);
		  const month = parseField(parts[3], "月", MONTH_MIN, MONTH_MAX);
		  const dow = parseField(parts[4], "周", DOW_MIN, DOW_MAX, true);
		  return {
		    minute: minute.values,
		    hour: hour.values,
		    dom: dom.values,
		    month: month.values,
		    dow: dow.values,
		    domWild: dom.wild,
		    dowWild: dow.wild
		  };
		}
		function isValidCron(expr) {
		  try {
		    parseCron(expr);
		    return true;
		  } catch {
		    return false;
		  }
		}
		var ZH_DOW = ["日", "一", "二", "三", "四", "五", "六"];
		var EN_DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
		function pad2(n) {
		  return n < 10 ? `0${n}` : String(n);
		}
		function isPlainNumber(s) {
		  return /^\d+$/.test(s);
		}
		function describeCron(expr, lang2) {
		  let parts;
		  try {
		    parts = expr.trim().split(/\s+/);
		    if (parts.length !== 5) return expr;
		    parseCron(expr);
		  } catch {
		    return expr;
		  }
		  const minute = parts[0];
		  const hour = parts[1];
		  const dom = parts[2];
		  const mon = parts[3];
		  const dow = parts[4];
		  const time = `${pad2(Number(hour))}:${pad2(Number(minute))}`;
		  if (mon === "*" && dom === "*" && dow === "*" && isPlainNumber(minute) && isPlainNumber(hour)) {
		    return lang2 === "zh" ? `每天 ${time}` : `Daily at ${time}`;
		  }
		  if (mon === "*" && dom === "*" && isPlainNumber(dow) && isPlainNumber(minute) && isPlainNumber(hour)) {
		    const d = Number(dow) % 7;
		    return lang2 === "zh" ? `每周${ZH_DOW[d]} ${time}` : `Every ${EN_DOW[d]} at ${time}`;
		  }
		  if (mon === "*" && dow === "*" && isPlainNumber(dom) && isPlainNumber(minute) && isPlainNumber(hour)) {
		    return lang2 === "zh" ? `每月 ${Number(dom)} 日 ${time}` : `Monthly on day ${Number(dom)} at ${time}`;
		  }
		  if (dom === "*" && mon === "*" && dow === "*" && /^\*\/(\d+)$/.test(minute) && hour === "*") {
		    const n = Number(minute.match(/^\*\/(\d+)$/)[1]);
		    if (lang2 === "zh") return n === 1 ? "每分钟" : `每 ${n} 分钟`;
		    return n === 1 ? "Every minute" : `Every ${n} minutes`;
		  }
		  if (dom === "*" && mon === "*" && dow === "*" && minute === "0" && /^\*\/(\d+)$/.test(hour)) {
		    const n = Number(hour.match(/^\*\/(\d+)$/)[1]);
		    if (lang2 === "zh") return n === 1 ? "每小时" : `每 ${n} 小时`;
		    return n === 1 ? "Every hour" : `Every ${n} hours`;
		  }
		  return expr;
		}
		
		// client/src/format.ts
		function fmtAgo(iso) {
		  if (!iso) return "—";
		  const ms = Date.now() - new Date(iso).getTime();
		  if (!Number.isFinite(ms)) return "—";
		  if (ms < 45e3) return tpl("ago.now", {});
		  const min = Math.round(ms / 6e4);
		  if (min < 60) return tpl("ago.min", { n: min });
		  const hour = Math.round(min / 60);
		  if (hour < 24) return tpl("ago.hour", { n: hour });
		  return tpl("ago.day", { n: Math.round(hour / 24) });
		}
		function fmtFuture(iso) {
		  if (!iso) return "—";
		  const ms = new Date(iso).getTime() - Date.now();
		  if (!Number.isFinite(ms) || ms <= 0) return fmtAgo(iso);
		  const min = Math.round(ms / 6e4);
		  if (min < 1) return tpl("ago.future", { s: "<1 min" });
		  if (min < 60) return tpl("ago.future", { s: `${min} min` });
		  const hour = Math.floor(min / 60);
		  return tpl("ago.future", { s: lang() === "zh" ? `${hour} 时 ${min % 60} 分` : `${hour}h ${min % 60}m` });
		}
		function fmtDur(ms) {
		  if (ms === void 0 || ms === null) return "—";
		  const sec = Math.max(0, Math.round(ms / 1e3));
		  if (sec < 60) return lang() === "zh" ? `${sec} 秒` : `${sec}s`;
		  const min = Math.floor(sec / 60);
		  const rest = sec % 60;
		  if (min < 60) return lang() === "zh" ? `${min} 分 ${rest} 秒` : `${min}m ${rest}s`;
		  const hour = Math.floor(min / 60);
		  return lang() === "zh" ? `${hour} 时 ${min % 60} 分` : `${hour}h ${min % 60}m`;
		}
		function pushKeyOf(p) {
		  return p && p.botId && p.targetId ? `${p.botId}::${p.targetId}` : "";
		}
		function parsePushKey(key) {
		  if (key === "") return null;
		  const [botId, targetId] = key.split("::");
		  if (!botId || !targetId) return null;
		  return { botId, targetId };
		}
		function pushOptionLabel(target, botChannel) {
		  const name = target.name && target.name !== "" ? target.name : target.targetId;
		  const channel = botChannel ?? target.kind ?? "";
		  return channel === "" ? name : `${channel} · ${name}`;
		}
		
		// client/src/detail.tsx
		var import_react2 = require("react");
		
		// client/src/ui.tsx
		var import_react = require("react");
		function Btn(props) {
		  const cls = ["dsh-cb-btn"];
		  if (props.kind === "primary") cls.push("dsh-cb-primary");
		  else if (props.kind === "danger") cls.push("dsh-cb-danger");
		  else if (props.kind === "ghost") cls.push("dsh-cb-ghost");
		  return (0, import_react.createElement)(
		    "button",
		    { className: cls.join(" "), onClick: props.onClick, disabled: props.disabled === true, title: props.title, type: "button" },
		    props.children
		  );
		}
		function Badge(props) {
		  const cls = ["dsh-cb-badge"];
		  if (props.tone && props.tone !== "default") cls.push(`dsh-cb-${props.tone}`);
		  return (0, import_react.createElement)("span", { className: cls.join(" "), title: props.title }, props.children);
		}
		function Dot(props) {
		  return (0, import_react.createElement)("span", { className: `dot dsh-cb-${props.tone}` });
		}
		function Field(props) {
		  return (0, import_react.createElement)(
		    "div",
		    { className: "dsh-cb-field" },
		    (0, import_react.createElement)("span", { className: "dsh-cb-label" }, props.label),
		    props.children,
		    props.hint !== void 0 ? (0, import_react.createElement)("span", { className: "dsh-cb-hint" }, props.hint) : null
		  );
		}
		function TextInput(props) {
		  return (0, import_react.createElement)("input", {
		    className: "dsh-cb-input",
		    value: props.value,
		    placeholder: props.placeholder,
		    onChange: (e) => props.onChange(e.target.value)
		  });
		}
		function TextArea(props) {
		  return (0, import_react.createElement)("textarea", {
		    className: "dsh-cb-textarea",
		    value: props.value,
		    placeholder: props.placeholder,
		    rows: props.rows ?? 6,
		    onChange: (e) => props.onChange(e.target.value)
		  });
		}
		function Select(props) {
		  return (0, import_react.createElement)(
		    "select",
		    { className: "dsh-cb-select", value: props.value, onChange: (e) => props.onChange(e.target.value) },
		    props.options.map((o, i) => (0, import_react.createElement)("option", { key: `${o.value}-${i}`, value: o.value }, o.label))
		  );
		}
		function ErrorBox(props) {
		  return (0, import_react.createElement)("div", { className: "dsh-cb-errbox" }, props.children);
		}
		
		// client/src/detail.tsx
		function pushOptions(meta) {
		  const options = [{ value: "", label: t("f.pushNone") }];
		  if (meta) {
		    for (const target of meta.targets) {
		      const bot = meta.bots.find((b) => b.botId === target.botId);
		      options.push({ value: `${target.botId}::${target.targetId}`, label: pushOptionLabel(target, bot?.channel) });
		    }
		  }
		  return options;
		}
		function DetailModal(props) {
		  const mounted = props.snapshot;
		  const task = props.taskId ? mounted?.tasks.find((x) => x.id === props.taskId) ?? null : null;
		  const [title, setTitle] = (0, import_react2.useState)(task?.title ?? "");
		  const [prompt, setPrompt] = (0, import_react2.useState)(task?.prompt ?? "");
		  const [cron, setCron] = (0, import_react2.useState)(task?.cron ?? "0 9 * * 1");
		  const [enabled, setEnabled] = (0, import_react2.useState)(task?.enabled ?? true);
		  const [workspaceId, setWorkspaceId] = (0, import_react2.useState)(task?.pinned.workspaceId ?? "");
		  const [presetId, setPresetId] = (0, import_react2.useState)(task?.pinned.presetId ?? "");
		  const [permission, setPermission] = (0, import_react2.useState)(task?.pinned.permission ?? "");
		  const [pushKey, setPushKey] = (0, import_react2.useState)(pushKeyOf(task?.push));
		  const [busy, setBusy] = (0, import_react2.useState)(false);
		  const [err, setErr] = (0, import_react2.useState)(null);
		  const [note, setNote] = (0, import_react2.useState)(null);
		  const [resultText, setResultText] = (0, import_react2.useState)(null);
		  const cronOk = isValidCron(cron.trim());
		  const cronPreview = cronOk && describeCron(cron.trim(), lang()) !== cron.trim() ? describeCron(cron.trim(), lang()) : t("f.cronPreview");
		  const needsConfirmNow = task?.needsConfirm === true && task.confirmed === false;
		  const perm = (permission !== "" ? permission : task?.pinned.permission) ?? void 0;
		  async function save() {
		    if (title.trim() === "" || prompt.trim() === "" || !cronOk) return;
		    setBusy(true);
		    setErr(null);
		    try {
		      const r = await props.rpc("cron-board/task-upsert", {
		        task: {
		          id: task?.id,
		          title: title.trim(),
		          prompt,
		          cron: cron.trim(),
		          enabled,
		          pinned: {
		            workspaceId: workspaceId === "" ? void 0 : workspaceId,
		            presetId: presetId === "" ? void 0 : presetId,
		            permission: permission === "" ? void 0 : permission
		          },
		          push: parsePushKey(pushKey)
		        }
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
		  async function action(fn, okMsg) {
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
		  async function viewResult(execId) {
		    if (!task) return;
		    setBusy(true);
		    setErr(null);
		    try {
		      const r = await props.rpc("cron-board/exec-result", { taskId: task.id, execId });
		      if (r.ok) setResultText({ execId, markdown: r.value.markdown });
		      else setErr(r.error.message);
		    } finally {
		      setBusy(false);
		    }
		  }
		  return (0, import_react2.createElement)(
		    "div",
		    { className: "dsh-cb-modal-mask", onClick: (e) => {
		      if (e.target === e.currentTarget) props.onClose();
		    } },
		    (0, import_react2.createElement)(
		      "div",
		      { className: "dsh-cb-modal" },
		      (0, import_react2.createElement)(
		        "div",
		        { className: "dsh-cb-modal-head" },
		        (0, import_react2.createElement)("h3", { className: "dsh-cb-title", style: { margin: 0, fontSize: 14 } }, task ? t("dl.editTitle") : t("dl.newTitle")),
		        (0, import_react2.createElement)("div", { className: "dsh-cb-spacer" }),
		        task ? (0, import_react2.createElement)(Badge, { tone: task.enabled ? "accent" : "default" }, task.enabled ? t("act.enable") : t("act.disable")) : null,
		        (0, import_react2.createElement)(Btn, { kind: "ghost", onClick: props.onClose }, t("act.close"))
		      ),
		      (0, import_react2.createElement)(
		        "div",
		        { className: "dsh-cb-modal-body" },
		        task ? (0, import_react2.createElement)(
		          "div",
		          { className: `dsh-cb-gatebox${task.confirmed ? " dsh-cb-gate-ok" : ""}` },
		          (0, import_react2.createElement)(
		            "div",
		            { className: "dsh-cb-row" },
		            (0, import_react2.createElement)("strong", { style: { fontSize: 12 } }, t("gate.title")),
		            task.needsConfirm ? task.confirmed ? (0, import_react2.createElement)(Badge, { tone: "ok" }, t("gate.confirmed")) : (0, import_react2.createElement)(Badge, { tone: "warn" }, t("gate.needConfirm")) : (0, import_react2.createElement)(Badge, {}, t("perm.read-only"))
		          ),
		          task.needsConfirm ? (0, import_react2.createElement)("span", { className: "dsh-cb-hint" }, t("gate.body")) : null,
		          task.needsConfirm && !task.confirmed ? (0, import_react2.createElement)(
		            "div",
		            { className: "dsh-cb-row" },
		            (0, import_react2.createElement)(Btn, { disabled: busy, onClick: () => void action(() => props.rpc("cron-board/task-confirm", { id: task.id }), t("dl.confirmed")) }, t("act.confirm"))
		          ) : null
		        ) : null,
		        (0, import_react2.createElement)(Field, { label: t("f.title") }, (0, import_react2.createElement)(TextInput, { value: title, onChange: setTitle, placeholder: t("f.titlePh") })),
		        (0, import_react2.createElement)(Field, { label: t("f.prompt") }, (0, import_react2.createElement)(TextArea, { value: prompt, onChange: setPrompt, placeholder: t("f.promptPh") })),
		        (0, import_react2.createElement)(
		          Field,
		          { label: t("f.cron"), hint: cronPreview },
		          (0, import_react2.createElement)(TextInput, { value: cron, onChange: setCron }),
		          !cronOk ? (0, import_react2.createElement)("span", { className: "dsh-cb-hint", style: { color: "var(--dsh-cb-err, #d5372f)" } }, "cron: invalid") : null
		        ),
		        (0, import_react2.createElement)(
		          "div",
		          { className: "dsh-cb-row" },
		          (0, import_react2.createElement)(
		            "div",
		            { style: { flex: 1, minWidth: 180 } },
		            (0, import_react2.createElement)(
		              Field,
		              { label: t("f.workspace") },
		              (0, import_react2.createElement)(Select, {
		                value: workspaceId,
		                onChange: setWorkspaceId,
		                options: [{ value: "", label: t("f.workspaceDefault") }].concat(
		                  (props.meta?.workspaces ?? []).map((w) => ({ value: w.id, label: w.title }))
		                )
		              })
		            )
		          ),
		          (0, import_react2.createElement)(
		            "div",
		            { style: { flex: 1, minWidth: 180 } },
		            (0, import_react2.createElement)(
		              Field,
		              { label: t("f.preset") },
		              (0, import_react2.createElement)(Select, {
		                value: presetId,
		                onChange: setPresetId,
		                options: [{ value: "", label: t("f.presetDefault") }].concat(
		                  (props.meta?.presets ?? []).map((p) => ({ value: p.id, label: p.title }))
		                )
		              })
		            )
		          )
		        ),
		        (0, import_react2.createElement)(
		          "div",
		          { className: "dsh-cb-row" },
		          (0, import_react2.createElement)(
		            "div",
		            { style: { flex: 1, minWidth: 180 } },
		            (0, import_react2.createElement)(
		              Field,
		              { label: t("f.permission"), hint: perm !== void 0 && perm !== "read-only" ? t("gate.body") : void 0 },
		              (0, import_react2.createElement)(Select, {
		                value: permission,
		                onChange: setPermission,
		                options: [
		                  { value: "", label: t("f.permissionDefault") },
		                  { value: "read-only", label: t("perm.read-only") },
		                  { value: "workspace-write", label: t("perm.workspace-write") },
		                  { value: "danger-full-access", label: t("perm.danger-full-access") }
		                ]
		              })
		            )
		          ),
		          (0, import_react2.createElement)(
		            "div",
		            { style: { flex: 1, minWidth: 180 } },
		            (0, import_react2.createElement)(
		              Field,
		              { label: t("f.push") },
		              (0, import_react2.createElement)(Select, { value: pushKey, onChange: setPushKey, options: pushOptions(props.meta) })
		            )
		          )
		        ),
		        task && task.executions.length > 0 && task.needsConfirm && task.confirmed ? (0, import_react2.createElement)("div", { className: "dsh-cb-notebox" }, t("dl.ranOnce")) : null,
		        err !== null ? (0, import_react2.createElement)(ErrorBox, {}, err) : null,
		        note !== null ? (0, import_react2.createElement)("div", { className: "dsh-cb-notebox" }, note) : null,
		        resultText !== null ? (0, import_react2.createElement)(
		          "div",
		          { className: "dsh-cb-field" },
		          (0, import_react2.createElement)("span", { className: "dsh-cb-label" }, `${t("exec.resultTitle")} · ${resultText.execId}`),
		          (0, import_react2.createElement)("pre", { className: "dsh-cb-result" }, resultText.markdown)
		        ) : null,
		        (0, import_react2.createElement)(
		          "div",
		          { className: "dsh-cb-row" },
		          (0, import_react2.createElement)(Btn, { kind: "primary", disabled: busy || !cronOk, onClick: () => void save() }, t("act.save")),
		          task ? (0, import_react2.createElement)(Btn, { disabled: busy || task.running, onClick: () => void action(() => props.rpc("cron-board/task-run", { id: task.id }), t("dl.runQueued")) }, t("act.run")) : null,
		          task ? (0, import_react2.createElement)(Btn, { disabled: busy, onClick: () => void action(() => props.rpc("cron-board/push-test", { id: task.id }), t("dl.pushTested")) }, t("act.testPush")) : null,
		          task ? (0, import_react2.createElement)(Btn, { disabled: enabled === task.enabled, onClick: () => void action(() => props.rpc("cron-board/task-toggle", { id: task.id, enabled }), enabled ? t("act.enable") : t("act.disable")) }, enabled ? t("act.enable") : t("act.disable")) : null,
		          (0, import_react2.createElement)("div", { className: "dsh-cb-row-right" }),
		          task ? (0, import_react2.createElement)(Btn, {
		            kind: "danger",
		            disabled: busy || task.running,
		            onClick: () => {
		              if (typeof window !== "undefined" && !window.confirm(t("dl.deleteConfirm"))) return;
		              void action(() => props.rpc("cron-board/task-delete", { id: task.id }), t("act.close")).then(() => props.onClose());
		            }
		          }, t("act.delete")) : null
		        ),
		        task ? (0, import_react2.createElement)(
		          "div",
		          { className: "dsh-cb-field" },
		          (0, import_react2.createElement)("span", { className: "dsh-cb-label" }, t("col.recent")),
		          task.executions.length === 0 ? (0, import_react2.createElement)("span", { className: "dsh-cb-hint" }, t("board.feedEmpty")) : task.executions.map(
		            (exec) => (0, import_react2.createElement)(
		              "div",
		              { className: "dsh-cb-exec", key: exec.id },
		              (0, import_react2.createElement)(
		                "div",
		                { className: "dsh-cb-exec-head" },
		                (0, import_react2.createElement)(Dot, { tone: exec.status === "running" ? "run" : exec.status === "success" ? "ok" : exec.status === "failed" ? "err" : "warn" }),
		                (0, import_react2.createElement)("strong", { style: { fontSize: 12 } }, t(`st.${exec.status}`)),
		                (0, import_react2.createElement)(Badge, {}, t(`exec.trigger.${exec.trigger}`)),
		                exec.push ? (0, import_react2.createElement)(Badge, { tone: exec.push.state === "sent" ? "ok" : exec.push.state === "failed" ? "err" : "default" }, `${t("exec.push")}: ${t(`push.${exec.push.state}`)}`) : null,
		                (0, import_react2.createElement)("div", { className: "dsh-cb-row-right" }),
		                exec.push?.state === "failed" ? (0, import_react2.createElement)(Btn, { kind: "ghost", disabled: busy, onClick: () => void action(() => props.rpc("cron-board/push-retry", { taskId: task.id, execId: exec.id }), t("dl.pushTested")) }, t("act.retryPush")) : null,
		                exec.resultPath !== void 0 && exec.status !== "running" ? (0, import_react2.createElement)(Btn, { kind: "ghost", disabled: busy, onClick: () => void viewResult(exec.id) }, t("act.viewResult")) : null
		              ),
		              (0, import_react2.createElement)(
		                "div",
		                { className: "dsh-cb-exec-meta" },
		                (0, import_react2.createElement)("span", null, fmtAgo(exec.startedAt)),
		                exec.durationMs !== void 0 ? (0, import_react2.createElement)("span", null, `${t("exec.duration")} ${fmtDur(exec.durationMs)}`) : null,
		                exec.exitReason !== void 0 ? (0, import_react2.createElement)("span", null, exec.exitReason) : null
		              )
		            )
		          )
		        ) : null
		      )
		    )
		  );
		}
		
		// client/src/board.tsx
		function statusTone(s) {
		  if (s === "success") return "ok";
		  if (s === "failed") return "err";
		  if (s === "timeout") return "warn";
		  return "accent";
		}
		function dotTone(s) {
		  if (s === "running") return "run";
		  if (s === "success") return "ok";
		  if (s === "failed") return "err";
		  return "warn";
		}
		function skipText(reason) {
		  const key = `skip.${reason}`;
		  const v = t(key);
		  return v === key ? reason : v;
		}
		function TaskCard(props) {
		  const { task } = props;
		  const last = task.executions[0];
		  const perm = task.pinned.permission ?? "read-only";
		  return (0, import_react3.createElement)(
		    "button",
		    { className: "dsh-cb-card", onClick: props.onOpen, type: "button" },
		    (0, import_react3.createElement)(
		      "div",
		      { className: "dsh-cb-card-title" },
		      task.needsConfirm && !task.confirmed ? (0, import_react3.createElement)(Badge, { tone: "warn" }, t("board.confirmHint")) : null,
		      (0, import_react3.createElement)("span", { className: "dsh-cb-card-title-text" }, task.title)
		    ),
		    (0, import_react3.createElement)(
		      "div",
		      { className: "dsh-cb-card-meta" },
		      (0, import_react3.createElement)("span", null, describeCron(task.cron, lang())),
		      task.enabled && task.nextRunAt ? (0, import_react3.createElement)("span", null, `${t("board.next")} ${fmtFuture(task.nextRunAt)}`) : null,
		      task.lastSkipReason ? (0, import_react3.createElement)("span", null, skipText(task.lastSkipReason)) : null
		    ),
		    (0, import_react3.createElement)(
		      "div",
		      { className: "dsh-cb-badges" },
		      (0, import_react3.createElement)(Badge, { tone: perm === "read-only" ? "default" : "warn" }, t(`perm.${perm}`)),
		      last ? (0, import_react3.createElement)(
		        Badge,
		        { tone: statusTone(last.status) },
		        (0, import_react3.createElement)(Dot, { tone: last.status === "running" ? "run" : dotTone(last.status) }),
		        ` ${t(`st.${last.status}`)}`
		      ) : (0, import_react3.createElement)(Badge, {}, (0, import_react3.createElement)(Dot, { tone: "idle" }), ` ${t("st.pending")}`),
		      task.push ? (0, import_react3.createElement)(Badge, { tone: "accent" }, `${t("board.channel")} · ${task.push.targetId}`) : null
		    )
		  );
		}
		function BoardPanel(props) {
		  const [snap, setSnap] = (0, import_react3.useState)(null);
		  const [meta, setMeta] = (0, import_react3.useState)(null);
		  const [err, setErr] = (0, import_react3.useState)(null);
		  const [search, setSearch] = (0, import_react3.useState)("");
		  const [detailId, setDetailId] = (0, import_react3.useState)(void 0);
		  const load = (0, import_react3.useCallback)(async () => {
		    const r = await props.rpc("cron-board/state");
		    if (r.ok) {
		      setSnap(r.value);
		      setErr(null);
		    } else {
		      setErr(r.error.message);
		    }
		  }, [props.rpc]);
		  (0, import_react3.useEffect)(() => {
		    void load();
		    const timer = setInterval(() => void load(), 5e3);
		    return () => clearInterval(timer);
		  }, [load]);
		  (0, import_react3.useEffect)(() => {
		    void (async () => {
		      const r = await props.rpc("cron-board/meta");
		      if (r.ok) setMeta(r.value);
		    })();
		  }, [props.rpc]);
		  const tasks = snap?.tasks ?? [];
		  const filtered = (0, import_react3.useMemo)(() => {
		    const q = search.trim().toLowerCase();
		    if (q === "") return tasks;
		    return tasks.filter((task) => task.title.toLowerCase().includes(q) || task.prompt.toLowerCase().includes(q));
		  }, [tasks, search]);
		  const drafts = filtered.filter((task) => !task.enabled);
		  const scheduled = filtered.filter((task) => task.enabled && !task.running);
		  const running = filtered.filter((task) => task.running);
		  const feed = (0, import_react3.useMemo)(
		    () => filtered.flatMap((task) => task.executions.map((exec) => ({ task, exec }))).slice(0, 12),
		    [filtered]
		  );
		  const detailTask = detailId ? tasks.find((task) => task.id === detailId) ?? null : null;
		  const column = (title, count, body) => (0, import_react3.createElement)(
		    "div",
		    { className: "dsh-cb-col", key: title },
		    (0, import_react3.createElement)("div", { className: "dsh-cb-col-head" }, title, (0, import_react3.createElement)("span", { className: "dsh-cb-col-count" }, String(count))),
		    (0, import_react3.createElement)("div", { className: "dsh-cb-col-body" }, body)
		  );
		  const emptyCell = (text) => (0, import_react3.createElement)("div", { className: "dsh-cb-col-empty" }, text);
		  const pushChannelBadge = snap ? (0, import_react3.createElement)(
		    Badge,
		    { tone: snap.pushChannel.mode === "service" ? "ok" : snap.pushChannel.mode === "unavailable" ? "warn" : "accent", title: snap.pushChannel.detail },
		    `${t("board.channel")}: ${t(`push.mode.${snap.pushChannel.mode}`)}`
		  ) : null;
		  return (0, import_react3.createElement)(
		    "div",
		    { className: "dsh-cb-root" },
		    (0, import_react3.createElement)(
		      "div",
		      { className: "dsh-cb-header" },
		      (0, import_react3.createElement)("h2", { className: "dsh-cb-title" }, t("board.title")),
		      pushChannelBadge,
		      snap ? (0, import_react3.createElement)("span", { className: "dsh-cb-sub" }, `${t("board.revision")} ${snap.revision}`) : null,
		      (0, import_react3.createElement)("div", { className: "dsh-cb-spacer" }),
		      (0, import_react3.createElement)(TextInput, { value: search, onChange: setSearch, placeholder: t("board.search") }),
		      (0, import_react3.createElement)(Btn, { kind: "primary", onClick: () => setDetailId(null) }, t("board.new"))
		    ),
		    err !== null ? (0, import_react3.createElement)(
		      "div",
		      { className: "dsh-cb-modal-body" },
		      (0, import_react3.createElement)("div", { className: "dsh-cb-errbox" }, `${t("board.loadFail")}: ${err}`),
		      (0, import_react3.createElement)(Btn, { onClick: () => void load() }, t("board.retry"))
		    ) : null,
		    (0, import_react3.createElement)(
		      "div",
		      { className: "dsh-cb-cols" },
		      column(`${t("col.draft")}`, drafts.length, drafts.length === 0 ? emptyCell(t("board.empty")) : drafts.map((task) => (0, import_react3.createElement)(TaskCard, { key: task.id, task, onOpen: () => setDetailId(task.id) }))),
		      column(`${t("col.scheduled")}`, scheduled.length, scheduled.length === 0 ? emptyCell(t("board.empty")) : scheduled.map((task) => (0, import_react3.createElement)(TaskCard, { key: task.id, task, onOpen: () => setDetailId(task.id) }))),
		      column(`${t("col.running")}`, running.length, running.length === 0 ? emptyCell(t("board.feedEmpty")) : running.map((task) => (0, import_react3.createElement)(TaskCard, { key: task.id, task, onOpen: () => setDetailId(task.id) }))),
		      column(`${t("col.recent")}`, feed.length, feed.length === 0 ? emptyCell(t("board.feedEmpty")) : feed.map(
		        ({ task, exec }) => (0, import_react3.createElement)(
		          "button",
		          { className: "dsh-cb-card", key: `${task.id}-${exec.id}`, onClick: () => setDetailId(task.id), type: "button" },
		          (0, import_react3.createElement)(
		            "div",
		            { className: "dsh-cb-card-title" },
		            (0, import_react3.createElement)(Dot, { tone: dotTone(exec.status) }),
		            (0, import_react3.createElement)("span", { className: "dsh-cb-card-title-text" }, task.title)
		          ),
		          (0, import_react3.createElement)(
		            "div",
		            { className: "dsh-cb-exec-meta" },
		            (0, import_react3.createElement)("span", null, `${t(`exec.trigger.${exec.trigger}`)} · ${t(`st.${exec.status}`)}`),
		            (0, import_react3.createElement)("span", null, fmtAgo(exec.endedAt ?? exec.startedAt)),
		            exec.durationMs !== void 0 ? (0, import_react3.createElement)("span", null, fmtDur(exec.durationMs)) : null,
		            exec.push ? (0, import_react3.createElement)("span", null, `${t("exec.push")}: ${t(`push.${exec.push.state}`)}`) : null
		          )
		        )
		      ))
		    ),
		    detailId !== void 0 ? (0, import_react3.createElement)(DetailModal, {
		      key: detailId ?? "new",
		      rpc: props.rpc,
		      snapshot: snap,
		      meta,
		      taskId: detailId,
		      onClose: () => setDetailId(void 0),
		      onChanged: () => void load()
		    }) : null,
		    meta && meta.pushMode === "unavailable" && tasks.some((task) => task.push) ? (0, import_react3.createElement)(
		      "div",
		      { className: "dsh-cb-modal-body", style: { paddingTop: 0 } },
		      (0, import_react3.createElement)("div", { className: "dsh-cb-notebox" }, t("push.unavailableHint"))
		    ) : null
		  );
		}
		
		// client/src/panel-icon.tsx
		var import_react4 = require("react");
		
		// client/src/env.ts
		function hostRequire(id) {
		  return require(id);
		}
		
		// client/src/panel-icon.tsx
		var PANEL_ID = "dsh-cron-board";
		var panelInfoHook = null;
		function usePanelInfoFactory() {
		  if (panelInfoHook === null) {
		    try {
		      const mod = hostRequire("@deepseek-ai/dsh-client-ui-layout/client");
		      panelInfoHook = typeof mod?.usePanelInfo === "function" ? mod.usePanelInfo : void 0;
		    } catch {
		      panelInfoHook = void 0;
		    }
		  }
		  return panelInfoHook;
		}
		function readActive(info) {
		  if (!info || typeof info !== "object") return false;
		  const o = info;
		  if (o.activePanelId !== void 0) return o.activePanelId === PANEL_ID;
		  if (typeof o.active === "boolean") return o.active;
		  if (typeof o.selected === "boolean") return o.selected;
		  return false;
		}
		var ICON = (0, import_react4.createElement)(
		  "svg",
		  {
		    viewBox: "0 0 24 24",
		    fill: "none",
		    stroke: "currentColor",
		    strokeWidth: 2,
		    strokeLinecap: "round",
		    strokeLinejoin: "round",
		    "aria-hidden": true
		  },
		  (0, import_react4.createElement)("path", { d: "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" }),
		  (0, import_react4.createElement)("path", { d: "M3 10h18" }),
		  (0, import_react4.createElement)("path", { d: "M8 2v4" }),
		  (0, import_react4.createElement)("path", { d: "M16 2v4" }),
		  (0, import_react4.createElement)("circle", { cx: "17", cy: "17", r: "5" }),
		  (0, import_react4.createElement)("path", { d: "M17 15v2l1.5 1.5" })
		);
		function PanelIcon(props) {
		  const factory = usePanelInfoFactory();
		  let active = false;
		  if (factory) {
		    try {
		      active = readActive(factory());
		    } catch {
		      active = false;
		    }
		  }
		  return (0, import_react4.createElement)(
		    "button",
		    {
		      className: `dsh-cb-icon-btn${active ? " dsh-cb-icon-active" : ""}`,
		      title: t("panel.label"),
		      "aria-label": t("panel.label"),
		      type: "button",
		      onClick: () => props.layout.selectPanel(active ? null : PANEL_ID)
		    },
		    ICON
		  );
		}
		
		// client/src/rpc.ts
		function makeRpc(ctx) {
		  return (endpoint, payload) => {
		    if (!ctx.connection || !ctx.connection.rpc) {
		      return Promise.reject(new Error("connection 服务不可用"));
		    }
		    return ctx.connection.rpc.call("/rpc", endpoint, payload ?? {});
		  };
		}
		
		// client/src/settings.tsx
		var import_react5 = require("react");
		function SettingsPanel(props) {
		  const [settings, setSettings] = (0, import_react5.useState)(null);
		  const [meta, setMeta] = (0, import_react5.useState)(null);
		  const [defaultPush, setDefaultPush] = (0, import_react5.useState)("");
		  const [busy, setBusy] = (0, import_react5.useState)(false);
		  const [note, setNote] = (0, import_react5.useState)(null);
		  const [err, setErr] = (0, import_react5.useState)(null);
		  (0, import_react5.useEffect)(() => {
		    void (async () => {
		      const s = await props.rpc("cron-board/settings");
		      if (s.ok) {
		        setSettings(s.value);
		        setDefaultPush(pushKeyOf(s.value.defaultPush));
		      } else {
		        setErr(s.error.message);
		      }
		      const m = await props.rpc("cron-board/meta");
		      if (m.ok) setMeta(m.value);
		    })();
		  }, []);
		  async function save() {
		    setBusy(true);
		    setErr(null);
		    setNote(null);
		    try {
		      const r = await props.rpc("cron-board/settings-set", { defaultPush: parsePushKey(defaultPush) });
		      if (r.ok) {
		        setSettings(r.value);
		        setNote(t("set.defaultPushSaved"));
		      } else {
		        setErr(r.error.message);
		      }
		    } finally {
		      setBusy(false);
		    }
		  }
		  return (0, import_react5.createElement)(
		    "div",
		    { className: "dsh-cb-set" },
		    (0, import_react5.createElement)("h3", null, t("set.title")),
		    (0, import_react5.createElement)("div", { className: "dsh-cb-hint" }, t("set.desc")),
		    err !== null ? (0, import_react5.createElement)("div", { className: "dsh-cb-errbox" }, err) : null,
		    note !== null ? (0, import_react5.createElement)("div", { className: "dsh-cb-notebox" }, note) : null,
		    (0, import_react5.createElement)(
		      "div",
		      { className: "dsh-cb-setbox" },
		      (0, import_react5.createElement)(
		        "div",
		        { className: "dsh-cb-setrow" },
		        (0, import_react5.createElement)("strong", { style: { fontSize: 12 } }, t("set.channel")),
		        settings ? (0, import_react5.createElement)(
		          Badge,
		          { tone: "accent" },
		          `${t("board.channel")}: http 127.0.0.1:${settings.httpPort} · retry ≤ ${settings.retryMax}`
		        ) : null
		      ),
		      (0, import_react5.createElement)(
		        Field,
		        { label: t("set.defaultPush"), hint: meta && meta.pushMode === "unavailable" ? t("push.unavailableHint") : void 0 },
		        (0, import_react5.createElement)(Select, {
		          value: defaultPush,
		          onChange: setDefaultPush,
		          options: [{ value: "", label: t("f.pushNone") }].concat(
		            (meta?.targets ?? []).map((target) => {
		              const bot = meta?.bots.find((b) => b.botId === target.botId);
		              return { value: `${target.botId}::${target.targetId}`, label: pushOptionLabel(target, bot?.channel) };
		            })
		          )
		        })
		      ),
		      (0, import_react5.createElement)("div", { className: "dsh-cb-row" }, (0, import_react5.createElement)(Btn, { kind: "primary", disabled: busy, onClick: () => void save() }, t("set.defaultPushSave")))
		    ),
		    settings ? (0, import_react5.createElement)(
		      "div",
		      { className: "dsh-cb-setbox" },
		      (0, import_react5.createElement)("strong", { style: { fontSize: 12 } }, t("set.params")),
		      (0, import_react5.createElement)("div", { className: "dsh-cb-hint" }, `schedulerTickMs = ${settings.schedulerTickMs}`),
		      (0, import_react5.createElement)("div", { className: "dsh-cb-hint" }, `runTimeoutMin = ${settings.runTimeoutMin}`),
		      (0, import_react5.createElement)("div", { className: "dsh-cb-hint" }, `resultsKeepPerTask = ${settings.resultsKeepPerTask}`),
		      (0, import_react5.createElement)("div", { className: "dsh-cb-hint" }, `executionsKeepPerTask = ${settings.executionsKeepPerTask}`),
		      (0, import_react5.createElement)("div", { className: "dsh-cb-hint" }, `${t("set.dataDir")}: ${settings.dataDir}`)
		    ) : null,
		    (0, import_react5.createElement)(
		      "div",
		      { className: "dsh-cb-setbox" },
		      (0, import_react5.createElement)("strong", { style: { fontSize: 12 } }, t("set.hint.title")),
		      (0, import_react5.createElement)(
		        "ul",
		        { className: "dsh-cb-setlist" },
		        (0, import_react5.createElement)("li", null, t("set.hint.1")),
		        (0, import_react5.createElement)("li", null, t("set.hint.2")),
		        (0, import_react5.createElement)("li", null, t("set.hint.3")),
		        (0, import_react5.createElement)("li", null, t("set.hint.4")),
		        (0, import_react5.createElement)("li", null, t("set.hint.5"))
		      )
		    )
		  );
		}
		
		// client/src/entry.tsx
		var inject = ["slots", "connection", "layout", "locale"];
		function apply(ctx) {
		  const rpc = makeRpc(ctx);
		  initI18n(ctx);
		  ensureThemeStyle();
		  ctx.slots.inject("sidebar.panellist", () => {
		    return ctx.slots.register(
		      {
		        name: "sidebar.panellist",
		        id: PANEL_ID,
		        order: 60,
		        label: () => t("panel.label"),
		        inject: () => ({ layout: ctx.layout })
		      },
		      PanelIcon
		    );
		  });
		  ctx.slots.inject("main", () => {
		    return ctx.slots.register(
		      {
		        name: "main",
		        key: PANEL_ID,
		        inject: () => ({ rpc })
		      },
		      BoardPanel
		    );
		  });
		  ctx.slots.inject("settings.section", () => {
		    return ctx.slots.register(
		      {
		        name: "settings.section",
		        id: PANEL_ID,
		        order: 210,
		        label: () => t("panel.label"),
		        inject: () => ({ rpc })
		      },
		      SettingsPanel
		    );
		  });
		}
		
		// esbuild 对具名导出会整体替换 module.exports（__toCommonJS：getter + __esModule）；
		// 摊平回官方 bundle 同款的普通数据属性对象（含 toStringTag），loader 只按属性读取。
		var __flat = {};
		for (var __k in module.exports) __flat[__k] = module.exports[__k];
		Object.defineProperty(__flat, Symbol.toStringTag, { value: "Module" });
		return __flat;
	}
});

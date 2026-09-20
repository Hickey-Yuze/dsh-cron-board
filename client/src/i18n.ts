/**
 * 客户端 i18n 层：探测宿主 locale 服务（inject 声明，核心服务），zh/en 字典；
 * 缺键回退 zh。所有用户可见文案必须经 t()；带参用 tpl()（{n}/{s} 占位符）。
 */

const zh: Record<string, string> = {
  'panel.label': '定时任务',
  'board.title': '定时任务看板',
  'board.new': '新建任务',
  'board.search': '搜索任务…',
  'board.channel': '推送',
  'board.revision': '版本',
  'board.loadFail': '看板数据加载失败',
  'board.retry': '重试',
  'board.empty': '暂无任务，点击「新建任务」创建',
  'board.runFeed': '最近执行',
  'board.feedEmpty': '还没有执行记录',
  'board.next': '下次',
  'board.lastRun': '上次',
  'board.confirmHint': '权限待确认',
  'board.archived': '已归档',
  'board.archivedEmpty': '没有归档任务',
  'board.projectAll': '全部项目',
  'board.archivedBack': '返回看板',
  'board.openSession': '打开会话',
  'board.other': '其他',
  'board.noTask': '暂无任务，点击「+」添加',

  'stat.todo': '待执行',
  'stat.running': '进行中',
  'stat.completed': '已完成',
  'stat.logs': '日志',
  'stat.tasks': '项任务',
  'stat.recentLogs': '条记录',
  'stat.vsYesterday': '较昨日',

  'task.low': '低',

  'col.draft': '草稿',
  'col.scheduled': '已排程',
  'col.running': '运行中',
  'col.recent': '最近执行',

  'st.running': '运行中',
  'st.success': '成功',
  'st.failed': '失败',
  'st.timeout': '超时',
  'st.canceled': '已取消',
  'st.pending': '待执行',

  'push.sent': '已送达',
  'push.failed': '未送达',
  'push.disabled': '未配置',
  'push.mode.service': 'dshIm 服务',
  'push.mode.unavailable': '未接通',
  'push.unavailableHint': 'dsh-im 未部署：推送将标记未送达，部署后自动恢复；结果仍会正常落盘。',

  'skip.missed-trigger-skipped': '错过的触发已跳过',
  'skip.task-running-skipped': '运行中跳过本次',
  'skip.awaiting-confirmation': '权限待确认，跳过本次',
  'skip.invalid-cron': 'cron 表达式无效',
  'skip.archived': '任务已归档',

  'perm.read-only': '只读',
  'perm.workspace-write': '工作区可写',
  'perm.danger-full-access': '完全访问',

  'act.run': '立即执行',
  'act.save': '保存',
  'act.cancel': '取消',
  'act.delete': '删除',
  'act.edit': '编辑',
  'act.close': '关闭',
  'act.confirm': '确认权限',
  'act.testPush': '测试推送',
  'act.retryPush': '补推',
  'act.viewResult': '结果',
  'act.archive': '归档',
  'act.restore': '恢复',
  'act.enable': '启用',
  'act.disable': '停用',

  'f.title': '标题',
  'f.titlePh': '例：每日运营周报',
  'f.prompt': '任务 Prompt',
  'f.promptPh': '到达触发点后，将以独立会话发送给 agent 执行的完整指令…',
  'f.cron': 'Cron 表达式（分 时 日 月 周）',
  'f.cronFields': 'Cron 字段（如 */5 表示每 5 个）',
  'f.cronField.min': '分钟',
  'f.cronField.hour': '小时',
  'f.cronField.dom': '日',
  'f.cronField.mon': '月',
  'f.cronField.dow': '星期',
  'f.cronPreview': '无匹配描述，将按表达式原文展示',
  'f.reuseSession': '延续上次会话',
  'f.reuseHint': '开启时在上一会话继续执行；关闭则每次新建独立会话',
  'f.enableAfterSave': '保存后启用排程',
  'f.enableHint': '勾选后任务立即进入已排程列；取消则留在草稿',
  'f.tags': '标签（最多 8 个）',
  'f.tagName': '标签名',
  'f.tagPrefix': '执行提示（可选，注入 Prompt 前）',
  'f.tagAdd': '添加标签',
  'f.tagRemove': '移除',
  'f.aiParse': 'AI 解析',
  'f.aiParsing': '解析中…',
  'f.aiPlaceholder': '粘贴一段话，AI 整理成任务的标题与 Prompt…',
  'f.aiHint': '解析结果只填进表单，确认保存前不会创建任务',
  'f.workspace': '钉住工作区（可选）',
  'f.workspaceDefault': '跟随默认',
  'f.preset': '钉住 agent 预设（可选）',
  'f.presetDefault': '不更改',
  'f.permission': '权限档',
  'f.permissionDefault': '跟随默认（read-only）',
  'f.push': '推送目标',
  'f.pushNone': '不推送',

  'gate.title': '权限确认门',
  'gate.body': '该任务的有效权限高于默认档（read-only）。首次定时触发前需要在此人工确认一次；权限、Prompt、预设或工作区任一变更后需重新确认。未确认时 cron 会跳过并滚动到下一次触发点。',
  'gate.confirmed': '已确认，允许无人值守执行',
  'gate.needConfirm': '待确认',

  'exec.trigger.manual': '手动',
  'exec.trigger.cron': '定时',
  'exec.duration': '耗时',
  'exec.push': '推送',
  'exec.noResult': '结果文件不存在或已按保留策略清理',
  'exec.resultTitle': '执行结果',

  'dl.newTitle': '新建定时任务',
  'dl.editTitle': '编辑任务',
  'dl.deleteConfirm': '确定删除该任务？执行历史与结果文件将一并清除。',
  'dl.saved': '已保存',
  'dl.saveFail': '保存失败',
  'dl.runQueued': '已开始执行',
  'dl.pushTested': '测试消息已发送',
  'dl.confirmed': '已确认，定时执行已放行',
  'dl.ranOnce': '该任务已执行过，修改后确认门将重新武装',
  'dl.archived': '任务已归档（只读）：恢复后才能编辑或执行',
  'dl.restored': '任务已恢复（默认停用，按需启用）',
  'dl.duplicateConfirm': '已存在同名任务，仍要保存这条重复的吗？',
  'dl.duplicateBlocked': '已存在同名任务，请先编辑或删除已有任务再保存',

  'set.title': '定时任务看板',
  'set.desc': 'cron 定时 agent 会话任务 + 执行终态机器人推送。看板入口在左侧栏。',
  'set.channel': '推送通道',
  'set.defaultPush': '全局默认推送目标',
  'set.defaultPushSave': '保存默认目标',
  'set.defaultPushSaved': '已保存',
  'set.params': '调度与保留',
  'set.dataDir': '数据目录',
  'set.hint.title': '使用说明',
  'set.hint.1': '任务到点后新建独立 DSH 会话执行，会话终态即任务终态。',
  'set.hint.2': '高于默认权限档的任务需在看板确认一次，cron 才会无人值守执行。',
  'set.hint.3': '错过的触发不补跑；同任务运行中到点跳过并滚动。',
  'set.hint.4': '推送目标来自 dsh-im 的「调用标识 botId + 目标 targetId」。',
  'set.hint.5': '本插件数据独立存放，不读写宿主 .dsh/cron。',

  'ago.now': '刚刚',
  'ago.min': '{n} 分钟前',
  'ago.hour': '{n} 小时前',
  'ago.day': '{n} 天前',
  'ago.future': '{s} 后',
};

const en: Record<string, string> = {
  'panel.label': 'Cron Board',
  'board.title': 'Cron Task Board',
  'board.new': 'New Task',
  'board.search': 'Search tasks…',
  'board.channel': 'Push',
  'board.revision': 'rev',
  'board.loadFail': 'Failed to load board data',
  'board.retry': 'Retry',
  'board.empty': 'No tasks yet — click "New Task" to create one',
  'board.runFeed': 'Recent runs',
  'board.feedEmpty': 'No executions yet',
  'board.next': 'Next',
  'board.lastRun': 'Last',
  'board.confirmHint': 'Confirm required',
  'board.archived': 'Archived',
  'board.archivedEmpty': 'No archived tasks',
  'board.projectAll': 'All projects',
  'board.archivedBack': 'Back to board',
  'board.openSession': 'Open session',
  'board.other': 'Other',
  'board.noTask': 'No tasks yet, click "+" to add',

  'stat.todo': 'Pending',
  'stat.running': 'In Progress',
  'stat.completed': 'Completed',
  'stat.logs': 'Logs',
  'stat.tasks': 'tasks',
  'stat.recentLogs': 'records',
  'stat.vsYesterday': 'vs yesterday',

  'task.low': 'Low',

  'col.draft': 'Draft',
  'col.scheduled': 'Scheduled',
  'col.running': 'Running',
  'col.recent': 'Recent runs',

  'st.running': 'Running',
  'st.success': 'Success',
  'st.failed': 'Failed',
  'st.timeout': 'Timeout',
  'st.canceled': 'Canceled',
  'st.pending': 'Pending',

  'push.sent': 'Sent',
  'push.failed': 'Not sent',
  'push.disabled': 'No target',
  'push.mode.service': 'dshIm service',
  'push.mode.unavailable': 'Not connected',
  'push.unavailableHint':
    'dsh-im not deployed: pushes will be marked not-sent and recover automatically once deployed; results are still archived.',

  'skip.missed-trigger-skipped': 'Missed trigger skipped',
  'skip.task-running-skipped': 'Skipped while running',
  'skip.awaiting-confirmation': 'Skipped: awaiting confirmation',
  'skip.invalid-cron': 'Invalid cron expression',
  'skip.archived': 'Task archived',

  'perm.read-only': 'Read-only',
  'perm.workspace-write': 'Workspace write',
  'perm.danger-full-access': 'Full access',

  'act.run': 'Run now',
  'act.save': 'Save',
  'act.cancel': 'Cancel',
  'act.delete': 'Delete',
  'act.edit': 'Edit',
  'act.close': 'Close',
  'act.confirm': 'Confirm permission',
  'act.testPush': 'Test push',
  'act.retryPush': 'Retry push',
  'act.viewResult': 'Result',
  'act.archive': 'Archive',
  'act.restore': 'Restore',
  'act.enable': 'Enable',
  'act.disable': 'Disable',

  'f.title': 'Title',
  'f.titlePh': 'e.g. Daily ops report',
  'f.prompt': 'Task prompt',
  'f.promptPh': 'Full instruction sent to a fresh agent session when triggered…',
  'f.cron': 'Cron (min hour dom month dow)',
  'f.cronFields': 'Cron fields (e.g. */5 = every 5th)',
  'f.cronField.min': 'Minute',
  'f.cronField.hour': 'Hour',
  'f.cronField.dom': 'Day',
  'f.cronField.mon': 'Month',
  'f.cronField.dow': 'Weekday',
  'f.cronPreview': 'No human description — shown as raw expression',
  'f.reuseSession': 'Reuse last session',
  'f.reuseHint': 'Continue in the previous session when on; off starts a fresh session each run',
  'f.enableAfterSave': 'Enable scheduling after save',
  'f.enableHint': 'Check to move the task to Scheduled immediately; uncheck to keep it in Drafts',
  'f.tags': 'Tags (up to 8)',
  'f.tagName': 'Tag name',
  'f.tagPrefix': 'Prompt hint (optional, prepended to prompt)',
  'f.tagAdd': 'Add tag',
  'f.tagRemove': 'Remove',
  'f.aiParse': 'AI parse',
  'f.aiParsing': 'Parsing…',
  'f.aiPlaceholder': 'Paste some text and let AI shape it into a task…',
  'f.aiHint': 'Parse only fills the form — nothing is created until you save',
  'f.workspace': 'Pin workspace (optional)',
  'f.workspaceDefault': 'Follow default',
  'f.preset': 'Pin agent preset (optional)',
  'f.presetDefault': 'Keep current',
  'f.permission': 'Permission',
  'f.permissionDefault': 'Follow default (read-only)',
  'f.push': 'Push target',
  'f.pushNone': 'No push',

  'gate.title': 'Permission confirmation gate',
  'gate.body':
    'This task runs above the default permission (read-only). Confirm once here before its first scheduled trigger; any change to permission, prompt, preset or workspace re-arms the gate. Unconfirmed tasks are skipped and rolled forward by cron.',
  'gate.confirmed': 'Confirmed — unattended runs allowed',
  'gate.needConfirm': 'Awaiting confirmation',

  'exec.trigger.manual': 'Manual',
  'exec.trigger.cron': 'Cron',
  'exec.duration': 'Duration',
  'exec.push': 'Push',
  'exec.noResult': 'Result file missing or pruned by retention policy',
  'exec.resultTitle': 'Execution result',

  'dl.newTitle': 'New scheduled task',
  'dl.editTitle': 'Edit task',
  'dl.deleteConfirm': 'Delete this task? History and result files will be removed.',
  'dl.saved': 'Saved',
  'dl.saveFail': 'Save failed',
  'dl.runQueued': 'Execution started',
  'dl.pushTested': 'Test message sent',
  'dl.confirmed': 'Confirmed — cron may run unattended',
  'dl.ranOnce': 'This task has run before; editing re-arms the confirmation gate',
  'dl.archived': 'Task is archived (read-only): restore it to edit or run',
  'dl.restored': 'Task restored (disabled by default — enable when needed)',
  'dl.duplicateConfirm': 'A task with the same title already exists — save this duplicate anyway?',
  'dl.duplicateBlocked': 'A task with the same title already exists — edit or delete the existing one first',

  'set.title': 'Cron Task Board',
  'set.desc': 'Scheduled agent-session tasks via cron, with bot push on completion. The board lives in the sidebar.',
  'set.channel': 'Push channel',
  'set.defaultPush': 'Global default push target',
  'set.defaultPushSave': 'Save default target',
  'set.defaultPushSaved': 'Saved',
  'set.params': 'Scheduling & retention',
  'set.dataDir': 'Data directory',
  'set.hint.title': 'Notes',
  'set.hint.1': 'Each run creates a fresh DSH session; the session turn end settles the task.',
  'set.hint.2': 'Tasks above the default permission need one confirmation before unattended cron runs.',
  'set.hint.3': 'Missed triggers are never re-queued; running tasks skip and roll forward.',
  'set.hint.4': 'Push targets come from dsh-im: botId + targetId.',
  'set.hint.5': 'Data is stored independently; the host .dsh/cron directory is never touched.',

  'ago.now': 'just now',
  'ago.min': '{n} min ago',
  'ago.hour': '{n} h ago',
  'ago.day': '{n} d ago',
  'ago.future': 'in {s}',
};

const dicts: Record<string, Record<string, string>> = { zh, en };

let currentLang: 'zh' | 'en' = 'zh';

/** 宿主 locale 服务绑定的翻译函数（语言切换/回退链全部由宿主管）。 */
let hostT: ((key: string) => string) | null = null;

function normalizeLang(snapshot: unknown): 'zh' | 'en' {
  const snap = snapshot as { id?: unknown; locale?: unknown; language?: unknown; tag?: unknown } | null | undefined;
  const raw =
    [snap?.id, snap?.locale, snap?.language, snap?.tag].find((v) => typeof v === 'string' && v !== '') ?? '';
  // 探测不到（空值）默认 zh：describeCron 等直调 lang() 的场景在宿主 locale API 缺失时保持中文
  if (raw === '') return 'zh';
  return String(raw).toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const NS = 'cron-board';

interface LocaleLike {
  getLocale?(): unknown;
  getSnapshot?(): unknown;
  subscribe?(fn: () => void): unknown;
  register?(ns: string, dicts: Record<string, Record<string, string>>): unknown;
  bind?(ns: string): (key: string) => string;
}

export function initI18n(ctx: { locale?: LocaleLike }): void {
  const locale = ctx?.locale;
  if (!locale) return;
  // 首选官方模式：字典注册进宿主（ctx.locale.register(ns, {zh,en}) + bind(ns) → t），
  // 语言选择、缺键回退链（entry ns → common ns → key）全部由宿主 LocaleRuntime 管理。
  if (typeof locale.register === 'function' && typeof locale.bind === 'function') {
    try {
      locale.register(NS, { zh, en });
      const bound = locale.bind(NS);
      if (typeof bound === 'function') hostT = (key) => bound(key);
    } catch {
      hostT = null;
    }
  }
  // 本地 fallback：宿主 API 缺失时按 snapshot 探测语言，默认 zh
  try {
    const snap = typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : locale.getLocale?.();
    currentLang = normalizeLang(snap);
  } catch {
    currentLang = 'zh';
  }
  try {
    locale.subscribe?.(() => {
      try {
        const snap = typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : locale.getLocale?.();
        currentLang = normalizeLang(snap);
      } catch {
        /* 保持当前语言 */
      }
    });
  } catch {
    /* 无订阅能力则静态语言 */
  }
}

export function lang(): 'zh' | 'en' {
  return currentLang;
}

export function t(key: string): string {
  if (hostT) {
    try {
      const v = hostT(key);
      // 宿主缺键会回显 key 本身——此时退回本地字典（缺键回退 zh）
      if (typeof v === 'string' && v !== '' && v !== key) return v;
    } catch {
      /* 落入本地字典 */
    }
  }
  return dicts[currentLang]?.[key] ?? dicts.zh?.[key] ?? key;
}

export function tpl(key: string, params: Record<string, string | number>): string {
  let s = t(key);
  for (const [k, v] of Object.entries(params)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

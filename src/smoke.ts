/**
 * 冒烟测试（不依赖 DSH 运行时，纯 assert；`pnpm run smoke` = build + build:smoke + node）。
 * 覆盖：cron 解析/调度推算/描述、确认门状态机、账本串行与损坏防护、结果存档保留、
 * 推送适配器三级降级与简讯模板、RPC 载荷校验、dist/client.js 产物协议断言。
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { cronNextRun, describeCron, isValidCron, parseCron } from './cron.js';
import type { Execution, TaskRow } from './contract.js';
import { confirmFingerprint, gateDecision, isConfirmed, needsConfirm } from './gatekeeper.js';
import { LedgerStore, type BoardTask } from './ledger.js';
import { extractJsonObject } from './parse.js';
import { Pusher, dingtalkFormatSafe, type DshImLike } from './pusher.js';
import { ResultStore } from './results.js';
import { collectSessionMap, normalizeBadge, normalizeDraft, normalizeTags } from './rpc.js';
import { resolveBadgeColor } from './contract.js';
import { buildPromptWithTags, TaskRunner } from './runner.js';
import { newSessionId, newTaskId } from './util.js';

let section = 0;
function ok(cond: unknown, msg: string): void {
  assert.ok(cond, `#${section} ${msg}`);
}
function eq<T>(a: T, b: T, msg: string): void {
  assert.equal(a, b, `#${section} ${msg}`);
}
function throws(fn: () => void, msg: string): void {
  assert.throws(fn, Error, `#${section} ${msg}`);
}

function makeTask(patch: Partial<TaskRow> = {}): TaskRow {
  const now = new Date().toISOString();
  return {
    id: newTaskId(),
    title: '测试任务',
    prompt: '做一件事',
    cron: '0 9 * * *',
    enabled: false,
    pinned: {},
    push: null,
    confirm: null,
    nextRunAt: null,
    lastSkipReason: null,
    lastPushTest: null,
    createdAt: now,
    updatedAt: now,
    executions: [],
    ...patch,
  };
}

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'cron-board-smoke-'));
}

function now2(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  // ── 1. cron 解析 ──
  section = 1;
  ok(isValidCron('0 9 * * *'), '基本表达式合法');
  ok(isValidCron('*/15 8-18 * * 1-5'), '范围+步长合法');
  ok(isValidCron('0 0 1,15 * 0'), '列表+周日合法');
  ok(!isValidCron('0 9 * *'), '段数不足拒绝');
  ok(!isValidCron('60 * * * *'), '分钟越界拒绝');
  ok(!isValidCron('* * * 13 *'), '月份越界拒绝');
  eq(parseCron('0 9 * * 7').dow.has(0), true, '周日 7 归一为 0');
  eq(parseCron('* * * * *').domWild, true, '通配标志');
  eq(parseCron('* * * * 1-5').dowWild, false, '受限周非通配');

  // ── 2. nextRun 推算（本地时区固定日期，避开 DST 交界月）──
  section = 2;
  const from = new Date(2026, 0, 1, 10, 30, 0);
  const daily9 = cronNextRun('0 9 * * *', from);
  ok(daily9 !== null && daily9.getDate() === 2 && daily9.getHours() === 9 && daily9.getMinutes() === 0, '每天 09:00 → 次日 09:00');
  const every15 = cronNextRun('*/15 * * * *', from);
  ok(every15 !== null && every15.getHours() === 10 && every15.getMinutes() === 45, '*/15 → 10:45');
  const monday = cronNextRun('30 8 * * 1', new Date(2026, 0, 5, 12, 0, 0)); // 2026-01-05 是周一
  ok(monday !== null && monday.getDate() === 12 && monday.getDay() === 1, '周一 08:30 → 下周一');
  const orCase = cronNextRun('0 12 1 * 0', new Date(2026, 0, 2, 0, 0, 0)); // dom=1 或 周日
  ok(orCase !== null && orCase.getDate() === 4 && orCase.getDay() === 0, 'dom/dow OR：1月4日（周日）触发');

  // ── 3. describeCron ──
  section = 3;
  eq(describeCron('30 8 * * *', 'zh'), '每天 08:30', '每天描述');
  eq(describeCron('0 9 * * 1', 'zh'), '每周一 09:00', '每周描述');
  eq(describeCron('*/20 * * * *', 'zh'), '每 20 分钟', '间隔描述');
  eq(describeCron('0 */3 * * *', 'zh'), '每 3 小时', '小时间隔描述');
  eq(describeCron('0 9 1 * *', 'zh'), '每月 1 日 09:00', '每月描述');
  eq(describeCron('30 8 * * *', 'en'), 'Daily at 08:30', '英文描述');
  eq(describeCron('5 6 2 3 *', 'zh'), '5 6 2 3 *', '复杂表达式回退原文');

  // ── 4. 确认门 ──
  section = 4;
  const t1 = makeTask({ pinned: { permission: 'read-only' } });
  eq(needsConfirm(t1, 'read-only'), false, 'read-only 不需确认');
  const t2 = makeTask({ pinned: { permission: 'workspace-write' } });
  eq(needsConfirm(t2, 'read-only'), true, '提权需确认');
  eq(gateDecision(t2, 'read-only'), 'awaiting-confirmation', '未确认拒绝');
  t2.confirm = { fingerprint: confirmFingerprint(t2), confirmedAt: new Date().toISOString() };
  eq(gateDecision(t2, 'read-only'), 'allow', '确认后放行');
  const before = t2.confirm.fingerprint;
  t2.prompt = '改成另一件事';
  eq(isConfirmed(t2), false, 'Prompt 变更 → 指纹失效重新武装');
  t2.confirm = { fingerprint: before, confirmedAt: new Date().toISOString() };
  t2.pinned = { permission: 'danger-full-access' };
  eq(isConfirmed(t2), false, '权限变更 → 指纹失效');

  // ── 5. 账本 ──
  section = 5;
  const dir = await tempDir();
  const logs: string[] = [];
  const logger = { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) };
  const ledger = new LedgerStore(dir, 2, logger);
  await ledger.init();
  eq(ledger.snapshot.revision, 0, '空账本 revision 0');
  const created = await ledger.mutate<string>((doc) => {
    const t = makeTask();
    doc.tasks.push(t);
    return t.id;
  });
  ok(created.value.length > 0, 'mutate 返回值透传');
  ok(ledger.snapshot.revision >= 1, 'revision 递增');
  eq(ledger.snapshot.tasks.length, 1, '任务已入账');
  // 有界历史
  const task = ledger.snapshot.tasks[0] as BoardTask;
  await ledger.mutate((doc) => {
    const t = doc.tasks.find((x) => x.id === task.id) as BoardTask;
    for (let i = 0; i < 5; i++) {
      const exec: Execution = {
        id: `exec-${i}`,
        trigger: 'manual',
        sessionId: 's',
        status: 'success',
        startedAt: now2(),
      };
      LedgerStore.pushExecution(t, exec, 2);
    }
  });
  eq((ledger.snapshot.tasks[0] as BoardTask).executions.length, 2, '执行历史裁剪到上限 2');
  eq((ledger.snapshot.tasks[0] as BoardTask).executions[0]?.id, 'exec-4', '保留最新');
  // 持久化落盘后可重载
  await new Promise((r) => setTimeout(r, 80));
  const reloaded = new LedgerStore(dir, 20, logger);
  await reloaded.init();
  eq(reloaded.snapshot.tasks.length, 1, '重启后账本恢复');
  // 损坏防护
  const corruptDir = await tempDir();
  await fs.writeFile(path.join(corruptDir, 'ledger.json'), '{"schemaVersion":1,"tasks":"not-an-array"}', 'utf8');
  const corrupted = new LedgerStore(corruptDir, 20, logger);
  await corrupted.init();
  eq(corrupted.snapshot.tasks.length, 0, '损坏账本以空账本启动');
  const corruptFiles = (await fs.readdir(corruptDir)).filter((n) => n.includes('corrupt'));
  eq(corruptFiles.length, 1, '损坏文件已防碰撞改名保留');

  // ── 6. 结果存档 ──
  section = 6;
  const results = new ResultStore(dir);
  const t = ledger.snapshot.tasks[0] as BoardTask;
  const exec: Execution = {
    id: 'exec-result-1',
    trigger: 'cron',
    sessionId: 'abc123def456',
    status: 'success',
    startedAt: now2(),
    endedAt: now2(),
    durationMs: 65000,
    exitReason: 'completed',
  };
  const file = await results.write(t, exec, '# 周报\n\n本周完成 X。');
  ok(file.includes(path.join('results', t.id)), '结果写入任务子目录');
  const back = await results.read(t.id, exec.id);
  ok(back !== undefined && back.includes('# 周报') && back.includes('status: success'), '结果可读且带 front matter');
  const traversal = await results.read('..', 'evil');
  eq(traversal, undefined, '路径穿越拒绝');
  await results.write(t, { ...exec, id: 'exec-older-a' }, '旧结果 A');
  await results.write(t, { ...exec, id: 'exec-older-b' }, '旧结果 B');
  await results.prune(t.id, 2, exec.id);
  const kept = await results.read(t.id, 'exec-older-a');
  eq(kept, undefined, '保留裁剪删除最旧');

  // ── 7. 推送适配器 ──
  section = 7;
  const unavailable = new Pusher(() => undefined, { httpPort: 59999, retryMax: 2 }, logger);
  eq(unavailable.channelView().mode, 'unavailable', '无服务无 HTTP → unavailable');
  const brief = unavailable.briefFor({ ok: true, title: '周报', status: 'success', durationMs: 65000, resultPath: 'C:\\r\\1.md', content: '本周完成 X。' });
  ok(brief.includes('✅') && brief.includes('周报') && brief.includes('1 分 5 秒') && brief.includes('本周完成 X。'), '成功简讯模板');
  ok(!brief.includes('C:\\r\\1.md') && !brief.includes('已存档') && !brief.includes('dsh-cron-board'), '简讯不落本地路径、不署名');
  const briefNoBody = unavailable.briefFor({ ok: true, title: '周报', status: 'success', durationMs: 65000, resultPath: 'C:\\r\\1.md' });
  ok(briefNoBody.includes('C:\\r\\1.md'), '无正文时兜底给结果路径');
  const briefFail = unavailable.briefFor({ ok: false, title: '同步', status: 'failed', reason: 'error', durationMs: 1000 });
  ok(briefFail.includes('❌') && briefFail.includes('error') && !briefFail.includes('dsh-cron-board'), '失败简讯模板（含原因、无署名）');
  const enBrief = unavailable.briefFor({ ok: true, title: 'weekly', status: 'success', durationMs: 65000, lang: 'en' });
  ok(enBrief.includes('Duration: 1m 5s') && !enBrief.includes('— dsh-cron-board'), '英文简讯');
  // dsh-ui 围栏清洗：JSON 卡片 → 纯文本文案（2026-10-17 汇报任务 JSON 漏出实测）
  const fenced = unavailable.briefFor({
    ok: true,
    title: '汇报',
    status: 'success',
    content:
      '前导文本\n```dsh-ui\n{"gap":12,"items":[{"type":"copy","label":"已发送的汇报文案","text":"截止今日11:20分数据，通过555单"},{"type":"callout","tone":"success","title":"说明","content":"文件为新导出"}]}\n```',
  });
  ok(!fenced.includes('```dsh-ui') && !fenced.includes('"items"'), '简讯不漏 dsh-ui 围栏与 JSON 源码');
  ok(fenced.includes('已发送的汇报文案') && fenced.includes('截止今日11:20分数据') && fenced.includes('文件为新导出'), 'dsh-ui 卡片文案已提取为纯文本');
  const briefBad = unavailable.briefFor({ ok: true, title: '汇报', status: 'success', content: '```dsh-ui\n{broken json\n```' });
  ok(!briefBad.includes('```dsh-ui') && briefBad.includes('已省略'), '坏 JSON 降级占位提示');
  // 结构感知：keyvalue 键值成对、table 行内「｜」连接（2026-10-17 货源播报拆散实测）
  const briefStruct = unavailable.briefFor({
    ok: true,
    title: '货源',
    status: 'success',
    content:
      '```dsh-ui\n{"items":[{"type":"keyvalue","pairs":[{"key":"iPhone18系列同步群","value":"13"},{"key":"备用群","value":"33"}]},{"type":"table","columns":["型号","仅激活库存","状态要点"],"rows":[["18Pro 合计","139 台","256/512 充足主推"]]}]}\n```',
  });
  ok(briefStruct.includes('iPhone18系列同步群') && briefStruct.includes('13') && briefStruct.includes('备用群'), 'keyvalue 键值成对');
  ok(briefStruct.includes('| 型号 | 仅激活库存 | 状态要点 |') && briefStruct.includes('| 18Pro 合计 | 139 台 | 256/512 充足主推 |'), 'table 输出 GFM 管道表');
  // 围栏形态容错（2026-10-24 钉钉实测「变成 Plain Text 源码」）：
  // 同行 JSON / 标识带修饰 / JSON 后夹说明文字，围栏与 JSON 都不得漏到 IM。
  const fenceSameLine = unavailable.briefFor({
    ok: true,
    title: '同行',
    status: 'success',
    content: '```dsh-ui {"gap":14,"items":[{"type":"text","content":"同行写法内容"}]} ```',
  });
  ok(!fenceSameLine.includes('dsh-ui') && !fenceSameLine.includes('"items"') && fenceSameLine.includes('同行写法内容'), 'dsh-ui 同行 JSON 写法也被清洗');
  const fenceTrailing = unavailable.briefFor({
    ok: true,
    title: '尾注',
    status: 'success',
    content: '```dsh-ui\n{"items":[{"type":"text","content":"核心内容"}]}\n这是围栏后的说明\n```',
  });
  ok(!fenceTrailing.includes('dsh-ui') && !fenceTrailing.includes('"items"') && fenceTrailing.includes('核心内容'), 'JSON 后夹说明文字时围栏仍被清洗');
  const fenceNested = unavailable.briefFor({
    ok: true,
    title: '嵌套',
    status: 'success',
    content: '```dsh-ui\n{"items":[{"type":"copy","label":"代码","text":"function f(){ return 1; }"}]}\n```',
  });
  ok(!fenceNested.includes('"items"') && fenceNested.includes('function f(){ return 1; }'), 'JSON 字符串内含花括号时仍能完整解析');
  const fencePlainCode = unavailable.briefFor({
    ok: true,
    title: '代码',
    status: 'success',
    content: '```js\nconst a = 1;\n```',
  });
  ok(fencePlainCode.includes('const a = 1;'), '普通代码块围栏原样保留');
  // 长正文不截断（推送改为 markdown 后由 dsh-im 分段；旧的 1200 字节硬截断已删除）
  const longBody = '第'.repeat(3000);
  const briefLong = unavailable.briefFor({ ok: true, title: '长文', status: 'success', content: longBody });
  ok(briefLong.includes(longBody), '长正文完整保留，不做本地截断');
  ok(!briefLong.includes('内容过长已截断'), '不再出现「内容过长已截断」提示');
  // 服务直调成功（并校验 format 透传给 dsh-im）
  const sent: Array<{ botId: string; targetId: string; text: string; opts?: Record<string, unknown> }> = [];
  const svc: DshImLike = {
    send: async (botId, targetId, text, opts) => {
      sent.push(opts === undefined ? { botId, targetId, text } : { botId, targetId, text, opts });
      return { sent: true };
    },
  };
  const pusherSvc = new Pusher(() => svc, { httpPort: 59999, retryMax: 3 }, logger);
  eq(pusherSvc.channelView().mode, 'service', 'dshIm 服务探测');
  const okRec = await pusherSvc.send('bot_x', 'tgt_y', 'hello');
  eq(okRec.state, 'sent', '服务直调成功');
  eq(okRec.attempts, 1, '一次成功');
  eq(sent.length, 1, '调用一次');
  eq(sent[0]?.opts?.['format'], 'markdown', '推送以 markdown 格式下发（与 dsh-im 一致）');
  // 全部失败：重试上限 + failed 状态
  const alwaysFail: DshImLike = { send: async () => ({ sent: false }) };
  const pusherFail = new Pusher(() => alwaysFail, { httpPort: 59999, retryMax: 3 }, logger);
  const failRec = await pusherFail.send('bot_x', 'tgt_y', 'hello');
  eq(failRec.state, 'failed', '重试耗尽标记失败');
  eq(failRec.attempts, 3, '重试 3 次');
  ok(failRec.lastError !== undefined, '记录最后错误');

  // ── 8. RPC 载荷校验 ──
  section = 8;
  const good = normalizeDraft({
    title: ' 周报 ',
    prompt: '生成周报',
    cron: '0 9 * * 1',
    enabled: true,
    pinned: { permission: 'read-only' },
    push: { botId: 'bot_1', targetId: 'daily-report' },
  });
  eq(good.title, '周报', '标题去空格');
  eq(good.id, undefined, '缺省 id = undefined');
  const withId = normalizeDraft({ id: 'task-123', title: 'x', prompt: 'p', cron: '* * * * *', enabled: false });
  eq(withId.id, 'task-123', 'id 透传');
  const withEmptyId = normalizeDraft({ id: '', title: 'x', prompt: 'p', cron: '* * * * *', enabled: false });
  eq(withEmptyId.id, undefined, '空 id = undefined');
  assert.throws(() => normalizeDraft({ title: '', prompt: 'x', cron: '* * * * *', enabled: false }), /标题/, '空标题拒绝');
  assert.throws(() => normalizeDraft({ title: 'x', prompt: 'x', cron: 'bad cron', enabled: false }), /cron/, '坏 cron 拒绝');
  assert.throws(() => normalizeDraft({ title: 'x', prompt: 'x'.repeat(40000), cron: '* * * * *', enabled: false }), /超长/, '超长 prompt 拒绝');
  assert.throws(
    () => normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false, push: { botId: 'b', targetId: 'bad id!' } }),
    /targetId/,
    '非法 targetId 拒绝',
  );
  // 任务图片（2026-09-27）：校验 + 透传语义
  const withImages = normalizeDraft({
    title: 'x',
    prompt: 'p',
    cron: '* * * * *',
    enabled: false,
    images: [{ name: 'a.png', mediaType: 'image/png', data: 'aGVsbG8=' }],
  });
  eq(withImages.images?.length, 1, 'images 透传');
  eq(withImages.images?.[0]?.mediaType, 'image/png', 'mediaType 透传');
  const noImages = normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false });
  eq(noImages.images, undefined, '无 images = undefined（保持不变）');
  const clearImages = normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false, images: [] });
  eq(clearImages.images?.length, 0, '空数组 = 清空');
  assert.throws(() => normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false, images: 'x' }), /数组/, 'images 非数组拒绝');
  assert.throws(
    () =>
      normalizeDraft({
        title: 'x',
        prompt: 'p',
        cron: '* * * * *',
        enabled: false,
        images: [
          { mediaType: 'image/png', data: 'aGk=' },
          { mediaType: 'image/png', data: 'aGk=' },
          { mediaType: 'image/png', data: 'aGk=' },
          { mediaType: 'image/png', data: 'aGk=' },
          { mediaType: 'image/png', data: 'aGk=' },
        ],
      }),
    /最多 4 张/,
    '超过 4 张拒绝',
  );
  assert.throws(
    () => normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false, images: [{ mediaType: 'application/pdf', data: 'aGk=' }] }),
    /不支持的图片格式/,
    '非法 mediaType 拒绝',
  );
  assert.throws(
    () => normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false, images: [{ mediaType: 'image/png', data: 'not base64!!' }] }),
    /base64/,
    '非法 base64 拒绝',
  );
  eq(normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false }).pinned?.permission, undefined, '缺省权限 = 跟随默认');

  // ── 会话渠道徽标（channelBadge）数据面 ──
  ok(newSessionId().startsWith('cron-'), '新会话 id 带 cron- 前缀（旧 hex id 兼容）');
  eq(
    JSON.stringify(
      collectSessionMap([
        { activeSessionId: 'cron-aa', executions: [{ sessionId: 'cron-bb' }, { sessionId: 'cron-aa' }], badge: { kind: 'emoji', value: '📊' } },
        { executions: [{ sessionId: '' }] },
        {},
      ]),
    ),
    JSON.stringify({ 'cron-aa': { kind: 'emoji', value: '📊' }, 'cron-bb': { kind: 'emoji', value: '📊' } }),
    'session-ids → {sid: badge} 映射（去重滤空、badge 随任务）',
  );
  // badge 校验：undefined=不变 / null=清除 / emoji 超长拒 / icon 白名单拒 / image 格式与体积拒
  eq(JSON.stringify(normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false, badge: { kind: 'emoji', value: '📊' } }).badge), JSON.stringify({ kind: 'emoji', value: '📊' }), 'badge emoji 通过');
  eq(normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false, badge: null }).badge, null, 'badge null=恢复默认');
  eq(normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false }).badge, undefined, 'badge 缺省=不变');
  throws(() => normalizeBadge({ kind: 'emoji', value: 'x'.repeat(17) }), 'emoji 超长拒');
  throws(() => normalizeBadge({ kind: 'icon', value: 'nope' }), '未知预设图标拒');
  eq(JSON.stringify(normalizeBadge({ kind: 'icon', value: 'telegram', color: 'sky' })), JSON.stringify({ kind: 'icon', value: 'telegram', color: 'sky' }), 'dsh-im 图标通过校验');
  eq(JSON.stringify(normalizeBadge({ kind: 'icon', value: 'clock', color: '#A3B18A' })), JSON.stringify({ kind: 'icon', value: 'clock', color: '#A3B18A' }), 'hex 自定义颜色通过');
  eq(JSON.stringify(normalizeBadge({ kind: 'icon', value: 'clock', color: '#a3b18a' })), JSON.stringify({ kind: 'icon', value: 'clock', color: '#a3b18a' }), 'hex 小写通过');
  eq(JSON.stringify(normalizeBadge({ kind: 'icon', value: 'weixin' })), JSON.stringify({ kind: 'icon', value: 'weixin' }), 'dsh-im 单色无色缺省');
  throws(() => normalizeBadge({ kind: 'icon', value: 'clock', color: 'nope' }), '未知颜色拒');
  eq(resolveBadgeColor('sky'), '#38BDF8', 'resolveBadgeColor key');
  eq(resolveBadgeColor('#a3b18a'), '#a3b18a', 'resolveBadgeColor hex');
  eq(resolveBadgeColor('nope'), '#F59E0B', 'resolveBadgeColor fallback');
  eq(resolveBadgeColor(undefined), '#F59E0B', 'resolveBadgeColor default');
  throws(() => normalizeBadge({ kind: 'image', mediaType: 'image/bmp', data: 'aGk=' }), '不支持格式拒');
  throws(() => normalizeBadge({ kind: 'image', mediaType: 'image/png', data: 'not base64!' }), '坏 base64 拒');
  throws(() => normalizeBadge({ kind: 'image', mediaType: 'image/png', data: 'A'.repeat(90001) }), '图标超 64KB 拒');
  const withTags = normalizeDraft({
    title: 'x',
    prompt: 'p',
    cron: '* * * * *',
    enabled: false,
    reuseSession: false,
    tags: [' ', 'a', 'a', { name: 'b', promptPrefix: ' 先看文档 ' }, { nope: 1 }, 42, 'c', 'd', 'e', 'f', 'g', 'h'],
  });
  eq(withTags.reuseSession, false, 'reuseSession 布尔归一');
  eq((withTags.tags ?? []).map((x) => x.name).join(','), 'a,b,c,d,e,f,g,h', '标签去重/去空/封顶 8/非法丢弃');
  eq((withTags.tags ?? []).find((x) => x.name === 'b')?.promptPrefix, '先看文档', '执行提示 trim');
  eq(normalizeTags(undefined), undefined, '缺省 tags = undefined');
  assert.throws(() => normalizeTags('nope'), /数组/, 'tags 非数组拒绝');

  // ── 9. dist/client.js 产物协议断言 ──
  section = 9;
  let artifact = '';
  try {
    artifact = await fs.readFile(path.join(process.cwd(), 'dist', 'client.js'), 'utf8');
  } catch {
    artifact = '';
  }
  if (artifact !== '') {
    ok(artifact.startsWith('window.__ModuleLoader__.load({'), '产物协议包装头');
    ok(artifact.includes(`id: ${JSON.stringify('dsh-cron-board')}`), '产物 id 与包名一致（三处同步）');
    ok(!/^\s*import[\s{"' ]/m.test(artifact), '无裸 import（纯 CJS 体）');
    ok(artifact.includes('require("react")'), 'react external（未打入 bundle）');
    ok(artifact.includes('__flat'), 'exports 展平尾');
    ok(artifact.includes('sidebar.panellist'), '看板入口挂载');
    ok(artifact.includes('cron-board/state'), 'RPC 端点接线');
    ok(artifact.includes('cron-board/task-archive'), '归档端点接线');
    ok(artifact.includes('cron-board/parse-prompt'), 'AI 解析端点接线');
    ok(artifact.includes('dsh-cb-tagbadge'), '标签徽章样式接线');
    ok(artifact.includes('reuseSession'), '会话复用开关接线');
    ok(artifact.includes('dsh-cron-board'), 'slot id 同步');
  } else {
    console.log('#9 跳过（dist/client.js 未构建——先 pnpm run build 再跑完整 smoke）');
  }

  // ── 10. v1.1.0：标签注入 / 归档拒绝 / 重启对账 / AI 容错 ──
  section = 10;
  // 标签 Prompt 注入（带提示标签前置，无提示标签与无标签不改 Prompt）
  const tagged = makeTask({
    prompt: '做一件事',
    tags: [
      { name: '报告', promptPrefix: ' 输出使用组级口径 ' },
      { name: '仅分类' },
    ],
  });
  // 钉钉 markdown 格式保真（2026-10-01 用户模板缩进/换行丢失实测；v2：\n\n 段落换行）
  const fmt = dingtalkFormatSafe('总结:\n  18P: 通过标记率 15.49%；\n18PM: 14.22%');
  const fmtLines = fmt.split('\n');
  eq(fmtLines.length, 5, '钉钉保真：每行独立成段（行间空行）');
  eq(fmtLines[0], '总结:', '钉钉保真：无缩进行原样');
  eq(fmtLines[2]!.startsWith('\u3000\u3000'), true, '钉钉保真：行首缩进转全角');
  eq(fmtLines[2]!.endsWith('  '), false, '钉钉保真：不再补行尾双空格（钉钉不支持）');
  eq(fmtLines[4]!.startsWith('\u3000'), false, '钉钉保真：无缩进行不加全角');
  const fmtBlank = dingtalkFormatSafe('a\n\n\nb');
  eq(fmtBlank, 'a\n\n\nb', '钉钉保真：原空行保留为空段（分隔语义不丢）');
  // markdown 结构不能被补空行拆坏（推送改 markdown 后的回归保护）
  eq(dingtalkFormatSafe('```js\nconst a = 1;\nconst b = 2;\n```'), '```js\nconst a = 1;\nconst b = 2;\n```', '钉钉保真：围栏代码块内部不补空行');
  eq(dingtalkFormatSafe('- 甲\n- 乙\n- 丙'), '- 甲\n- 乙\n- 丙', '钉钉保真：列表保持紧凑');
  eq(dingtalkFormatSafe('| a | b |\n| --- | --- |\n| 1 | 2 |'), '| a | b |\n| --- | --- |\n| 1 | 2 |', '钉钉保真：表格行不断开');
  eq(dingtalkFormatSafe('> 引用甲\n> 引用乙'), '> 引用甲\n> 引用乙', '钉钉保真：引用块保持紧凑');
  const withPrefix = buildPromptWithTags(tagged);
  ok(withPrefix.startsWith('【标签提示 · 报告】输出使用组级口径'), '执行提示注入到 Prompt 前');
  ok(withPrefix.endsWith('做一件事'), '原文完整保留在注入段之后');
  const plain = makeTask({ prompt: '做一件事', tags: [{ name: '仅分类' }] });
  eq(buildPromptWithTags(plain), '做一件事', '无提示标签不改 Prompt');
  eq(buildPromptWithTags(makeTask({ prompt: '做一件事' })), '做一件事', '无标签不改 Prompt');
  // AI 解析 JSON 容错
  ok(extractJsonObject('{"title":"A","prompt":"B"}') !== undefined, '裸 JSON 解析');
  ok(extractJsonObject('```json\n{"title":"A","prompt":"B"}\n```') !== undefined, '围栏 JSON 解析');
  ok(extractJsonObject('好的：{"title":"A","prompt":"B"} 完毕') !== undefined, '杂文包裹 JSON 解析');
  eq(extractJsonObject('完全没有对象'), undefined, '无对象返回 undefined');
  // 归档任务拒绝执行（launch 前置 + runner 桩账本）
  {
    const dir10 = await tempDir();
    const ledger10 = new LedgerStore(dir10, 20, logger);
    await ledger10.init();
    const runner10 = new TaskRunner(
      {
        get: () => undefined,
        on: () => () => {},
        effect: () => () => {},
      } as never,
      ledger10,
      new ResultStore(dir10),
      pusherFail,
      { runTimeoutMin: 60, executionsKeepPerTask: 20, resultsKeepPerTask: 20, defaultPermission: 'read-only' } as never,
      logger,
    );
    const archTask = makeTask({ archived: true });
    await ledger10.mutate((doc) => doc.tasks.push(archTask));
    await assert.rejects(() => runner10.launch(archTask, 'manual'), /archived/, '归档任务拒绝执行');
    // 重启对账：running 且会话不在册 → canceled，绝不重发
    const orphan: Execution = {
      id: 'exec_orphan',
      trigger: 'cron',
      sessionId: 'sess_gone',
      status: 'running',
      startedAt: now2(),
    };
    const stuck = makeTask({ id: 'task_stuck', executions: [orphan] });
    await ledger10.mutate((doc) => doc.tasks.push(stuck));
    await runner10.reconcileStartup();
    const after = (await ledger10.mutate((doc) => doc.tasks.find((x) => x.id === 'task_stuck')!.executions[0].status))
      .value;
    eq(after, 'canceled', '重启对账：无会话在册 → canceled');
    await ledger10.mutate((doc) => {
      const e = doc.tasks.find((x) => x.id === 'task_stuck')!.executions[0];
      eq(e.exitReason, 'interrupted-by-restart', '对账取消原因');
    });
  }

  console.log(`smoke: all sections passed (${logs.length} log lines)`);
}

main().catch((err) => {
  console.error('smoke FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});

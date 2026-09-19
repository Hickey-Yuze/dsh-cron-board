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
import { confirmFingerprint, gateDecision, isConfirmed, needsConfirm } from './gatekeeper.js';
import { LedgerStore, type BoardTask } from './ledger.js';
import { ResultStore } from './results.js';
import { Pusher, type DshImLike } from './pusher.js';
import { normalizeDraft } from './rpc.js';
import type { Execution, TaskRow } from './contract.js';
import { newTaskId } from './util.js';

let section = 0;
function ok(cond: unknown, msg: string): void {
  assert.ok(cond, `#${section} ${msg}`);
}
function eq<T>(a: T, b: T, msg: string): void {
  assert.equal(a, b, `#${section} ${msg}`);
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
  const brief = unavailable.briefFor({ ok: true, title: '周报', status: 'success', durationMs: 65000, resultPath: 'C:\\r\\1.md' });
  ok(brief.includes('✅') && brief.includes('周报') && brief.includes('1 分 5 秒') && brief.includes('C:\\r\\1.md'), '成功简讯模板');
  const briefFail = unavailable.briefFor({ ok: false, title: '同步', status: 'failed', reason: 'error', durationMs: 1000 });
  ok(briefFail.includes('❌') && briefFail.includes('error'), '失败简讯模板');
  const enBrief = unavailable.briefFor({ ok: true, title: 'weekly', status: 'success', durationMs: 65000, lang: 'en' });
  ok(enBrief.includes('Duration: 1m 5s'), '英文简讯');
  // 服务直调成功
  const sent: Array<[string, string]> = [];
  const svc: DshImLike = {
    send: async (botId, targetId) => {
      sent.push([botId, targetId]);
      return { sent: true };
    },
  };
  const pusherSvc = new Pusher(() => svc, { httpPort: 59999, retryMax: 3 }, logger);
  eq(pusherSvc.channelView().mode, 'service', 'dshIm 服务探测');
  const okRec = await pusherSvc.send('bot_x', 'tgt_y', 'hello');
  eq(okRec.state, 'sent', '服务直调成功');
  eq(okRec.attempts, 1, '一次成功');
  eq(sent.length, 1, '调用一次');
  // 全部失败：重试上限 + failed 状态
  const alwaysFail: DshImLike = { send: async () => ({ sent: false }) };
  const pusherFail = new Pusher(() => alwaysFail, { httpPort: 59999, retryMax: 3 }, logger);
  const failRec = await pusherFail.send('bot_x', 'tgt_y', 'hello');
  eq(failRec.state, 'failed', '重试耗尽标记失败');
  eq(failRec.attempts, 3, '重试 3 次');
  ok(failRec.lastError !== undefined, '记录最后错误');

  // ── 8. RPC 载荷校验 ──
  section = 8;
  const good = normalizeDraft({ title: ' 周报 ', prompt: '生成周报', cron: '0 9 * * 1', enabled: true, pinned: { permission: 'read-only' }, push: { botId: 'bot_1', targetId: 'daily-report' } });
  eq(good.title, '周报', '标题去空格');
  assert.throws(() => normalizeDraft({ title: '', prompt: 'x', cron: '* * * * *', enabled: false }), /标题/, '空标题拒绝');
  assert.throws(() => normalizeDraft({ title: 'x', prompt: 'x', cron: 'bad cron', enabled: false }), /cron/, '坏 cron 拒绝');
  assert.throws(() => normalizeDraft({ title: 'x', prompt: 'x'.repeat(40000), cron: '* * * * *', enabled: false }), /超长/, '超长 prompt 拒绝');
  assert.throws(() => normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false, push: { botId: 'b', targetId: 'bad id!' } }), /targetId/, '非法 targetId 拒绝');
  eq(normalizeDraft({ title: 'x', prompt: 'p', cron: '* * * * *', enabled: false }).pinned?.permission, undefined, '缺省权限 = 跟随默认');

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
    ok(artifact.includes('dsh-cron-board'), 'slot id 同步');
  } else {
    console.log('#9 跳过（dist/client.js 未构建——先 pnpm run build 再跑完整 smoke）');
  }

  console.log(`smoke: all sections passed (${logs.length} log lines)`);
}

function now2(): string {
  return new Date().toISOString();
}

main().catch((err) => {
  console.error('smoke FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});

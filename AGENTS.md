# dsh-cron-board 开发铁律

改动本仓库任何代码前先读本文。

## 产物与加载协议

- Client bundle 必须是 `window.__ModuleLoader__.load({ id, factory })` 单文件；`factory(require)` 返回 `{ apply, inject }`。`id` 三处同步：package.json `name`、构建脚本 `PLUGIN_ID`、`client/src/panel-icon.tsx` 的 `PANEL_ID`（同时用作 main 键位与 slot id）。
- **cordis.patch.yml 的 insert `id` 必须等于包名**（2026-09-19 实证）：id ≠ 包名时 Host 半区照常启动，但宿主 client 清单按 id 定位包失败 → client bundle 永不进 `__DSH_BOOT__`，侧栏图标不出现（task-board 的 `ui-task-board` 同病，dsh-memory 等 id==包名 者全部正常）。
- `react`、`react/jsx-runtime`、`@deepseek-ai/*` 一律 external，绝不打入 bundle（双 react 实例炸 hooks）。构建脚本自检这四项，破坏即构建失败。
- RPC 类型契约唯一事实源是 `src/contract.ts`（types-only）；Host/Client 两端 `import type` 引用，禁止各自手写。

## Host 半区

- 硬依赖只允许 `agentLoop`（`export const inject = ['agentLoop']`）；`dshIm`/`webServer`/`workspaceRegistry`/`agentPresets`/`commands`/`sessionTitle` 全部 `ctx.get` 软探测 + 结构鸭子类型，**禁止**出现在 inject 或作为 ctx 属性直接访问（cordis 严格代理会对未声明属性抛 "cannot get property X without inject"）。
- **HTTP API 唯一正确姿势**（2026-09-19 实证，官方 session-manager 同款）：`ctx.get('webServer')` → `ws.register({ kind: 'prefix', path: '/api/cron-board', handler(req, res) })`，handler 内手动读体 + `send(res, 200, envelope)`，register 返回值挂 `ctx.effect` 做 disposer。**禁止** `connection.rpc.handle`（其实现内部踩 webServer，宿主实测必炸）。
- client 侧对应：直接 `fetch('/api/cron-board/<endpoint>')`，不走 connection；client `inject` 保持最小集 `['slots', 'layout', 'locale']`——inject 里每个名字都是一次服务等待，声明了不存在/晚到的服务会挂起整个 client 半区，侧栏图标因此不出现。
- **`commands.execute(agent, line, attachments, signal)` 的 signal 必传**（2026-09-19 实证，dsh-commands 内部无空值保护，缺省即 `undefined.aborted` 崩）；pins 阶段建 AbortController 并接入 entry.cancel 取消链。
- **agent 创建必须走官方 composeAgent 三件套**（2026-09-19 实证）：裸 agent（不挂预设/模型）为空全局层，turn 直接 error 结算。姿势：`ctx.agents.create({ sessionId, agentOptions: agentDefaultModel.currentSelection() 的 provider/model, meta: { cwd, agentPreset: presets.resolve(钉的id或undefined).id }, setup: (agentCtx) => presets.mount(agentCtx, presetId) })`——mount 是官方唯一支持调用点（agent 工厂 setup 阶段），失败自动回滚创建；presets.select 在 4.x 不存在。创建会话后须 `workspaceRegistry.create(path).attachSession(sessionId)` 注册归属——cwd 只决定存储桶，attachSession 才决定侧栏树归组，缺省即「未分组」。客户端 i18n 用官方模式：`ctx.locale.register(ns, {zh,en})` + `ctx.locale.bind(ns)`，语言切换由宿主管。
- 每个副作用（定时器、事件监听、RPC handler）都必须有 disposer 并挂在 `ctx.effect`；插件停机时 `runner.cancelAll()` 取消在途执行。
- 存储初始化失败只降级（log error + return），宿主必须照常启动；禁止让插件异常炸宿主 fiber。
- 账本 `ledger.json` 是唯一持久状态：串行 mutate 链 + revision 递增 + 原子落盘（tmp+rename，EPERM/EBUSY 重试一次）；损坏改名保留后空账本启动。执行记录与结果文件有界裁剪（默认各 20）。
- ESM 严格：`src/` 相对导入必须带 `.js` 扩展名。

## 调度语义（勿改）

- 5 段 cron，Host 本地时区墙上时钟；dom/dow 均非通配时 OR 语义（vixie 惯例）；周日 7→0。
- 错过触发**绝不补跑**；同任务运行中到点跳过并滚动；`awaiting-confirmation` 跳过并滚动。nextRunAt 在到期后立即向后滚动，动作（fire/skip）与滚动同批提交。

## 确认门

- 有效权限 ≠ 默认档或默认档非 read-only 即 `needsConfirm`；指纹 = sha256(prompt + permission + presetId + workspaceId)，任一变更自动重新武装；cron 触发前调度器与 runner 双重检查。

## 推送

- `dshIm` 三级降级：服务直调 → HTTP 回退（`/api/dsh-im/delivery/messages`，15s 超时）→ 标记 failed 可补推；推送失败不阻塞结算，重试退避 1s/2s/4s。
- 简讯 = 状态头 + **agent 回复正文**（2026-09-19 用户明确要求；clampBody 截断 2500 字符防 IM 通道超限）+ 全文存档路径/失败原因 + 署名；结算时传 outcome.finalText，补推时从结果文件读回（去 front matter）。完整全文仍以结果文件为准。

## Client 半区

- 槽位：`sidebar.panellist`（order 60，图标入口）+ `main`（keyed `dsh-cron-board`）+ `settings.section`（id 同，order 210）；`register({ name, ... })` 的 name 必须等于槽位名。
- 语言：全部用户可见文案走 `client/src/i18n.ts` zh/en 字典 `t()`/`tpl()`；颜色一律 `--dsh-cb-*` 令牌（`client/src/theme.ts` 映射 dsw alias），组件内禁止裸色值。
- `usePanelInfo` 走 guarded require（模块级缓存保 hooks 顺序稳定）；找不到宿主 hook 时降级为无选中态。

## 测试与验证

- `pnpm run smoke`（= build + build:smoke + node dist-smoke）必须全绿才能交付；改调度/门控/账本/推送语义时同步补冒烟断言。
- 结果文件布局固定为 `<dataDir>/results/<taskId>/<execId>.md`（taskDir 负责拼接与穿越防护）。
- 真机安装注意路径空格：dsh CLI 会按空格拆参，用无空格符号链接规避；profile 的 `pnpm-workspace.yaml` 需放行 `node-pty`、`esbuild` 构建脚本。

# dsh-cron-board · 定时任务看板

cron 定时 agent 会话任务 + 执行终态机器人推送。融合 [dsh-task-board](https://github.com/zhu1090093659/dsh-web/tree/main/packages/dsh-task-board) 的看板调度语义与 [dsh-im](https://github.com/xmanrui/dsh-im) 的机器人推送通道。

任务到点执行任务 Prompt：首次新建会话，之后**延续同一会话**（agent 记得此前上下文，会话丢失自动重建）；会话终态（turn/end）即任务终态，agent 的回复正文随终态经 dsh-im 机器人推送，完整结果落盘可回看。

## 功能

- **四列看板**：草稿（未启用）/ 已排程 / 运行中 / 最近执行；侧栏图标直达，`layout.selectPanel` 原生导航。
- **调度**：5 段 cron（Host 本地时区）；**错过不补跑**（宿主停机/睡眠期间的触发跳过并滚动）；同任务**绝不并发**（运行中到点跳过并滚动），跳过原因写回看板。
- **真实执行**：官方 `agents.create/resume`（composeAgent 三件套：agentPreset + setup 挂载 + 默认模型选择）→ 钉住工作区（`attachSession` 注册归属）/agent 预设/权限档 → followup 发送任务 Prompt → `turn/end` 终态结算（超时 cancel 兜底）。
- **权限确认门**：有效权限高于默认档（read-only）的任务，首次 cron 触发前须在看板人工确认一次；权限、Prompt、预设、工作区任一变更自动重新武装；未确认时 cron 跳过并滚动。
- **推送**：终态简讯（✅/❌ 状态头 + **agent 回复正文**（按字节截断适配微信单条上限）+ 结果路径/失败原因）经 `dshIm` 服务直推 dsh-im 机器人；dsh-im 未部署时自动降级 HTTP 回退（默认 `127.0.0.1:3080`），仍不通则标记「未送达」，看板可手动**补推**。结果始终落盘。
- **有界历史**：每任务保留最近 20 次执行记录与 20 份结果文件（可配置），自动裁剪。

## 安装

```bash
dsh plugin --profile web add link:<项目绝对路径>
```

macOS 路径含空格时 CLI 可能拆参，稳妥做法是先建无空格符号链接：

```bash
ln -s "/Users/<你>/path with space/dsh-cron-board" ~/.dsh/cron-board-src
dsh plugin --profile web add link:~/.dsh/cron-board-src
```

前置：仓库内 `pnpm install && pnpm run build` 产出 `dist/index.js`（Host 半区）与 `dist/client.js`（Client bundle）。安装后刷新 Web 页面（或重启宿主）加载。

## 配置（cordis.patch.yml）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `dataDir` | `$DSH_HOME/cron-board` | 数据目录（账本/结果文件） |
| `schedulerTickMs` | `30000` | 调度扫描间隔 |
| `runTimeoutMin` | `60` | 单次执行超时（分钟），超时 cancel |
| `resultsKeepPerTask` | `20` | 每任务结果文件保留数 |
| `executionsKeepPerTask` | `20` | 每任务执行记录保留数 |
| `defaultPermission` | `read-only` | 默认权限档（确认门基准） |
| `push.httpPort` | `3080` | dsh-im HTTP 回退端口 |
| `push.retryMax` | `3` | 推送重试上限（退避 1s/2s/4s） |

## 使用

1. **绑定 dsh-im**：在 dsh-im 设置页取得机器人「调用标识 botId」与目标「targetId」（稳定别名）。看板设置页选择**全局默认推送目标**，或在任务里单独指定。
2. **新建任务**：标题 + 任务 Prompt + cron 表达式（输入实时预览「每周一 09:00」等人类描述），可选钉住工作区/预设/权限档与推送目标。
3. **确认门**：权限高于 read-only 的任务保存后显示「待确认」，点「确认权限」放行 cron 无人值守执行。
4. **执行与回看**：到点自动执行；卡片与「最近执行」列实时反映状态；执行行点「结果」查看落盘 Markdown（含 front matter：触发方式/会话/状态/耗时/退出原因）。
5. **推送异常**：执行行显示「未送达」时点「补推」重发；「测试推送」验证通道连通性。

## 数据与安全

- 数据独立存放于 `$DSH_HOME/cron-board/`（`ledger.json` + `results/<taskId>/<execId>.md`）；**不读写**宿主既有 `.dsh/cron`，也不触碰其他插件的 `.dsh/task-board`。
- 账本损坏自防护：JSON 非法时改名保留为 `ledger.json.corrupt-<ts>` 并以空账本启动。
- 数据目录不可写时插件降级停用，宿主照常启动。
- 权限档逐任务钉住并经宿主 `/permission` 命令应用；确认门指纹（sha256）覆盖 prompt/权限/预设/工作区，任一变更即失效。

## 开发

```bash
pnpm install          # 依赖（pnpm-workspace.yaml 已放行 esbuild postinstall）
pnpm run typecheck    # Host(tsconfig.json) + Client(tsconfig.client.json) 双链
pnpm run build        # dist/index.js + dist/client.js
pnpm run smoke        # 重建并跑 9 组断言（cron/门控/账本/结果/推送/RPC 校验/产物协议）
```

产物协议：Client bundle 为 `window.__ModuleLoader__.load({ id, factory })` 单文件，`factory(require)` 返回 `{ apply, inject }`；react 与 `@deepseek-ai/*` 全部 external 不打入。详见根 [AGENTS.md](./AGENTS.md)。

## 边界（v1 精简核心版）

不做：归档恢复、任务标签、交接包、冻结快照、AI 解析 cron、电源保护、会话复用、多目标推送、shell 任务、群 webhook 直推。

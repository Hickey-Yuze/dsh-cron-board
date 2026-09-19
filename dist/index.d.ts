/**
 * dsh-cron-board — 定时任务看板插件（持久组合插件）。
 *
 * 功能：
 * - 四列看板（草稿/已排程/运行中/最近执行）管理 cron 定时 agent 会话任务；
 * - Host 权威账本 + 调度器：错过不补跑、任务不并发、执行历史有界；
 * - 真实执行：agentLoop 新建会话 → 钉住工作区/预设/权限 → followup 发任务 Prompt
 *   → turn/end 终态结算；
 * - 权限确认门：高于默认权限档的任务首次 cron 触发前须人工确认，变更重新武装；
 * - 推送：执行终态简讯经 dshIm 服务（或 HTTP 回退）推送 dsh-im 机器人，结果落盘可回看。
 *
 * 数据目录：$DSH_HOME/cron-board/（独立于宿主 .dsh\cron 与他人插件的 task-board）。
 * 存储初始化失败只降级不崩溃：数据目录不可写时插件停用，宿主必须照常启动。
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config, type CronBoardConfig } from './config.js';
export declare const name = "dsh-cron-board";
/** 硬依赖：执行引擎。dshIm/connection 等可选能力一律 ctx.get 软探测。 */
export declare const inject: string[];
/** 配置 schema：导出名必须是 `Config`（cordis 运行时按名读取，见 config.ts 注释）。 */
export { Config };
export declare function apply(ctx: Context, config: CronBoardConfig): Promise<void>;

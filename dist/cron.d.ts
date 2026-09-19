/**
 * 零依赖 5 段 cron 解析器（宿主权威：校验 + nextRun 调度；client 复用 describeCron 做展示）。
 * 语义对齐 dsh-task-board：支持星号通配、步长（星号/斜杠 n）、范围、逗号列表、
 * 周日 0/7 归一、日期/星期 OR 语义。
 * 时间基准为 Host 本地时区（墙上时钟，DST 跳过/重复语义同 vixie-cron 常规实现）。
 */
export interface ParsedCron {
    minute: Set<number>;
    hour: Set<number>;
    dom: Set<number>;
    month: Set<number>;
    dow: Set<number>;
    domWild: boolean;
    dowWild: boolean;
}
export declare function parseCron(expr: string): ParsedCron;
export declare function isValidCron(expr: string): boolean;
/**
 * 下一个触发点（严格晚于 from，分钟精度，Host 本地时区）。
 * 智能跳月/跳日/跳时，无匹配返回 null（理论上仅限超过 5 年远期才可能触顶）。
 */
export declare function cronNextRun(expr: string, from: Date): Date | null;
/** 人类可读描述（看板卡片/详情展示用；无法识别的模式回退表达式原文）。 */
export declare function describeCron(expr: string, lang: 'zh' | 'en'): string;

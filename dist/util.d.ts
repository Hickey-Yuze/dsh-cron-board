export declare function randomHex(bytes: number): string;
export declare function newTaskId(): string;
export declare function newExecId(): string;
/** 会话 id 形态对齐宿主（12 位 hex）。 */
export declare function newSessionId(): string;
export declare function sha256(input: string): string;
export declare function errDetail(err: unknown): string;
export declare function ensureDir(dir: string): Promise<void>;
/** 原子写文本：临时文件 + rename 覆盖（调用方传完整字符串，不在写路径二次拼接）。 */
export declare function writeTextAtomic(file: string, content: string): Promise<void>;
export declare function readTextSafe(file: string): Promise<string | undefined>;
export declare function readJsonSafe<T>(file: string, fallback: T): Promise<T>;
export declare function removeFile(file: string): Promise<void>;
/** 时长人类可读（推送简讯用，zh/en 各一）。 */
export declare function fmtDuration(ms: number, lang: 'zh' | 'en'): string;
export declare function clampText(s: string, max: number): string;

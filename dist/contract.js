/**
 * RPC 契约单一事实源（types-only，零运行时代码）。
 * client 经 `import type` 引用（esbuild 构建期擦除）；扩端点先改这里，
 * host/client 两侧编译器（pnpm run typecheck 双链）会追着改。
 *
 * 安全约定：所有变更载荷为严格判别联合中的显式字段；协议不含命令、
 * 可执行路径、shell 文本或任意参数字段；载荷上限在 host rpc.ts 强制校验。
 */
export {};

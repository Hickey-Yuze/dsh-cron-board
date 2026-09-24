/**
 * 粘贴文本 AI 解析（对齐原版 task-board issue #1540 语义，简化为默认模型单轮）：
 * - llm.stream(GenOptions) 收集 block-end 文本块（协议保证携带组装完的整块）；
 * - 默认模型来自 agentDefaultModel.currentSelection()，与执行引擎同源；
 * - 45s 预算 + signal 取消由 rpc 层控制；解析失败抛错，不改动用户已输入内容。
 */
import type { Context } from '@deepseek-ai/cordis';
import type * as dshLlm from '@deepseek-ai/dsh-llm';

interface StreamChunkLike {
  type: string;
  block?: { type?: string; text?: string };
  text?: string;
  index?: number;
  blockType?: string;
  reason?: { kind: string; failure?: { message?: string; code?: string } };
}

interface LlmStreamLike {
  stream?(options: {
    provider: string;
    model: string;
    messages: unknown[];
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  }): AsyncIterable<StreamChunkLike>;
}

interface DefaultModelLike {
  currentSelection?(): { provider?: string; model?: string } | undefined;
}

let dshLlmModule: typeof dshLlm | undefined;
/** 惰性 require dsh-llm（runner.ts 同款：规避宿主启动期 require(esm) 竞态）。 */
function requireDshLlm(): typeof dshLlm {
  return (dshLlmModule ??= require('@deepseek-ai/dsh-llm') as typeof dshLlm);
}

const SYSTEM_INSTRUCTION = [
  '你是定时任务表单解析助手。用户会粘贴一段自然语言描述，请把它整理成一个 cron 定时任务的标题与执行 Prompt。',
  '只输出一个 JSON 对象，不要输出任何其他文字或代码围栏，格式：',
  '{"title": "简短标题（≤40字）", "prompt": "发给独立 agent 会话的完整执行指令（具体、可独立执行）", "cron": "可选：5 段 cron 表达式（仅当描述里明确出现可推断的周期时给出，否则省略该字段）"}',
].join('\n');

export interface AiParser {
  parse(text: string, signal: AbortSignal): Promise<{ title?: string; prompt?: string; cron?: string }>;
}

/** 提取 JSON 对象：容错剥 ``` 围栏与前后杂文，取首个平衡 {...} 块。 */
export function extractJsonObject(raw: string): Record<string, unknown> | undefined {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(s.slice(start, i + 1)) as unknown;
          return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

export function createAiParser(ctx: Context, log: { warn(m: string): void }): AiParser {
  return {
    async parse(text, signal) {
      const llm = ctx.get('llm') as unknown as LlmStreamLike | undefined;
      if (!llm?.stream) throw new Error('llm 服务不可用');
      const selection = (ctx.get('agentDefaultModel') as unknown as DefaultModelLike | undefined)?.currentSelection?.();
      if (!selection?.provider || !selection?.model) throw new Error('默认模型未配置');
      const message = requireDshLlm().createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      });
      const stream = llm.stream({
        provider: selection.provider,
        model: selection.model,
        messages: [message],
        maxTokens: 4096,
        temperature: 0.2,
        signal,
      });
      let output = '';
      let finishKind = '';
      let finishDetail = '';
      for await (const chunk of stream) {
        if (signal.aborted) throw new Error('aborted');
        if (chunk.type === 'block-end' && chunk.block?.type === 'text' && typeof chunk.block.text === 'string') {
          output += chunk.block.text;
        } else if (chunk.type === 'finish' && chunk.reason) {
          // dsh-llm 协议：finish 是终态。error/aborted 携带 failure（此前被忽略，
          // 上游失败会因输出为空被误报成「格式异常」），max-tokens 意味着输出可能截断。
          finishKind = chunk.reason.kind;
          if (chunk.reason.failure?.message) finishDetail = chunk.reason.failure.message;
          if (finishKind === 'error') {
            throw new Error(`模型调用失败: ${(finishDetail || '未知错误').slice(0, 160)}`);
          }
          if (finishKind === 'aborted') throw new Error('解析已取消或超时');
        }
      }
      const obj = extractJsonObject(output);
      if (!obj) {
        const hint =
          finishKind === 'max-tokens'
            ? '输出被截断'
            : output.trim() === ''
              ? '模型无文本输出'
              : `输出开头: ${output.trim().slice(0, 60)}`;
        log.warn(`[cron-board] AI 解析输出无法解析为 JSON（finish=${finishKind || 'none'}）: ${output.slice(0, 200)}`);
        throw new Error(`解析结果格式异常（${hint}），请重试或手动填写`);
      }
      const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 120) : undefined;
      const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim().slice(0, 32768) : undefined;
      const cron = typeof obj.cron === 'string' ? obj.cron.trim().slice(0, 64) : undefined;
      if (!title || !prompt) throw new Error('解析结果缺少标题或 Prompt');
      return { title, prompt, cron: cron !== '' ? cron : undefined };
    },
  };
}

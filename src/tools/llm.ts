import { config } from "../config/index.js";
import { createLLM } from "../services/deepseek.js";
import { logger } from "./logger.js";

/**
 * LLM 推理客户端（自动选择 DeepSeek / Ollama 兜底）
 */
const llmPromise = createLLM();

/**
 * 调用本地 LLM 生成摘要
 *
 * @param prompt - 提示词
 * @param context - 待摘要的文本
 * @returns 生成的摘要文本
 */
export async function callLocalLLM(
  prompt: string,
  context: string
): Promise<string> {
  const systemPrompt = `你是一个专业的知识提炼助手。你的任务是从给定的文本中提取核心信息，生成简洁准确的中文摘要。
要求：
1. 只输出摘要内容，不要包含任何前缀或解释
2. 摘要长度控制在 200 字以内
3. 保留关键事实、数据和观点
4. 使用中文回答`;

  const userMessage = `${prompt}\n\n待处理文本：\n${context.slice(0, 4000)}`;

  try {
    logger.info(
      { model: config.DEEPSEEK_MODEL, contextLength: context.length },
      "调用 LLM 生成摘要"
    );

    const llm = await llmPromise;
    const response = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ]);

    const summary =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    logger.info({ summaryLength: summary.length }, "LLM 摘要生成完成");
    return summary;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg }, "LLM 调用失败");
    throw new Error(`LLM 调用失败: ${errorMsg}`);
  }
}

/**
 * 估算文本 token 数（简易估算：中文约 1.5 字符/token，英文约 4 字符/token）
 */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

import type { KnowledgeStateType } from "../state/index.js";
import type { ProcessedData } from "../types/index.js";
import {
  callLocalLLM,
  estimateTokens,
  logger,
} from "../tools/index.js";

/**
 * 摘要节点：调用本地 LLM 为每个文本块生成摘要
 */
export async function summarizerNode(
  state: KnowledgeStateType
): Promise<Partial<KnowledgeStateType>> {
  const { chunks, query, taskId } = state;

  logger.info({ taskId, chunkCount: chunks.length }, "summarizerNode 开始执行");

  if (chunks.length === 0) {
    logger.warn({ taskId }, "没有文本块需要摘要");
    return {
      status: "done",
      processedData: [],
      messages: ["⚠️ 没有文本块需要生成摘要"],
    };
  }

  try {
    // 按 sourceUrl 分组处理
    const groupedByUrl = new Map<string, typeof chunks>();
    for (const chunk of chunks) {
      const group = groupedByUrl.get(chunk.sourceUrl) || [];
      group.push(chunk);
      groupedByUrl.set(chunk.sourceUrl, group);
    }

    const processedData: ProcessedData[] = [];
    const prompt = query
      ? `请根据以下查询方向提炼文本核心信息，生成中文摘要。查询方向：${query}`
      : "请提取以下文本的核心信息，生成简洁的中文摘要";

    for (const [url, urlChunks] of groupedByUrl) {
      // 合并同一 URL 的所有块
      const combinedText = urlChunks
        .sort((a, b) => a.index - b.index)
        .map((c) => c.text)
        .join("\n\n");

      const summary = await callLocalLLM(prompt, combinedText);

      // 简单提取关键词（基于常见中文分隔符）
      const keywords = extractKeywords(summary);

      processedData.push({
        summary,
        keywords,
        sourceUrl: url,
        processedAt: new Date().toISOString(),
        originalTokenEstimate: estimateTokens(combinedText),
        summaryTokenEstimate: estimateTokens(summary),
      });

      logger.info({ url, summaryLength: summary.length }, "单页摘要生成完成");
    }

    logger.info(
      { taskId, processedCount: processedData.length },
      "summarizerNode 所有摘要生成完成"
    );

    return {
      processedData,
      status: "processing",
      messages: [
        `🤖 LLM 摘要完成：${processedData.length} 个页面已生成摘要`,
      ],
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ taskId, error: errorMsg }, "summarizerNode 执行失败");
    return {
      status: "error",
      error: errorMsg,
      messages: [`❌ 摘要生成失败: ${errorMsg}`],
    };
  }
}

/**
 * 从摘要文本中简单提取关键词
 */
function extractKeywords(text: string): string[] {
  // 尝试匹配【关键词】、关键词：等模式
  const patterns = [
    /关键词[：:]\s*(.+)/,
    /【关键词】\s*(.+)/,
    /关键[词点][：:]\s*(.+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1]
        .split(/[,，、\s]+/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length < 20)
        .slice(0, 10);
    }
  }

  return [];
}

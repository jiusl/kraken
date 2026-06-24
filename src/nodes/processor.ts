import type { KnowledgeStateType } from "../state/index.js";
import type { TextChunk } from "../types/index.js";
import { chunkText, logger } from "../tools/index.js";

/**
 * 处理器节点：将爬取的原始内容切分成文本块
 */
export async function processorNode(
  state: KnowledgeStateType
): Promise<Partial<KnowledgeStateType>> {
  const { crawledContent, taskId } = state;

  logger.info({ taskId }, "processorNode 开始执行");

  if (!crawledContent || crawledContent.pages.length === 0) {
    logger.warn({ taskId }, "没有可处理的爬取内容");
    return {
      status: "error",
      error: "没有可处理的爬取内容",
      messages: ["⚠️ 没有可处理的爬取内容"],
    };
  }

  try {
    const allChunks: TextChunk[] = [];

    // 只处理成功爬取的页面
    const successPages = crawledContent.pages.filter((p) => !p.error);

    for (const page of successPages) {
      if (page.content.trim().length === 0) continue;

      const chunks = chunkText(page.content, page.url);
      allChunks.push(...chunks);
    }

    logger.info(
      { taskId, pageCount: successPages.length, chunkCount: allChunks.length },
      "processorNode 文本切分完成"
    );

    return {
      chunks: allChunks,
      status: "processing",
      messages: [
        `📝 文本切分完成：${successPages.length} 个页面 → ${allChunks.length} 个文本块`,
      ],
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ taskId, error: errorMsg }, "processorNode 执行失败");
    return {
      status: "error",
      error: errorMsg,
      messages: [`❌ 文本处理失败: ${errorMsg}`],
    };
  }
}

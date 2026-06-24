import type { KnowledgeStateType } from "../state/index.js";
import type { KnowledgeDocument } from "../types/index.js";
import { upsertKnowledge, logger } from "../tools/index.js";

/**
 * Qdrant 入库节点：将处理后的知识向量化并存入 Qdrant
 */
export async function qdrantNode(
  state: KnowledgeStateType
): Promise<Partial<KnowledgeStateType>> {
  const { chunks, processedData, taskId } = state;

  logger.info(
    { taskId, chunkCount: chunks.length, dataCount: processedData.length },
    "qdrantNode 开始执行"
  );

  if (processedData.length === 0 && chunks.length === 0) {
    logger.warn({ taskId }, "没有数据需要入库");
    return {
      status: "done",
      messages: ["⚠️ 没有数据需要存入 Qdrant"],
    };
  }

  try {
    // 构建 KnowledgeDocument 列表
    const documents: KnowledgeDocument[] = [];

    // 为每个文本块创建文档，附上对应摘要作为元数据
    const summaryMap = new Map(
      processedData.map((p) => [p.sourceUrl, p])
    );

    for (const chunk of chunks) {
      const summary = summaryMap.get(chunk.sourceUrl);

      documents.push({
        text: chunk.text,
        metadata: {
          sourceUrl: chunk.sourceUrl,
          title: chunk.sourceUrl, // 后续可从 crawledContent 中获取真实标题
          summary: summary?.summary ?? "",
          keywords: summary?.keywords ?? [],
          chunkIndex: chunk.index,
          processedAt: new Date().toISOString(),
        },
      });
    }

    await upsertKnowledge(documents);

    logger.info(
      { taskId, documentCount: documents.length },
      "qdrantNode 入库完成"
    );

    return {
      status: "done",
      messages: [`💾 已存入 Qdrant：${documents.length} 个文档片段`],
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ taskId, error: errorMsg }, "qdrantNode 执行失败");
    return {
      status: "error",
      error: errorMsg,
      messages: [`❌ Qdrant 入库失败: ${errorMsg}`],
    };
  }
}

import { QdrantVectorStore } from "@langchain/qdrant";
import { Document } from "@langchain/core/documents";
import { config } from "../config/index.js";
import { createOllamaEmbeddings } from "../services/ollama.js";
import { createQdrantClient } from "../services/qdrant.js";
import { logger } from "./logger.js";
import type { KnowledgeDocument } from "../types/index.js";

/**
 * Embeddings 实例（通过 Ollama）
 */
const embeddings = createOllamaEmbeddings();

/**
 * Qdrant 客户端
 */
function getQdrantClient() {
  return createQdrantClient();
}

/**
 * 确保 Qdrant 集合存在
 */
export async function ensureCollection(): Promise<void> {
  const client = getQdrantClient();

  try {
    const { collections } = await client.getCollections();

    const exists = collections.some(
      (c) => c.name === config.QDRANT_COLLECTION_NAME
    );

    if (!exists) {
      logger.info(
        { collection: config.QDRANT_COLLECTION_NAME },
        "创建 Qdrant 集合"
      );

      // 通过 QdrantVectorStore 自动创建集合（含正确的向量维度）
      await QdrantVectorStore.fromExistingCollection(embeddings, {
        url: config.QDRANT_URL,
        collectionName: config.QDRANT_COLLECTION_NAME,
      });
    } else {
      logger.info(
        { collection: config.QDRANT_COLLECTION_NAME },
        "Qdrant 集合已存在"
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg }, "检查/创建 Qdrant 集合失败");
    throw err;
  }
}

/**
 * 将知识文档向量化并存入 Qdrant
 */
export async function upsertKnowledge(
  documents: KnowledgeDocument[]
): Promise<void> {
  if (documents.length === 0) {
    logger.warn("没有文档需要入库");
    return;
  }

  try {
    await ensureCollection();

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: config.QDRANT_URL,
        collectionName: config.QDRANT_COLLECTION_NAME,
      }
    );

    const docs = documents.map(
      (doc) =>
        new Document({
          pageContent: doc.text,
          metadata: doc.metadata,
        })
    );

    await vectorStore.addDocuments(docs);

    logger.info({ count: documents.length }, "知识文档已存入 Qdrant");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg }, "Qdrant 写入失败");
    throw new Error(`Qdrant 写入失败: ${errorMsg}`);
  }
}

/**
 * 语义搜索
 */
export async function searchKnowledge(
  query: string,
  limit: number = 5,
  scoreThreshold: number = 0.5
): Promise<
  Array<{
    text: string;
    score: number;
    metadata: Record<string, unknown>;
  }>
> {
  try {
    await ensureCollection();

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: config.QDRANT_URL,
        collectionName: config.QDRANT_COLLECTION_NAME,
      }
    );

    const results = await vectorStore.similaritySearchWithScore(query, limit);

    logger.info(
      { query, resultCount: results.length },
      "Qdrant 语义搜索完成"
    );

    return results
      .filter(([, score]) => score >= scoreThreshold)
      .map(([doc, score]) => ({
        text: doc.pageContent,
        score,
        metadata: doc.metadata,
      }));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg }, "Qdrant 搜索失败");
    throw new Error(`Qdrant 搜索失败: ${errorMsg}`);
  }
}

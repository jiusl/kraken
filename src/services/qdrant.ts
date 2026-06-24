/**
 * src/services/qdrant.ts
 * Qdrant 向量数据库服务封装 — 客户端 + 健康检查
 */
import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config/index.js";
import { logger } from "../tools/logger.js";
import type { ServiceStatus } from "./ollama.js";

// ============================================
// 健康检查
// ============================================

/**
 * 检测 Qdrant 服务是否可达
 */
export async function checkQdrantHealth(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const res = await fetch(`${config.QDRANT_URL}/collections`, {
      signal: AbortSignal.timeout(5000),
    });
    return {
      connected: res.ok,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================
// 客户端工厂
// ============================================

/**
 * QdrantClient 单例缓存
 */
let qdrantClient: QdrantClient | null = null;

/**
 * 获取（或创建）QdrantClient 实例
 */
export function createQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: config.QDRANT_URL,
      checkCompatibility: false,
    });
    logger.info({ url: config.QDRANT_URL }, "Qdrant 客户端已创建");
  }
  return qdrantClient;
}

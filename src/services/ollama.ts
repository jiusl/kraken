/**
 * src/services/ollama.ts
 * Ollama 服务封装 — LLM 兜底 + Embedding + 健康检查
 */
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { config } from "../config/index.js";
import { logger } from "../tools/logger.js";
import type { LLMClientOptions } from "./deepseek.js";

// ============================================
// 健康检查
// ============================================

export interface ServiceStatus {
  connected: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * 检测 Ollama 服务是否可达
 */
export async function checkOllamaHealth(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const res = await fetch(`${config.OLLAMA_BASE_URL}/api/tags`, {
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
// LLM 兜底工厂
// ============================================

/**
 * 创建 Ollama LLM 客户端（兜底用，1.5B 小模型）
 */
export function createOllamaLLM(options?: LLMClientOptions): ChatOpenAI {
  logger.info({ model: config.OLLAMA_FALLBACK_MODEL }, "使用 Ollama 兜底模型");
  return new ChatOpenAI({
    model: config.OLLAMA_FALLBACK_MODEL,
    temperature: options?.temperature ?? config.AGENT_TEMPERATURE,
    maxTokens: options?.maxTokens ?? 512,
    apiKey: "ollama",
    configuration: { baseURL: `${config.OLLAMA_BASE_URL}/v1` },
  });
}

// ============================================
// Embeddings 工厂
// ============================================

/**
 * 创建 Ollama OpenAIEmbeddings 实例
 */
export function createOllamaEmbeddings(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    model: config.OLLAMA_EMBEDDING_MODEL,
    apiKey: "ollama",
    configuration: {
      baseURL: `${config.OLLAMA_BASE_URL}/v1`,
    },
  });
}

// ============================================
// 向量化工具函数
// ============================================

/**
 * 将单段文本转为向量
 */
export async function embedText(text: string): Promise<number[]> {
  const embeddings = createOllamaEmbeddings();
  const result = await embeddings.embedQuery(text);
  logger.info({ textLength: text.length, dims: result.length }, "文本向量化完成");
  return result;
}

/**
 * 批量向量化
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings = createOllamaEmbeddings();
  const result = await embeddings.embedDocuments(texts);
  logger.info({ count: texts.length }, "批量向量化完成");
  return result;
}

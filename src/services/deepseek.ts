/**
 * src/services/deepseek.ts
 * DeepSeek 推理 API 服务封装 — LLM 客户端 + 健康检查
 */
import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config/index.js";
import { logger } from "../tools/logger.js";
import type { ServiceStatus } from "./ollama.js";

// ============================================
// 健康检查
// ============================================

/**
 * 检测 DeepSeek API 是否可达（发一个最小 token 请求）
 */
export async function checkDeepseekHealth(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const res = await fetch(`${config.DEEPSEEK_BASE_URL}/v1/models`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${config.DEEPSEEK_API_KEY}`,
      },
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
// LLM 客户端工厂
// ============================================

export interface LLMClientOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * 创建 DeepSeek ChatOpenAI 客户端
 */
export function createDeepseekLLM(options?: LLMClientOptions): ChatOpenAI {
  return new ChatOpenAI({
    model: config.DEEPSEEK_MODEL,
    temperature: options?.temperature ?? config.AGENT_TEMPERATURE,
    maxTokens: options?.maxTokens ?? 4096,
    apiKey: config.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: `${config.DEEPSEEK_BASE_URL}/v1`,
    },
  });
}

// ============================================
// 智能 LLM 工厂（自动降级）
// ============================================

/**
 * 创建 LLM 客户端，自动选择 DeepSeek 或 Ollama 兜底。
 *
 * - DEEPSEEK_API_KEY 已配置 → 使用 DeepSeek
 * - DEEPSEEK_API_KEY 为空 → 自动降级为 Ollama 小模型
 */
export async function createLLM(options?: LLMClientOptions): Promise<ChatOpenAI> {
  const { createOllamaLLM } = await import("./ollama.js");

  if (config.DEEPSEEK_API_KEY && config.DEEPSEEK_API_KEY.length > 0) {
    logger.info({ model: config.DEEPSEEK_MODEL }, "LLM 使用 DeepSeek API");
    return createDeepseekLLM(options);
  }

  logger.warn(
    { fallbackModel: config.OLLAMA_FALLBACK_MODEL },
    "DEEPSEEK_API_KEY 未配置，降级为 Ollama 兜底模型",
  );
  return createOllamaLLM(options);
}

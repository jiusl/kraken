import { z } from "zod";
import dotenv from "dotenv";

// 加载 .env 文件
dotenv.config();

/**
 * 环境变量 Schema（Zod 验证）
 */
const envSchema = z.object({
  // 服务
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Ollama
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_EMBEDDING_MODEL: z.string().default("embeddinggemma"),
  OLLAMA_FALLBACK_MODEL: z.string().default("qwen2.5:1.5b-instruct-q4_K_M"),

  // DeepSeek 推理 API（API Key 为空时自动降级为 Ollama 兜底）
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),

  // Qdrant
  QDRANT_URL: z.string().url().default("http://localhost:6333"),
  QDRANT_COLLECTION_NAME: z.string().default("kraken_knowledge"),

  // 文本切分
  CHUNK_SIZE: z.coerce.number().int().positive().default(1000),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(200),

  // SearXNG 搜索服务
  SEARXNG_URL: z.string().url().default("http://localhost:8080"),
  SEARXNG_ENABLED: z.coerce.boolean().default(true),

  // Agent 配置
  AGENT_MAX_ITERATIONS: z.coerce.number().int().positive().default(10),
  AGENT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),

  // 降级策略
  FALLBACK_TO_FIXED_FLOW: z.coerce.boolean().default(true),

  // 日志
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  LOG_FILE_PATH: z.string().default(""),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * 解析并验证环境变量
 */
function parseEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ 环境变量验证失败:");
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

/** 全局配置单例 */
export const config: EnvConfig = parseEnv();

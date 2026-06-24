/**
 * src/services/index.ts
 * 外部服务封装桶导出
 */
export {
  checkOllamaHealth,
  createOllamaEmbeddings,
  createOllamaLLM,
  embedText,
  embedTexts,
} from "./ollama.js";
export type { ServiceStatus } from "./ollama.js";

export {
  checkDeepseekHealth,
  createDeepseekLLM,
  createLLM,
} from "./deepseek.js";
export type { LLMClientOptions } from "./deepseek.js";

export { checkQdrantHealth, createQdrantClient } from "./qdrant.js";

export { checkSearxngHealth } from "./searxng.js";

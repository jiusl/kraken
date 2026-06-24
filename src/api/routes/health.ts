import { Hono } from "hono";
import type { HealthResponse } from "../../types/index.js";
import {
  checkOllamaHealth,
  checkDeepseekHealth,
  checkQdrantHealth,
  checkSearxngHealth,
} from "../../services/index.js";
import { config } from "../../config/index.js";

const health = new Hono();

/** 服务启动时间 */
const startTime = Date.now();

/**
 * GET /health
 * 健康检查端点，返回本服务及所有外部依赖的状态
 */
health.get("/health", async (c) => {
  // DeepSeek 未配置 API Key 时跳过健康检查
  const deepseekEnabled =
    config.DEEPSEEK_API_KEY && config.DEEPSEEK_API_KEY.length > 0;

  // 并行检测所有外部服务
  const [ollamaSvc, deepseekSvc, qdrantSvc, searxngSvc] = await Promise.all([
    checkOllamaHealth(),
    deepseekEnabled ? checkDeepseekHealth() : Promise.resolve(null),
    checkQdrantHealth(),
    checkSearxngHealth(),
  ]);

  const ollamaStatus: "connected" | "disconnected" =
    ollamaSvc.connected ? "connected" : "disconnected";

  const deepseekStatus: "connected" | "disabled" | "disconnected" =
    !deepseekEnabled
      ? "disabled"
      : deepseekSvc!.connected
        ? "connected"
        : "disconnected";

  const qdrantStatus: "connected" | "disconnected" =
    qdrantSvc.connected ? "connected" : "disconnected";

  const searxngStatus: "connected" | "disabled" | "disconnected" =
    !config.SEARXNG_ENABLED
      ? "disabled"
      : searxngSvc.connected
        ? "connected"
        : "disconnected";

  // 状态判定：
  // - ollama + qdrant 必须连通
  // - deepseek 如果启用则必须连通，若 disabled 则不参与判定
  const status: "ok" | "degraded" =
    ollamaStatus === "connected" &&
    qdrantStatus === "connected" &&
    (deepseekStatus === "connected" || deepseekStatus === "disabled")
      ? "ok"
      : "degraded";

  const response: HealthResponse = {
    status,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    services: {
      ollama: ollamaStatus,
      deepseek: deepseekStatus,
      qdrant: qdrantStatus,
      searxng: searxngStatus,
    },
    version: "1.0.0",
  };

  return c.json(response);
});

export { health as healthRoutes };

import { Hono } from "hono";
import { cors } from "hono/cors";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { healthRoutes } from "./routes/health.js";
import type { ErrorResponse } from "../types/index.js";
import { logger } from "../tools/index.js";
import { requestId, accessLog } from "./middleware/index.js";

/**
 * 创建 Hono 应用实例
 */
const app = new Hono();

// ---- 全局中间件（顺序重要）----
app.use("*", cors());           // 1. CORS
app.use("*", requestId);        // 2. 注入 X-Request-Id
app.use("*", accessLog);        // 3. 完整访问日志（替代 hono/logger）

// ---- 全局错误处理 ----
app.onError((err, c) => {
  logger.error({ error: err.message }, "未捕获的 API 错误");

  const errorResponse: ErrorResponse = {
    success: false,
    error: err.message,
    code: "INTERNAL_ERROR",
  };

  return c.json(errorResponse, 500);
});

// ---- 路由注册 ----
app.route("/", healthRoutes);
app.route("/knowledge", knowledgeRoutes);

export { app };

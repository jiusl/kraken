import { serve } from "@hono/node-server";
import { app } from "./api/app.js";
import { config } from "./config/index.js";
import { logger } from "./tools/index.js";
import { ensureCollection } from "./tools/index.js";

/**
 * Kraken 知识处理服务 —— 应用入口
 */
async function main() {
  logger.info("🚀 Kraken 知识处理服务启动中...");
  logger.info({ config: { port: config.PORT, env: config.NODE_ENV } }, "运行配置");

  // 预检：确保 Qdrant 集合存在
  try {
    await ensureCollection();
    logger.info("✅ Qdrant 集合就绪");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ error: errorMsg }, "⚠️ Qdrant 连接失败，部分功能不可用");
  }

  // 启动 HTTP 服务
  serve(
    {
      fetch: app.fetch,
      port: config.PORT,
    },
    (info) => {
      logger.info(
        `🌐 HTTP 服务已启动: http://localhost:${info.port}`
      );
      logger.info(`📋 健康检查: http://localhost:${info.port}/health`);
      logger.info(
        `📥 知识处理: POST http://localhost:${info.port}/knowledge/process`
      );
      logger.info(
        `🔍 知识搜索: POST http://localhost:${info.port}/knowledge/search`
      );
    }
  );
}

// 优雅退出
process.on("SIGINT", () => {
  logger.info("🛑 收到 SIGINT，正在关闭服务...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("🛑 收到 SIGTERM，正在关闭服务...");
  process.exit(0);
});

main().catch((err) => {
  logger.error({ error: err }, "服务启动失败");
  process.exit(1);
});

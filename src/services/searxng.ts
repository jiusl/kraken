/**
 * src/services/searxng.ts
 * SearXNG 搜索服务封装 — 健康检查
 *
 * 搜索功能本身由 src/tools/searchTool.ts 提供，
 * 本文件只负责服务连通性检测。
 */
import { config } from "../config/index.js";
import type { ServiceStatus } from "./ollama.js";

// ============================================
// 健康检查
// ============================================

/**
 * 检测 SearXNG 服务是否可达
 */
export async function checkSearxngHealth(): Promise<ServiceStatus> {
  if (!config.SEARXNG_ENABLED) {
    return { connected: false, error: "SearXNG 已通过配置禁用" };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${config.SEARXNG_URL}/search?q=test&format=json`, {
      signal: AbortSignal.timeout(8000),
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

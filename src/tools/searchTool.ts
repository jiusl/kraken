/**
 * src/tools/searchTool.ts
 * SearXNG 搜索工具 — Agent 专用
 */
import axios from "axios";
import { config } from "../config/index.js";
import { logger } from "./logger.js";
import type { SearchResult } from "../types/index.js";

/**
 * 通过 SearXNG 搜索网页
 *
 * @param query - 搜索关键词
 * @param maxResults - 最大结果数
 * @returns 搜索结果列表
 */
export async function searchWeb(
  query: string,
  maxResults: number = 5,
): Promise<SearchResult[]> {
  if (!config.SEARXNG_ENABLED) {
    logger.warn("SearXNG 搜索服务未启用");
    throw new Error("搜索服务未启用，请使用 /knowledge/process 手动提供 URL");
  }

  const url = `${config.SEARXNG_URL}/search`;

  logger.info({ query, maxResults }, "开始 SearXNG 搜索");

  try {
    const response = await axios.get(url, {
      params: {
        q: query,
        format: "json",
        language: "zh-CN",
        categories: "general",
        pageno: 1,
      },
      timeout: 10_000,
    });

    const results: SearchResult[] = (response.data.results ?? [])
      .slice(0, maxResults)
      .map((r: Record<string, unknown>) => ({
        title: String(r.title ?? ""),
        url: String(r.url ?? ""),
        snippet: String(r.content ?? r.snippet ?? ""),
        engine: String(r.engine ?? ""),
      }));

    logger.info(
      { query, totalHits: response.data.results?.length, returned: results.length },
      "SearXNG 搜索完成",
    );

    return results;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // 区分网络错误和 SearXNG 返回的错误
    if (axios.isAxiosError(err) && err.code === "ECONNREFUSED") {
      logger.error({ error: errorMsg }, "SearXNG 服务不可达");
      throw new Error(
        "SearXNG 搜索服务不可达，请确认服务已启动在 " + config.SEARXNG_URL,
      );
    }

    logger.error({ error: errorMsg }, "SearXNG 搜索失败");
    throw new Error(`搜索失败: ${errorMsg}`);
  }
}

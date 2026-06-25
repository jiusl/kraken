/**
 * src/tools/searchTool.ts
 * SearXNG 搜索工具 — Agent 专用
 */
import axios from "axios";
import { config } from "../config/index.js";
import { logger } from "./logger.js";
import type { SearchResult } from "../types/index.js";

/**
 * 解析环境变量中的域名黑名单
 */
function parseBlockedDomains(): Set<string> {
  const raw = config.BLOCKED_DOMAINS || "";
  return new Set(
    raw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * 判断 URL 是否在黑名单域名下
 */
function isBlocked(url: string, blocked: Set<string>): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // 精确匹配 & 子域名匹配
    for (const domain of blocked) {
      if (hostname === domain || hostname.endsWith("." + domain)) {
        return true;
      }
    }
  } catch {
    // URL 解析失败，保守起见不过滤
  }
  return false;
}

/**
 * 通过 SearXNG 搜索网页
 *
 * @param query - 搜索关键词
 * @param maxResults - 最大结果数
 * @returns 搜索结果列表（已过滤黑名单域名）
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
  const blocked = parseBlockedDomains();

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

    const rawResults: SearchResult[] = (response.data.results ?? [])
      .map((r: Record<string, unknown>) => ({
        title: String(r.title ?? ""),
        url: String(r.url ?? ""),
        snippet: String(r.content ?? r.snippet ?? ""),
        engine: String(r.engine ?? ""),
      }));

    // 过滤掉黑名单域名
    const filtered: SearchResult[] = [];
    const skipped: string[] = [];
    for (const r of rawResults) {
      if (isBlocked(r.url, blocked)) {
        skipped.push(r.url);
      } else {
        filtered.push(r);
      }
    }

    const results = filtered.slice(0, maxResults);

    if (skipped.length > 0) {
      logger.info(
        { skippedCount: skipped.length, skippedDomains: skipped.map((u) => {
          try { return new URL(u).hostname; } catch { return u; }
        }) },
        "已过滤无法访问的网址",
      );
    }

    logger.info(
      { query, totalHits: rawResults.length, afterFilter: filtered.length, returned: results.length },
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

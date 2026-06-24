import { getHTMLContent, HTMLToMarkdown } from "@langgraph-js/crawler";
import type { CrawledPage, CrawledContent } from "../types/index.js";
import { logger } from "./logger.js";

/**
 * 从 HTML 中提取标题
 */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : "";
}

/**
 * 爬取单个网页，返回 Markdown 格式内容
 */
export async function crawlSinglePage(url: string): Promise<CrawledPage> {
  try {
    const html = await getHTMLContent(url);
    const title = extractTitle(html);
    const content = HTMLToMarkdown(html);

    logger.info({ url, title, contentLength: content.length }, "页面爬取成功");

    return {
      url,
      title,
      content,
      crawledAt: new Date().toISOString(),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ url, error: errorMsg }, "页面爬取失败");
    return {
      url,
      title: "",
      content: "",
      crawledAt: new Date().toISOString(),
      error: errorMsg,
    };
  }
}

/**
 * 批量爬取 URL 列表
 */
export async function crawlWebsites(urls: string[]): Promise<CrawledContent> {
  logger.info({ urlCount: urls.length }, "开始批量爬取网页");

  const pages: CrawledPage[] = [];

  // 逐个爬取（避免并发过高）
  for (const url of urls) {
    const result = await crawlSinglePage(url);
    pages.push(result);
  }

  const successCount = pages.filter((p) => !p.error).length;
  const failCount = pages.filter((p) => p.error).length;

  logger.info({ successCount, failCount }, "批量爬取完成");

  return { pages, successCount, failCount };
}

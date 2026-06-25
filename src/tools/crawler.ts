import puppeteer, { type Browser, type Page } from "puppeteer";
import type { CrawledPage, CrawledContent } from "../types/index.js";
import { logger } from "./logger.js";

// ============================================
// Puppeteer 配置
// ============================================

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--single-process",
];

/** 浏览器单例（延迟初始化） */
let _browser: Browser | null = null;

/**
 * 获取或创建 Puppeteer 浏览器实例
 */
async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";

  _browser = await puppeteer.launch({
    executablePath,
    args: BROWSER_ARGS,
    headless: true,
  });

  logger.info({ executablePath }, "Puppeteer 浏览器已启动");
  return _browser;
}

/**
 * 用已打开的 Page 爬取单个 URL，返回纯文本内容
 */
async function fetchPageContent(page: Page, url: string): Promise<CrawledPage> {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  // evaluate 回调在浏览器上下文执行
  const result = await page.evaluate(() => {
    document
      .querySelectorAll("script, style, nav, footer, header, iframe, noscript")
      .forEach((el) => el.remove());
    return {
      title: document.title || "",
      content: document.body?.innerText || "",
    };
  });

  // 清理文本：移除空行、压缩空白
  const cleaned = result.content
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");

  return {
    url,
    title: result.title.trim(),
    content: cleaned,
    crawledAt: new Date().toISOString(),
  };
}

// ============================================
// 公开 API
// ============================================

/**
 * 批量爬取 URL 列表（复用同一个浏览器实例）
 */
export async function crawlWebsites(urls: string[]): Promise<CrawledContent> {
  logger.info({ urlCount: urls.length }, "开始批量爬取网页");

  const browser = await getBrowser();
  const pages: CrawledPage[] = [];

  for (const url of urls) {
    let page: Page | null = null;
    try {
      page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);
      const result = await fetchPageContent(page, url);
      logger.info({ url, title: result.title, contentLength: result.content.length }, "页面爬取成功");
      pages.push(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ url, error: errorMsg }, "页面爬取失败");
      pages.push({
        url,
        title: "",
        content: "",
        crawledAt: new Date().toISOString(),
        error: errorMsg,
      });
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  const successCount = pages.filter((p) => !p.error).length;
  const failCount = pages.filter((p) => p.error).length;
  logger.info({ successCount, failCount }, "批量爬取完成");

  return { pages, successCount, failCount };
}

/**
 * 爬取单个网页（便捷方法，每次独立浏览器）
 */
export async function crawlSinglePage(url: string): Promise<CrawledPage> {
  const result = await crawlWebsites([url]);
  return result.pages[0];
}

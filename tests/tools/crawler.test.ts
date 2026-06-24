/**
 * tests/tools/crawler.test.ts
 * 爬虫工具函数的单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @langgraph-js/crawler
vi.mock("@langgraph-js/crawler", () => ({
  getHTMLContent: vi.fn(),
  HTMLToMarkdown: vi.fn(),
}));

import { getHTMLContent, HTMLToMarkdown } from "@langgraph-js/crawler";
import { crawlWebsites } from "../../src/tools/crawler.js";

describe("crawlWebsites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("成功爬取", () => {
    it("应返回爬取成功的页面内容", async () => {
      const mockHtml = "<html><head><title>Test Page</title></head><body><p>Hello World</p></body></html>";
      const mockMarkdown = "Hello World";

      vi.mocked(getHTMLContent).mockResolvedValue(mockHtml);
      vi.mocked(HTMLToMarkdown).mockReturnValue(mockMarkdown);

      const result = await crawlWebsites(["https://example.com"]);

      expect(result.successCount).toBe(1);
      expect(result.failCount).toBe(0);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].url).toBe("https://example.com");
      expect(result.pages[0].title).toBe("Test Page");
      expect(result.pages[0].content).toBe("Hello World");
      expect(result.pages[0].error).toBeUndefined();
      expect(result.pages[0].crawledAt).toBeDefined();
    });

    it("应正确提取中文标题", async () => {
      const mockHtml = "<html><head><title>中文测试页面</title></head><body><p>内容</p></body></html>";

      vi.mocked(getHTMLContent).mockResolvedValue(mockHtml);
      vi.mocked(HTMLToMarkdown).mockReturnValue("内容");

      const result = await crawlWebsites(["https://example.com"]);

      expect(result.pages[0].title).toBe("中文测试页面");
    });

    it("应处理无标题的页面", async () => {
      const mockHtml = "<html><body><p>No title</p></body></html>";

      vi.mocked(getHTMLContent).mockResolvedValue(mockHtml);
      vi.mocked(HTMLToMarkdown).mockReturnValue("No title");

      const result = await crawlWebsites(["https://example.com"]);

      expect(result.pages[0].title).toBe("");
    });

    it("批量爬取多个 URL", async () => {
      vi.mocked(getHTMLContent)
        .mockResolvedValueOnce("<html><title>A</title></html>")
        .mockResolvedValueOnce("<html><title>B</title></html>")
        .mockResolvedValueOnce("<html><title>C</title></html>");
      vi.mocked(HTMLToMarkdown).mockReturnValue("content");

      const result = await crawlWebsites([
        "https://a.com",
        "https://b.com",
        "https://c.com",
      ]);

      expect(result.pages).toHaveLength(3);
      expect(result.successCount).toBe(3);
      expect(result.failCount).toBe(0);
    });
  });

  describe("爬取失败", () => {
    it("爬取失败时不应抛出异常，页面的 error 字段应有内容", async () => {
      vi.mocked(getHTMLContent).mockRejectedValue(new Error("Network error"));

      const result = await crawlWebsites(["https://broken.link"]);

      expect(result.failCount).toBe(1);
      expect(result.successCount).toBe(0);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].error).toBe("Network error");
      expect(result.pages[0].content).toBe("");
      expect(result.pages[0].title).toBe("");
    });

    it("部分成功部分失败", async () => {
      vi.mocked(getHTMLContent)
        .mockResolvedValueOnce("<html><title>OK</title></html>")
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce("<html><title>Also OK</title></html>");
      vi.mocked(HTMLToMarkdown).mockReturnValue("markdown");

      const result = await crawlWebsites([
        "https://ok.com",
        "https://bad.com",
        "https://also-ok.com",
      ]);

      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(1);
      expect(result.pages).toHaveLength(3);
    });
  });

  describe("空 URL 列表", () => {
    it("空数组应返回空结果", async () => {
      const result = await crawlWebsites([]);

      expect(result.pages).toEqual([]);
      expect(result.successCount).toBe(0);
      expect(result.failCount).toBe(0);
    });
  });

  describe("非 Error 对象异常", () => {
    it("应处理字符串类型的异常", async () => {
      vi.mocked(getHTMLContent).mockRejectedValue("String error");

      const result = await crawlWebsites(["https://example.com"]);

      expect(result.pages[0].error).toBe("String error");
    });

    it("应处理 object 类型的异常", async () => {
      vi.mocked(getHTMLContent).mockRejectedValue({ code: 500 });

      const result = await crawlWebsites(["https://example.com"]);

      expect(result.pages[0].error).toBe("[object Object]");
    });
  });
});

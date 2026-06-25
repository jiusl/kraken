/**
 * tests/tools/crawler.test.ts
 * 爬虫工具函数的单元测试（Puppeteer 实现）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock puppeteer
const mockNewPage = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockBrowserClose = vi.fn();
const mockLaunch = vi.fn();

vi.mock("puppeteer", () => ({
  default: {
    launch: (...args: unknown[]) => {
      mockLaunch(...args);
      return Promise.resolve({
        isConnected: () => true,
        newPage: mockNewPage,
        close: mockBrowserClose,
      });
    },
  },
}));

import { crawlWebsites, crawlSinglePage } from "../../src/tools/crawler.js";

function createMockPage(opts: {
  title: string;
  content: string;
  gotoError?: string;
}) {
  return {
    goto: vi.fn().mockImplementation(() => {
      if (opts.gotoError) throw new Error(opts.gotoError);
      return Promise.resolve();
    }),
    evaluate: vi.fn().mockResolvedValue({
      title: opts.title,
      content: opts.content,
    }),
    setUserAgent: vi.fn().mockResolvedValue(undefined),
    close: mockClose,
  };
}

describe("crawlWebsites (Puppeteer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("成功爬取", () => {
    it("应返回爬取成功的页面内容", async () => {
      mockNewPage.mockResolvedValue(
        createMockPage({ title: "Test Page", content: "Hello World" }),
      );

      const result = await crawlWebsites(["https://example.com"]);

      expect(result.successCount).toBe(1);
      expect(result.failCount).toBe(0);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].url).toBe("https://example.com");
      expect(result.pages[0].title).toBe("Test Page");
      expect(result.pages[0].content).toBe("Hello World");
      expect(result.pages[0].error).toBeUndefined();
      expect(result.pages[0].crawledAt).toBeDefined();
      expect(mockClose).toHaveBeenCalled();
    });

    it("应正确提取中文标题", async () => {
      mockNewPage.mockResolvedValue(
        createMockPage({ title: "中文测试页面", content: "内容" }),
      );

      const result = await crawlWebsites(["https://example.com"]);

      expect(result.pages[0].title).toBe("中文测试页面");
    });

    it("应处理无标题的页面", async () => {
      mockNewPage.mockResolvedValue(
        createMockPage({ title: "", content: "No title body" }),
      );

      const result = await crawlWebsites(["https://example.com"]);

      expect(result.pages[0].title).toBe("");
    });

    it("批量爬取多个 URL", async () => {
      mockNewPage
        .mockResolvedValueOnce(createMockPage({ title: "A", content: "a" }))
        .mockResolvedValueOnce(createMockPage({ title: "B", content: "b" }))
        .mockResolvedValueOnce(createMockPage({ title: "C", content: "c" }));

      const result = await crawlWebsites([
        "https://a.com",
        "https://b.com",
        "https://c.com",
      ]);

      expect(result.pages).toHaveLength(3);
      expect(result.successCount).toBe(3);
      expect(result.failCount).toBe(0);
    });

    it("应清理文本中的空白行", async () => {
      mockNewPage.mockResolvedValue(
        createMockPage({
          title: "T",
          content: "line1\n    \n\n\n\n\n  line2  \nline3",
        }),
      );

      const result = await crawlWebsites(["https://example.com"]);
      expect(result.pages[0].content).toBe("line1\nline2\nline3");
    });
  });

  describe("爬取失败", () => {
    it("爬取失败时不应抛出异常，页面的 error 字段应有内容", async () => {
      mockNewPage.mockResolvedValue(
        createMockPage({ title: "", content: "", gotoError: "Network error" }),
      );

      const result = await crawlWebsites(["https://broken.link"]);

      expect(result.failCount).toBe(1);
      expect(result.successCount).toBe(0);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].error).toBe("Network error");
      expect(result.pages[0].content).toBe("");
      expect(result.pages[0].title).toBe("");
    });

    it("部分成功部分失败", async () => {
      mockNewPage
        .mockResolvedValueOnce(createMockPage({ title: "OK", content: "ok" }))
        .mockResolvedValueOnce(
          createMockPage({ title: "", content: "", gotoError: "Timeout" }),
        )
        .mockResolvedValueOnce(
          createMockPage({ title: "Also OK", content: "also ok" }),
        );

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
});

describe("crawlSinglePage", () => {
  it("应返回单个页面结果", async () => {
    mockNewPage.mockResolvedValue(
      createMockPage({ title: "Single", content: "page" }),
    );

    const result = await crawlSinglePage("https://example.com");

    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Single");
  });
});


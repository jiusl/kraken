/**
 * tests/nodes/crawler.test.ts
 * crawlerNode 节点单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 工具函数
vi.mock("../../src/tools/crawler.js", () => ({
  crawlWebsites: vi.fn(),
}));

vi.mock("../../src/tools/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { crawlWebsites } from "../../src/tools/crawler.js";
import { crawlerNode } from "../../src/nodes/crawler.js";
import type { KnowledgeStateType } from "../../src/state/index.js";

describe("crawlerNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 构建最小状态
  function createState(overrides: Partial<KnowledgeStateType> = {}): KnowledgeStateType {
    return {
      messages: [],
      urls: [],
      query: "",
      crawledContent: null,
      chunks: [],
      processedData: [],
      status: "pending",
      error: null,
      taskId: "test-task-1",
      ...overrides,
    } as KnowledgeStateType;
  }

  describe("空 URL 列表", () => {
    it("空 URL 列表应返回 done 状态", async () => {
      const state = createState({ urls: [] });
      const result = await crawlerNode(state);

      expect(result.status).toBe("done");
      expect(result.messages?.[0]).toContain("URL 列表为空");
    });
  });

  describe("正常爬取", () => {
    it("成功爬取后应返回 processing 状态和内容", async () => {
      const mockContent = {
        pages: [
          {
            url: "https://example.com",
            title: "Example",
            content: "Hello World",
            crawledAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        successCount: 1,
        failCount: 0,
      };

      vi.mocked(crawlWebsites).mockResolvedValue(mockContent);

      const state = createState({ urls: ["https://example.com"] });
      const result = await crawlerNode(state);

      expect(result.status).toBe("processing");
      expect(result.crawledContent).toEqual(mockContent);
      expect(result.messages?.[0]).toContain("成功 1");
      expect(crawlWebsites).toHaveBeenCalledWith(["https://example.com"]);
    });

    it("部分失败时应正确统计", async () => {
      const mockContent = {
        pages: [
          { url: "https://ok.com", title: "OK", content: "ok", crawledAt: "2024-01-01T00:00:00.000Z" },
          { url: "https://bad.com", title: "", content: "", crawledAt: "2024-01-01T00:00:00.000Z", error: "Timeout" },
        ],
        successCount: 1,
        failCount: 1,
      };

      vi.mocked(crawlWebsites).mockResolvedValue(mockContent);

      const state = createState({ urls: ["https://ok.com", "https://bad.com"] });
      const result = await crawlerNode(state);

      expect(result.status).toBe("processing");
      expect(result.messages?.[0]).toContain("失败 1");
    });
  });

  describe("爬取异常", () => {
    it("crawlWebsites 抛出异常时应返回 error 状态", async () => {
      vi.mocked(crawlWebsites).mockRejectedValue(new Error("Connection refused"));

      const state = createState({ urls: ["https://example.com"] });
      const result = await crawlerNode(state);

      expect(result.status).toBe("error");
      expect(result.error).toBe("Connection refused");
      expect(result.messages?.[0]).toContain("爬取失败");
    });
  });
});

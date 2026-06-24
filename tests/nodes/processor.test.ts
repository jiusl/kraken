/**
 * tests/nodes/processor.test.ts
 * processorNode 节点单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 工具函数
vi.mock("../../src/tools/text.js", () => ({
  chunkText: vi.fn(),
}));

vi.mock("../../src/tools/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { chunkText } from "../../src/tools/text.js";
import { processorNode } from "../../src/nodes/processor.js";
import type { KnowledgeStateType } from "../../src/state/index.js";

describe("processorNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  describe("空内容", () => {
    it("crawledContent 为 null 时应返回 error", async () => {
      const state = createState({ crawledContent: null });
      const result = await processorNode(state);

      expect(result.status).toBe("error");
      expect(result.error).toBe("没有可处理的爬取内容");
    });

    it("crawledContent.pages 为空数组时应返回 error", async () => {
      const state = createState({
        crawledContent: {
          pages: [],
          successCount: 0,
          failCount: 0,
        },
      });
      const result = await processorNode(state);

      expect(result.status).toBe("error");
    });
  });

  describe("正常处理", () => {
    it("成功页面应被切分成文本块", async () => {
      vi.mocked(chunkText).mockReturnValue([
        { id: "1", sourceUrl: "https://a.com", text: "chunkA", index: 0, charCount: 6 },
        { id: "2", sourceUrl: "https://a.com", text: "chunkB", index: 1, charCount: 6 },
      ]);

      const state = createState({
        crawledContent: {
          pages: [
            {
              url: "https://a.com",
              title: "A",
              content: "Some content here",
              crawledAt: "2024-01-01T00:00:00.000Z",
            },
          ],
          successCount: 1,
          failCount: 0,
        },
      });

      const result = await processorNode(state);

      expect(result.status).toBe("processing");
      expect(result.chunks).toHaveLength(2);
      expect(chunkText).toHaveBeenCalledWith("Some content here", "https://a.com");
    });

    it("应跳过失败的页面", async () => {
      vi.mocked(chunkText).mockReturnValue([
        { id: "1", sourceUrl: "https://ok.com", text: "content", index: 0, charCount: 7 },
      ]);

      const state = createState({
        crawledContent: {
          pages: [
            {
              url: "https://ok.com",
              title: "OK",
              content: "content",
              crawledAt: "2024-01-01T00:00:00.000Z",
            },
            {
              url: "https://bad.com",
              title: "",
              content: "",
              crawledAt: "2024-01-01T00:00:00.000Z",
              error: "Failed",
            },
          ],
          successCount: 1,
          failCount: 1,
        },
      });

      const result = await processorNode(state);

      // 只处理成功页面，失败页面被跳过
      expect(chunkText).toHaveBeenCalledTimes(1);
      expect(chunkText).toHaveBeenCalledWith("content", "https://ok.com");
      expect(result.chunks).toHaveLength(1);
    });

    it("多页面应被分别切分", async () => {
      vi.mocked(chunkText)
        .mockReturnValueOnce([
          { id: "1", sourceUrl: "https://a.com", text: "chunkA", index: 0, charCount: 6 },
        ])
        .mockReturnValueOnce([
          { id: "2", sourceUrl: "https://b.com", text: "chunkB", index: 0, charCount: 6 },
        ]);

      const state = createState({
        crawledContent: {
          pages: [
            { url: "https://a.com", title: "A", content: "AAA", crawledAt: "2024-01-01T00:00:00.000Z" },
            { url: "https://b.com", title: "B", content: "BBB", crawledAt: "2024-01-01T00:00:00.000Z" },
          ],
          successCount: 2,
          failCount: 0,
        },
      });

      const result = await processorNode(state);

      expect(chunkText).toHaveBeenCalledTimes(2);
      expect(result.chunks).toHaveLength(2);
    });

    it("空白内容的成功页面应被跳过", async () => {
      vi.mocked(chunkText).mockReturnValue([]);

      const state = createState({
        crawledContent: {
          pages: [
            {
              url: "https://empty.com",
              title: "Empty",
              content: "   ",
              crawledAt: "2024-01-01T00:00:00.000Z",
            },
          ],
          successCount: 1,
          failCount: 0,
        },
      });

      const result = await processorNode(state);

      // 空白内容不应调用 chunkText
      expect(chunkText).not.toHaveBeenCalled();
      expect(result.chunks).toHaveLength(0);
    });
  });

  describe("异常处理", () => {
    it("chunkText 抛出异常时应返回 error 状态", async () => {
      vi.mocked(chunkText).mockImplementation(() => {
        throw new Error("Regex error");
      });

      const state = createState({
        crawledContent: {
          pages: [
            {
              url: "https://example.com",
              title: "Test",
              content: "Bad regex input",
              crawledAt: "2024-01-01T00:00:00.000Z",
            },
          ],
          successCount: 1,
          failCount: 0,
        },
      });

      const result = await processorNode(state);

      expect(result.status).toBe("error");
      expect(result.error).toContain("Regex error");
    });
  });
});

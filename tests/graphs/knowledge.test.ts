/**
 * tests/graphs/knowledge.test.ts
 * LangGraph 工作流集成测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 所有节点依赖
vi.mock("../../src/nodes/crawler.js", () => ({
  crawlerNode: vi.fn(),
}));
vi.mock("../../src/nodes/processor.js", () => ({
  processorNode: vi.fn(),
}));
vi.mock("../../src/nodes/summarizer.js", () => ({
  summarizerNode: vi.fn(),
}));
vi.mock("../../src/nodes/behaviorChangeTest.js", () => ({
  behaviorChangeTestNode: vi.fn(),
}));
vi.mock("../../src/nodes/qdrant.js", () => ({
  qdrantNode: vi.fn(),
}));
vi.mock("../../src/tools/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { crawlerNode } from "../../src/nodes/crawler.js";
import { processorNode } from "../../src/nodes/processor.js";
import { summarizerNode } from "../../src/nodes/summarizer.js";
import { behaviorChangeTestNode } from "../../src/nodes/behaviorChangeTest.js";
import { qdrantNode } from "../../src/nodes/qdrant.js";
import { runKnowledgePipeline } from "../../src/graphs/knowledge.js";

describe("runKnowledgePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("正常流程", () => {
    it("完整流水线：crawler → processor → summarizer → qdrant 全部执行", async () => {
      vi.mocked(crawlerNode).mockResolvedValue({
        status: "processing",
        crawledContent: {
          pages: [
            { url: "https://example.com", title: "Test", content: "Hello", crawledAt: "2024-01-01T00:00:00.000Z" },
          ],
          successCount: 1,
          failCount: 0,
        },
      });

      vi.mocked(processorNode).mockResolvedValue({
        status: "processing",
        chunks: [{ id: "1", sourceUrl: "https://example.com", text: "Hello", index: 0, charCount: 5 }],
      });

      vi.mocked(summarizerNode).mockResolvedValue({
        status: "processing",
        processedData: [
          {
            summary: "摘要",
            keywords: ["test"],
            sourceUrl: "https://example.com",
            processedAt: "2024-01-01T00:00:00.000Z",
            originalTokenEstimate: 10,
            summaryTokenEstimate: 2,
          },
        ],
      });

      vi.mocked(behaviorChangeTestNode).mockResolvedValue({
        status: "processing",
        processedData: [
          {
            summary: "摘要",
            keywords: ["test"],
            sourceUrl: "https://example.com",
            processedAt: "2024-01-01T00:00:00.000Z",
            originalTokenEstimate: 10,
            summaryTokenEstimate: 2,
          },
        ],
        passedTestCount: 1,
        filteredCount: 0,
      });

      vi.mocked(qdrantNode).mockResolvedValue({
        status: "done",
      });

      const result = await runKnowledgePipeline(["https://example.com"]);

      expect(crawlerNode).toHaveBeenCalledTimes(1);
      expect(processorNode).toHaveBeenCalledTimes(1);
      expect(summarizerNode).toHaveBeenCalledTimes(1);
      expect(behaviorChangeTestNode).toHaveBeenCalledTimes(1);
      expect(qdrantNode).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("done");
      expect(result.taskId).toMatch(/^task-/);
    });
  });

  describe("crawlerNode 抛出错误时短路", () => {
    it("crawler 失败后不应继续执行后续节点", async () => {
      vi.mocked(crawlerNode).mockResolvedValue({
        status: "error",
        error: "Connection refused",
      });

      // processor 不应该被调用（但由于 LangGraph 内部机制，
      // 条件边会在 status=error 时路由到 END）
      const result = await runKnowledgePipeline(["https://bad.url"]);

      expect(crawlerNode).toHaveBeenCalledTimes(1);
      // 错误状态触发条件路由 → END，processor 不应被调用
      expect(processorNode).not.toHaveBeenCalled();
      expect(summarizerNode).not.toHaveBeenCalled();
      expect(qdrantNode).not.toHaveBeenCalled();
      expect(result.status).toBe("error");
      expect(result.error).toBe("Connection refused");
    });
  });

  describe("processorNode 抛出错误时短路", () => {
    it("processor 失败后不应继续执行 summarizer 和 qdrant", async () => {
      vi.mocked(crawlerNode).mockResolvedValue({
        status: "processing",
        crawledContent: {
          pages: [{ url: "https://example.com", title: "Test", content: "Hello", crawledAt: "2024-01-01T00:00:00.000Z" }],
          successCount: 1,
          failCount: 0,
        },
      });

      vi.mocked(processorNode).mockResolvedValue({
        status: "error",
        error: "文本处理失败",
      });

      const result = await runKnowledgePipeline(["https://example.com"]);

      expect(crawlerNode).toHaveBeenCalledTimes(1);
      expect(processorNode).toHaveBeenCalledTimes(1);
      expect(summarizerNode).not.toHaveBeenCalled();
      expect(qdrantNode).not.toHaveBeenCalled();
      expect(result.status).toBe("error");
    });
  });

  describe("query 参数传递", () => {
    it("应把 query 传入初始状态", async () => {
      vi.mocked(crawlerNode).mockImplementation(async (state: Record<string, unknown>) => ({
        status: "processing",
        query: state.query,
      }));

      const result = await runKnowledgePipeline(
        ["https://example.com"],
        "关注技术架构细节",
      );

      expect(result.query).toBe("关注技术架构细节");
    });
  });

  describe("taskId 生成", () => {
    it("每次调用应生成唯一的 taskId", async () => {
      vi.mocked(crawlerNode).mockResolvedValue({ status: "processing" });
      vi.mocked(processorNode).mockResolvedValue({ status: "processing" });
      vi.mocked(summarizerNode).mockResolvedValue({ status: "processing" });
      vi.mocked(qdrantNode).mockResolvedValue({ status: "done" });

      const result1 = await runKnowledgePipeline(["https://a.com"]);
      const result2 = await runKnowledgePipeline(["https://b.com"]);

      expect(result1.taskId).not.toBe(result2.taskId);
      expect(result1.taskId).toMatch(/^task-\d+-[a-z0-9]{5}$/);
    });
  });

  describe("空 URL 列表", () => {
    it("应能处理空 URL 列表（由 crawlerNode 处理）", async () => {
      vi.mocked(crawlerNode).mockResolvedValue({
        status: "done",
        messages: ["⚠️ URL 列表为空"],
      });

      const result = await runKnowledgePipeline([]);

      expect(crawlerNode).toHaveBeenCalledTimes(1);
      expect(result.urls).toEqual([]);
    });
  });
});

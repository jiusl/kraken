/**
 * tests/nodes/qdrant.test.ts
 * qdrantNode 节点单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 工具函数
vi.mock("../../src/tools/qdrant.js", () => ({
  upsertKnowledge: vi.fn(),
  ensureCollection: vi.fn(),
  searchKnowledge: vi.fn(),
}));

vi.mock("../../src/tools/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { upsertKnowledge } from "../../src/tools/qdrant.js";
import { qdrantNode } from "../../src/nodes/qdrant.js";
import type { KnowledgeStateType } from "../../src/state/index.js";
import type { TextChunk, ProcessedData } from "../../src/types/index.js";

describe("qdrantNode", () => {
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

  describe("空数据", () => {
    it("chunks 和 processedData 都为空时应返回 done", async () => {
      const state = createState({ chunks: [], processedData: [] });
      const result = await qdrantNode(state);

      expect(result.status).toBe("done");
      expect(upsertKnowledge).not.toHaveBeenCalled();
    });
  });

  describe("正常入库", () => {
    it("应将 chunk 和对应的 processedData 组合为 KnowledgeDocument", async () => {
      vi.mocked(upsertKnowledge).mockResolvedValue(undefined);

      const chunks: TextChunk[] = [
        { id: "c1", sourceUrl: "https://a.com", text: "文本块1", index: 0, charCount: 4 },
        { id: "c2", sourceUrl: "https://a.com", text: "文本块2", index: 1, charCount: 4 },
      ];

      const processedData: ProcessedData[] = [
        {
          summary: "摘要A",
          keywords: ["关键词1"],
          sourceUrl: "https://a.com",
          processedAt: "2024-01-01T00:00:00.000Z",
          originalTokenEstimate: 100,
          summaryTokenEstimate: 20,
        },
      ];

      const state = createState({ chunks, processedData });
      const result = await qdrantNode(state);

      expect(result.status).toBe("done");
      expect(upsertKnowledge).toHaveBeenCalledTimes(1);

      const documents = vi.mocked(upsertKnowledge).mock.calls[0][0];
      expect(documents).toHaveLength(2);
      expect(documents[0].text).toBe("文本块1");
      expect(documents[0].metadata.summary).toBe("摘要A");
      expect(documents[0].metadata.keywords).toEqual(["关键词1"]);
    });

    it("chunk 无对应 processedData 时 metadata 应为空值", async () => {
      vi.mocked(upsertKnowledge).mockResolvedValue(undefined);

      const chunks: TextChunk[] = [
        { id: "c1", sourceUrl: "https://a.com", text: "文本", index: 0, charCount: 2 },
      ];

      const state = createState({ chunks, processedData: [] });
      await qdrantNode(state);

      const documents = vi.mocked(upsertKnowledge).mock.calls[0][0];
      expect(documents[0].metadata.summary).toBe("");
      expect(documents[0].metadata.keywords).toEqual([]);
    });
  });

  describe("异常处理", () => {
    it("upsertKnowledge 失败时应返回 error 状态", async () => {
      vi.mocked(upsertKnowledge).mockRejectedValue(new Error("Qdrant connection refused"));

      const chunks: TextChunk[] = [
        { id: "c1", sourceUrl: "https://a.com", text: "文本", index: 0, charCount: 2 },
      ];

      const state = createState({ chunks });
      const result = await qdrantNode(state);

      expect(result.status).toBe("error");
      expect(result.error).toContain("Qdrant connection refused");
    });
  });

  describe("消息", () => {
    it("成功入库后应包含文档数量", async () => {
      vi.mocked(upsertKnowledge).mockResolvedValue(undefined);

      const chunks: TextChunk[] = [
        { id: "c1", sourceUrl: "https://a.com", text: "A", index: 0, charCount: 1 },
        { id: "c2", sourceUrl: "https://a.com", text: "B", index: 1, charCount: 1 },
        { id: "c3", sourceUrl: "https://a.com", text: "C", index: 2, charCount: 1 },
      ];

      const state = createState({ chunks, processedData: [] });
      const result = await qdrantNode(state);

      expect(result.messages?.[0]).toContain("3");
    });
  });
});

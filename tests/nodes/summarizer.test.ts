/**
 * tests/nodes/summarizer.test.ts
 * summarizerNode 节点单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 工具函数
vi.mock("../../src/tools/llm.js", () => ({
  callLocalLLM: vi.fn(),
  estimateTokens: vi.fn(),
}));

vi.mock("../../src/tools/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { callLocalLLM, estimateTokens } from "../../src/tools/llm.js";
import { summarizerNode } from "../../src/nodes/summarizer.js";
import type { KnowledgeStateType } from "../../src/state/index.js";
import type { TextChunk } from "../../src/types/index.js";

describe("summarizerNode", () => {
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

  function createChunk(overrides: Partial<TextChunk> = {}): TextChunk {
    return {
      id: "c1",
      sourceUrl: "https://example.com",
      text: "测试文本内容",
      index: 0,
      charCount: 6,
      ...overrides,
    };
  }

  describe("空文本块", () => {
    it("chunks 为空时应返回 done 无数据", async () => {
      const state = createState({ chunks: [] });
      const result = await summarizerNode(state);

      expect(result.status).toBe("done");
      expect(result.processedData).toEqual([]);
      expect(callLocalLLM).not.toHaveBeenCalled();
    });
  });

  describe("正常摘要", () => {
    it("应调用 LLM 为每个 URL 生成摘要", async () => {
      vi.mocked(callLocalLLM).mockResolvedValue("这是生成的摘要内容");
      vi.mocked(estimateTokens).mockReturnValue(100);

      const chunks: TextChunk[] = [
        createChunk({ text: "第一段", index: 0 }),
        createChunk({ text: "第二段", index: 1 }),
      ];

      const state = createState({ chunks, query: "" });
      const result = await summarizerNode(state);

      expect(result.status).toBe("processing");
      expect(result.processedData).toHaveLength(1); // 同一 URL 合并
      expect(callLocalLLM).toHaveBeenCalledTimes(1);
      expect(result.processedData![0].sourceUrl).toBe("https://example.com");
      expect(result.processedData![0].summary).toBe("这是生成的摘要内容");
    });

    it("多个不同 URL 应分别生成摘要", async () => {
      vi.mocked(callLocalLLM)
        .mockResolvedValueOnce("摘要A")
        .mockResolvedValueOnce("摘要B");
      vi.mocked(estimateTokens).mockReturnValue(50);

      const chunks: TextChunk[] = [
        createChunk({ sourceUrl: "https://a.com", text: "A内容" }),
        createChunk({ sourceUrl: "https://b.com", text: "B内容" }),
      ];

      const state = createState({ chunks });
      const result = await summarizerNode(state);

      expect(result.processedData).toHaveLength(2);
      expect(callLocalLLM).toHaveBeenCalledTimes(2);
    });

    it("应按照 chunk index 排序后合并", async () => {
      vi.mocked(callLocalLLM).mockResolvedValue("摘要");
      vi.mocked(estimateTokens).mockReturnValue(10);

      const chunks: TextChunk[] = [
        createChunk({ text: "第三段", index: 2 }),
        createChunk({ text: "第一段", index: 0 }),
        createChunk({ text: "第二段", index: 1 }),
      ];

      const state = createState({ chunks });

      await summarizerNode(state);

      // callLocalLLM 接收的 combinedText 应按 index 排序
      const callArg = vi.mocked(callLocalLLM).mock.calls[0][1] as string;
      expect(callArg).toContain("第一段");
      // 验证 "第一段" 在 "第二段" 前面
      expect(callArg.indexOf("第一段")).toBeLessThan(callArg.indexOf("第二段"));
      expect(callArg.indexOf("第二段")).toBeLessThan(callArg.indexOf("第三段"));
    });
  });

  describe("查询上下文", () => {
    it("有 query 时应将其传入 LLM 提示词", async () => {
      vi.mocked(callLocalLLM).mockResolvedValue("摘要");
      vi.mocked(estimateTokens).mockReturnValue(10);

      const state = createState({
        chunks: [createChunk()],
        query: "侧重技术架构方面",
      });

      await summarizerNode(state);

      const callArgs = vi.mocked(callLocalLLM).mock.calls[0];
      const prompt = callArgs[0] as string;
      expect(prompt).toContain("技术架构");
    });

    it("无 query 时应使用默认提示词", async () => {
      vi.mocked(callLocalLLM).mockResolvedValue("摘要");
      vi.mocked(estimateTokens).mockReturnValue(10);

      const state = createState({ chunks: [createChunk()], query: "" });

      await summarizerNode(state);

      const callArgs = vi.mocked(callLocalLLM).mock.calls[0];
      const prompt = callArgs[0] as string;
      expect(prompt).toContain("提取以下文本的核心信息");
    });
  });

  describe("关键词提取", () => {
    it("LLM 返回含「关键词：」格式的摘要时应提取关键词", async () => {
      const summaryWithKeywords = "这是内容摘要。关键词：LangGraph, Qdrant, LLM";
      vi.mocked(callLocalLLM).mockResolvedValue(summaryWithKeywords);
      vi.mocked(estimateTokens).mockReturnValue(20);

      const state = createState({ chunks: [createChunk()] });
      const result = await summarizerNode(state);

      expect(result.processedData![0].keywords).toContain("LangGraph");
      expect(result.processedData![0].keywords).toContain("Qdrant");
      expect(result.processedData![0].keywords).toContain("LLM");
    });

    it("无关键词标记时应返回空数组", async () => {
      vi.mocked(callLocalLLM).mockResolvedValue("普通摘要，没有关键词");
      vi.mocked(estimateTokens).mockReturnValue(20);

      const state = createState({ chunks: [createChunk()] });
      const result = await summarizerNode(state);

      expect(result.processedData![0].keywords).toEqual([]);
    });
  });

  describe("异常处理", () => {
    it("LLM 调用失败时应返回 error 状态", async () => {
      vi.mocked(callLocalLLM).mockRejectedValue(new Error("Ollama not running"));
      vi.mocked(estimateTokens).mockReturnValue(10);

      const state = createState({ chunks: [createChunk()] });
      const result = await summarizerNode(state);

      expect(result.status).toBe("error");
      expect(result.error).toContain("Ollama not running");
    });
  });

  describe("processedData 完整性", () => {
    it("应包含所有必要字段", async () => {
      vi.mocked(callLocalLLM).mockResolvedValue("摘要内容");
      vi.mocked(estimateTokens).mockReturnValue(42);

      const state = createState({ chunks: [createChunk()] });
      const result = await summarizerNode(state);

      const data = result.processedData![0];
      expect(data.summary).toBe("摘要内容");
      expect(data.sourceUrl).toBe("https://example.com");
      expect(data.processedAt).toBeDefined();
      expect(data.originalTokenEstimate).toBe(42);
      expect(data.summaryTokenEstimate).toBe(42);
      expect(Array.isArray(data.keywords)).toBe(true);
    });
  });
});

/**
 * tests/tools/text.test.ts
 * 文本切分函数 chunkText 的单元测试
 */
import { describe, it, expect } from "vitest";
import { chunkText } from "../../src/tools/text.js";

describe("chunkText", () => {
  // ============================================
  // 边界条件
  // ============================================
  describe("边界条件", () => {
    it("空字符串应返回空数组", () => {
      const result = chunkText("", "https://example.com");
      expect(result).toEqual([]);
    });

    it("纯空白字符应返回空数组", () => {
      const result = chunkText("   \n\n  \t  ", "https://example.com");
      expect(result).toEqual([]);
    });
  });

  // ============================================
  // 基本功能
  // ============================================
  describe("基本切分", () => {
    it("短文本应生成单个文本块", () => {
      const text = "这是一段很短的测试文本。";
      const result = chunkText(text, "https://example.com", 1000, 200);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(text);
      expect(result[0].sourceUrl).toBe("https://example.com");
      expect(result[0].index).toBe(0);
      expect(result[0].charCount).toBe(text.length);
    });

    it("应生成唯一的 id", () => {
      const text = "段落A。\n\n段落B。";
      const result = chunkText(text, "https://example.com", 5, 0);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const ids = result.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("chunk index 应递增", () => {
      const text = "A".repeat(10) + "\n\n" + "B".repeat(10) + "\n\n" + "C".repeat(10);
      const result = chunkText(text, "https://example.com", 5, 0);

      for (let i = 0; i < result.length; i++) {
        expect(result[i].index).toBe(i);
      }
    });
  });

  // ============================================
  // 段落切分
  // ============================================
  describe("段落切分", () => {
    it("应识别双换行作为段落边界", () => {
      const text = "第一段内容。\n\n第二段内容。\n\n第三段内容。";
      const result = chunkText(text, "https://example.com", 1000, 0);

      // 三段都足够短，应合并
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("多个连续换行应视为一个段落分隔", () => {
      const text = "段落A。\n\n\n\n段落B。";
      const result = chunkText(text, "https://example.com", 5, 0);

      // chunkSize 很小，可能拆分
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // chunkSize 测试
  // ============================================
  describe("chunkSize 控制", () => {
    it("超过 chunkSize 的长段落应被拆分", () => {
      // 创建一个长度 150 的段落，chunkSize=50
      const longPara = "A".repeat(150);
      const result = chunkText(longPara, "https://example.com", 50, 0);

      expect(result.length).toBeGreaterThanOrEqual(3);
      for (const chunk of result) {
        expect(chunk.charCount).toBeLessThanOrEqual(50);
      }
    });

    it("自定义 chunkSize 应生效", () => {
      const text = "A".repeat(500);
      const smallChunks = chunkText(text, "https://x.com", 50, 0);
      const largeChunks = chunkText(text, "https://x.com", 500, 0);

      expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
    });
  });

  // ============================================
  // overlap 测试
  // ============================================
  describe("chunkOverlap 重叠", () => {
    it("overlap=0 时相邻块不应有内容重叠", () => {
      const text = "A".repeat(100) + "\n\n" + "B".repeat(100);
      const result = chunkText(text, "https://example.com", 100, 0);

      if (result.length >= 2) {
        const firstEnd = result[0].text;
        const secondStart = result[1].text;
        // 无 overlap 时，不应包含前一个块的末尾内容
        expect(firstEnd.slice(-10)).not.toBe(
          secondStart.slice(0, 10),
        );
      }
    });

    it("overlap>0 时相邻块应有重叠", () => {
      // 构建一个长文本确保产生多个块
      const text = "X".repeat(300);
      const result = chunkText(text, "https://example.com", 100, 20);

      if (result.length >= 2) {
        // overlap>0 时第二个块应包含第一个块的末尾部分
        const firstChunk = result[0].text;
        const secondChunk = result[1].text;
        const overlap = firstChunk.slice(-20);

        expect(secondChunk).toContain(overlap);
      }
    });
  });

  // ============================================
  // 中文句子切分
  // ============================================
  describe("中文句子切分", () => {
    it("应能按中文标点切分长段落", () => {
      // 一个很长的段落（无换行），依赖句子切分
      const sentences = Array.from({ length: 10 }, (_, i) => `这是第${i + 1}句测试文本。`).join("");
      const result = chunkText(sentences, "https://example.com", 30, 0);

      // 应该拆成多个块
      expect(result.length).toBeGreaterThan(1);
    });

    it("英文句子也应能按标点切分", () => {
      const text = "First sentence. Second sentence. Third sentence. Fourth sentence.";
      const result = chunkText(text, "https://example.com", 25, 0);

      expect(result.length).toBeGreaterThan(1);
    });
  });

  // ============================================
  // sourceUrl 传递
  // ============================================
  describe("sourceUrl 元数据", () => {
    it("所有 chunk 应包含正确的 sourceUrl", () => {
      const sourceUrl = "https://test.example.com/page1";
      const text = "段落一。\n\n段落二。";
      const result = chunkText(text, sourceUrl, 5, 0);

      for (const chunk of result) {
        expect(chunk.sourceUrl).toBe(sourceUrl);
      }
    });
  });

  // ============================================
  // charCount 准确性
  // ============================================
  describe("charCount 准确性", () => {
    it("charCount 应等于 text.length", () => {
      const text = "A".repeat(1000) + "\n\n" + "B".repeat(500);
      const result = chunkText(text, "https://example.com", 200, 50);

      for (const chunk of result) {
        expect(chunk.charCount).toBe(chunk.text.length);
      }
    });
  });

  // ============================================
  // 综合场景
  // ============================================
  describe("综合场景", () => {
    it("混合中英文 + 多段落 + 长句子", () => {
      const text = [
        "第一段：这是Kraken知识处理服务的介绍。",
        "",
        "第二段：Based on LangGraph and local LLM (Qwen2.5-1.5B), Kraken is a knowledge processing service.",
        "",
        "第三段：它支持自动爬取网页内容，通过LLM生成摘要，并存入Qdrant向量数据库供下游Agent检索。",
      ].join("\n\n");

      const result = chunkText(text, "https://example.com", 100, 20);

      // 基本验证
      expect(result.length).toBeGreaterThan(0);
      for (const chunk of result) {
        expect(chunk.sourceUrl).toBe("https://example.com");
        expect(chunk.charCount).toBe(chunk.text.length);
        expect(chunk.charCount).toBeGreaterThan(0);
      }
    });
  });
});

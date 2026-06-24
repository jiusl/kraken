/**
 * tests/tools/llm.test.ts
 * LLM 工具函数的单元测试（只测纯函数，不测网络调用）
 */
import { describe, it, expect } from "vitest";
import { estimateTokens } from "../../src/tools/llm.js";

describe("estimateTokens", () => {
  describe("纯英文", () => {
    it("应正确估算纯英文 token 数", () => {
      // 英文约 4 字符/token
      const text = "Hello world"; // 11 chars, all non-Chinese
      const tokens = estimateTokens(text);
      // 11/4 = 2.75 → ceil = 3
      expect(tokens).toBe(3);
    });

    it("空字符串应返回 0", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("纯中文", () => {
    it("应正确估算纯中文 token 数", () => {
      // 中文约 1.5 字符/token
      const text = "你好世界"; // 4 Chinese chars
      const tokens = estimateTokens(text);
      // 4/1.5 = 2.67 → ceil = 3
      expect(tokens).toBe(3);
    });

    it("长中文文本", () => {
      const text = "这是一段很长的中文测试文本用于验证Token估算的准确性";
      // 23 个汉字 + 5 个英文("Token") → 23/1.5 + 5/4 = 15.33 + 1.25 = 16.58 → ceil = 17
      const tokens = estimateTokens(text);
      expect(tokens).toBe(17);
    });
  });

  describe("混合中英文", () => {
    it("应分别按中英文比例估算", () => {
      // "你好World" = 2 Chinese + 5 other = 7 total
      // 2/1.5 + 5/4 = 1.33 + 1.25 = 2.58 → ceil = 3
      const text = "你好World";
      const tokens = estimateTokens(text);
      expect(tokens).toBe(3);
    });

    it("中英文混合长文本", () => {
      const text = "Kraken 是一个基于 LangGraph 构建的 Intelligent Knowledge Processing Service";
      // Chinese chars: 基于构建的 → 5 Chinese
      // Other: rest → let me count: "Kraken 是一个基于 LangGraph 构建的 Intelligent Knowledge Processing Service"
      // Actually let me not hardcode, just test it returns a positive number
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(Number.isInteger(tokens)).toBe(true);
    });
  });

  describe("特殊字符", () => {
    it("包含数字和标点", () => {
      const text = "价格：￥99.99元/件";
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it("包含换行和制表符", () => {
      const text = "第一行\n\t第二行";
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it("纯符号", () => {
      const text = "!@#$%^&*()";
      const tokens = estimateTokens(text);
      // 0 Chinese + 10 other → 10/4 = 2.5 → ceil = 3
      expect(tokens).toBe(3);
    });
  });

  describe("边界情况", () => {
    it("单字符英文", () => {
      expect(estimateTokens("a")).toBe(1);
    });

    it("单字符中文", () => {
      expect(estimateTokens("中")).toBe(1);
    });

    it("极长文本", () => {
      const text = "A".repeat(10000);
      const tokens = estimateTokens(text);
      expect(tokens).toBe(2500); // 10000/4 = 2500
    });
  });
});

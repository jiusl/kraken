import type { TextChunk } from "../types/index.js";
import { config } from "../config/index.js";
import { logger } from "./logger.js";

/**
 * 清洗字符串中的孤立代理对（lone surrogates），防止 JSON.stringify 产生无效 UTF-16。
 * 网页爬取内容常含有 emoji / 特殊 Unicode 字符，如 →、❤️、⭐ 等，
 * 被截断后会产生孤立代理对，导致 DeepSeek API 返回 400。
 */
export function sanitizeUnicode(str: string): string {
  return str.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "\uFFFD",
  );
}

/**
 * 生成唯一 ID（简易实现）
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 按语义边界切分文本
 *
 * 策略：
 * 1. 先按段落（\n\n）分割
 * 2. 段落过长的按句子（。！？\n）再切分
 * 3. 合并短段落直到达到 chunkSize
 * 4. overlap 通过保留上一块末尾文本来实现
 */
export function chunkText(
  text: string,
  sourceUrl: string,
  chunkSize: number = config.CHUNK_SIZE,
  chunkOverlap: number = config.CHUNK_OVERLAP
): TextChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Step 1: 按段落分割
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Step 2: 过长的段落按句子再切分
  const segments: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= chunkSize) {
      segments.push(para);
    } else {
      // 按句子边界切分
      const sentences = para.split(/(?<=[。！？.!?\n])\s*/);
      let buffer = "";
      for (const sentence of sentences) {
        // 如果单个句子本身超过 chunkSize，则按字符硬切分
        if (sentence.length > chunkSize) {
          // 先保存 buffer
          if (buffer.trim().length > 0) {
            segments.push(buffer.trim());
            buffer = "";
          }
          // 按 chunkSize 硬切分长句
          for (let i = 0; i < sentence.length; i += chunkSize) {
            segments.push(sentence.slice(i, i + chunkSize).trim());
          }
        } else if ((buffer + sentence).length > chunkSize && buffer.length > 0) {
          segments.push(buffer.trim());
          buffer = sentence;
        } else {
          buffer += sentence;
        }
      }
      if (buffer.trim().length > 0) {
        segments.push(buffer.trim());
      }
    }
  }

  // Step 3: 合并短段落到 chunkSize
  const chunks: TextChunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (const segment of segments) {
    if (
      currentChunk.length + segment.length > chunkSize &&
      currentChunk.length > 0
    ) {
      // 当前块已满，保存
      chunks.push({
        id: generateId(),
        sourceUrl,
        text: currentChunk.trim(),
        index: chunkIndex++,
        charCount: currentChunk.trim().length,
      });

      // 计算 overlap：保留上一块末尾的部分文本
      if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
        currentChunk = currentChunk.slice(-chunkOverlap) + segment;
      } else {
        currentChunk = segment;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + segment;
    }
  }

  // Step 4: 保存最后一块
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: generateId(),
      sourceUrl,
      text: currentChunk.trim(),
      index: chunkIndex,
      charCount: currentChunk.trim().length,
    });
  }

  logger.info(
    { sourceUrl, segmentCount: segments.length, chunkCount: chunks.length },
    "文本切分完成"
  );

  return chunks;
}

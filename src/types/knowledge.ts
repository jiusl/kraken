/**
 * Kraken 核心类型定义
 */

// ============================================
// 任务状态
// ============================================
export type TaskStatus = "pending" | "processing" | "done" | "error";

// ============================================
// 爬取内容
// ============================================
export interface CrawledPage {
  /** 原始 URL */
  url: string;
  /** 网页标题 */
  title: string;
  /** Markdown 格式的正文 */
  content: string;
  /** 爬取时间戳 */
  crawledAt: string;
  /** 错误信息（爬取失败时） */
  error?: string;
}

export interface CrawledContent {
  /** 爬取的所有页面 */
  pages: CrawledPage[];
  /** 成功数 */
  successCount: number;
  /** 失败数 */
  failCount: number;
}

// ============================================
// 文本切分
// ============================================
export interface TextChunk {
  /** 唯一标识 */
  id: string;
  /** 来源 URL */
  sourceUrl: string;
  /** 切分后的文本 */
  text: string;
  /** 在原文中的序号 */
  index: number;
  /** 字符数 */
  charCount: number;
}

// ============================================
// 处理后的结构化知识
// ============================================
export interface ProcessedData {
  /** LLM 生成的摘要 */
  summary: string;
  /** 提取的关键词 */
  keywords: string[];
  /** 来源 URL */
  sourceUrl: string;
  /** 处理时间戳 */
  processedAt: string;
  /** 原始内容的 token 估算 */
  originalTokenEstimate: number;
  /** 摘要的 token 估算 */
  summaryTokenEstimate: number;
}

// ============================================
// Qdrant 文档
// ============================================
export interface KnowledgeDocument {
  /** 文本内容 */
  text: string;
  /** 元数据 */
  metadata: {
    sourceUrl: string;
    title: string;
    summary: string;
    keywords: string[];
    chunkIndex: number;
    processedAt: string;
  };
}

// ============================================
// SearXNG 搜索结果
// ============================================
export interface SearchResult {
  /** 网页标题 */
  title: string;
  /** 网页 URL */
  url: string;
  /** 搜索摘要片段 */
  snippet: string;
  /** 搜索引擎来源 */
  engine?: string;
}

// ============================================
// Agent 任务追踪
// ============================================
export interface AgentTask {
  /** 任务 ID */
  taskId: string;
  /** 用户意图 */
  intent: string;
  /** 已执行的迭代次数 */
  iterations: number;
  /** 搜索到的 URL */
  searchedUrls: string[];
  /** 已爬取的 URL */
  crawledUrls: string[];
  /** 生成的摘要数 */
  summaryCount: number;
  /** 是否已完成 */
  finished: boolean;
}

// ============================================
// 知识处理结果
// ============================================
export interface KnowledgeResult {
  /** 任务 ID */
  taskId: string;
  /** 处理状态 */
  status: TaskStatus;
  /** 处理的 URL 列表 */
  urls: string[];
  /** 爬取结果 */
  crawledContent?: CrawledContent;
  /** 文本块 */
  chunks?: TextChunk[];
  /** 处理后的数据 */
  processedData?: ProcessedData[];
  /** 错误信息 */
  error?: string;
  /** 耗时（毫秒） */
  duration?: number;
}

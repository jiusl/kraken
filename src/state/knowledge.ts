import { Annotation } from "@langchain/langgraph";
import type {
  CrawledContent,
  TextChunk,
  ProcessedData,
  TaskStatus,
} from "../types/index.js";

/**
 * Kraken 核心状态 —— LangGraph 全局状态图
 *
 * 贯穿 crawler → processor → summarizer → qdrant 四个节点的状态
 */
export const KnowledgeState = Annotation.Root({
  // ---- LangGraph 标准字段 ----
  /** 消息历史 */
  messages: Annotation<(string | Record<string, unknown>)[]>({
    reducer: (current, update) => [...(current ?? []), ...update],
    default: () => [],
  }),

  // ---- 输入字段 ----
  /** 待处理的 URL 列表 */
  urls: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  /** 可选的查询上下文 */
  query: Annotation<string>({
    reducer: (_current, update) => update ?? "",
    default: () => "",
  }),

  // ---- 中间产物 ----
  /** 爬取到的原始内容 */
  crawledContent: Annotation<CrawledContent | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  /** 切分后的文本块 */
  chunks: Annotation<TextChunk[]>({
    reducer: (_current, update) => update ?? [],
    default: () => [],
  }),

  // ---- 最终产物 ----
  /** 处理后的结构化知识 */
  processedData: Annotation<ProcessedData[]>({
    reducer: (_current, update) => update ?? [],
    default: () => [],
  }),

  // ---- 控制字段 ----
  /** 任务状态 */
  status: Annotation<TaskStatus>({
    reducer: (_current, update) => update ?? "pending",
    default: () => "pending",
  }),
  /** 错误信息 */
  error: Annotation<string | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  /** 任务 ID */
  taskId: Annotation<string>({
    reducer: (_current, update) => update ?? "",
    default: () => "",
  }),

  // ---- 行为变化测试统计 ----
  /** 通过测试的条目数 */
  passedTestCount: Annotation<number>({
    reducer: (_current, update) => update ?? 0,
    default: () => 0,
  }),
  /** 被过滤的条目数 */
  filteredCount: Annotation<number>({
    reducer: (_current, update) => update ?? 0,
    default: () => 0,
  }),
});

/** 状态类型导出 */
export type KnowledgeStateType = typeof KnowledgeState.State;

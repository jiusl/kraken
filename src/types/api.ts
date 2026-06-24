/**
 * API 请求/响应类型
 */

// ============================================
// 知识处理
// ============================================
export interface ProcessKnowledgeRequest {
  /** 要处理的 URL 列表 */
  urls: string[];
  /** 可选的查询上下文，用于指导摘要方向 */
  query?: string;
}

export interface ProcessKnowledgeResponse {
  success: boolean;
  taskId: string;
  message: string;
}

// ============================================
// 知识检索
// ============================================
export interface SearchKnowledgeRequest {
  /** 搜索查询 */
  query: string;
  /** 返回结果数 */
  limit?: number;
  /** 相似度阈值 */
  scoreThreshold?: number;
}

export interface SearchKnowledgeResponse {
  success: boolean;
  results: SearchResultItem[];
}

export interface SearchResultItem {
  /** 文本内容 */
  text: string;
  /** 相似度分数 */
  score: number;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

// ============================================
// 健康检查
// ============================================
export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  services: {
    ollama: "connected" | "disconnected";
    deepseek: "connected" | "disabled" | "disconnected";
    qdrant: "connected" | "disconnected";
    searxng: "connected" | "disabled" | "disconnected";
  };
  version: string;
}

// ============================================
// 智能补充（Agent 驱动）
// ============================================
export interface SupplementRequest {
  /** 用户意图描述 */
  intent: string;
}

export interface SupplementResponse {
  success: boolean;
  taskId: string;
  message: string;
  /** Agent 执行摘要 */
  summary?: {
    searchedUrls: string[];
    crawledCount: number;
    savedCount: number;
    iterations: number;
  };
}

// ============================================
// 智能路由（自动选择流程）
// ============================================
export interface SmartRequest {
  /** 明确的 URL 列表（走固定流程） */
  urls?: string[];
  /** 意图描述（走 Agent 流程） */
  intent?: string;
  /** 查询上下文 */
  query?: string;
}

// ============================================
// 错误响应
// ============================================
export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

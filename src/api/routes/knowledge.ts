import { Hono } from "hono";
import { z } from "zod";
import { runKnowledgePipeline, runAgentPipeline } from "../../graphs/index.js";
import { searchKnowledge } from "../../tools/index.js";
import { logger } from "../../tools/index.js";
import { config } from "../../config/index.js";
import type {
  ProcessKnowledgeRequest,
  ProcessKnowledgeResponse,
  SupplementResponse,
  SearchKnowledgeResponse,
  ErrorResponse,
} from "../../types/index.js";

const knowledge = new Hono();

// ---- 请求 Schema ----
const processSchema = z.object({
  urls: z
    .array(z.string().url())
    .min(1, "至少需要一个 URL")
    .max(10, "最多支持 10 个 URL"),
  query: z.string().max(500).optional(),
});

const searchSchema = z.object({
  query: z.string().min(1, "搜索查询不能为空").max(500),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  scoreThreshold: z.coerce.number().min(0).max(1).default(0.5),
});

const supplementSchema = z.object({
  intent: z.string().min(1, "意图描述不能为空").max(1000, "意图描述最多1000字"),
});

const smartSchema = z
  .object({
    urls: z.array(z.string().url()).max(10, "最多支持10个URL").optional(),
    intent: z.string().max(1000).optional(),
    query: z.string().max(500).optional(),
  })
  .refine((data) => data.urls?.length || data.intent, {
    message: "必须提供 urls 或 intent 至少一个",
  });

/**
 * POST /knowledge/process
 * 提交知识处理任务
 */
knowledge.post("/process", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: "请求体必须是有效的 JSON", code: "INVALID_JSON" },
      400,
    );
  }

  const parsed = processSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  const { urls, query } = parsed.data as ProcessKnowledgeRequest;

  logger.info({ urls, query }, "收到知识处理请求");

  try {
    const result = await runKnowledgePipeline(urls, query);

    const response: ProcessKnowledgeResponse = {
      success: result.status !== "error",
      taskId: result.taskId,
      message:
        result.status === "done"
          ? `处理完成：${result.processedData?.length ?? 0} 个页面的知识已入库`
          : result.status === "error"
            ? `处理失败: ${result.error ?? "未知错误"}`
            : "处理中...",
    };

    return c.json(response, result.status === "error" ? 500 : 200);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg }, "知识处理异常");
    return c.json<ErrorResponse>(
      { success: false, error: errorMsg, code: "PROCESS_ERROR" },
      500,
    );
  }
});

/**
 * POST /knowledge/search
 * 语义搜索已入库的知识
 */
knowledge.post("/search", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: "请求体必须是有效的 JSON", code: "INVALID_JSON" },
      400,
    );
  }

  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  const { query, limit, scoreThreshold } = parsed.data;

  logger.info({ query }, "收到知识搜索请求");

  try {
    const results = await searchKnowledge(query, limit, scoreThreshold);

    const response: SearchKnowledgeResponse = {
      success: true,
      results,
    };

    return c.json(response);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg }, "知识搜索异常");
    return c.json<ErrorResponse>(
      { success: false, error: errorMsg, code: "SEARCH_ERROR" },
      500,
    );
  }
});

/**
 * POST /knowledge/supplement
 * Agent 驱动的智能知识补充
 */
knowledge.post("/supplement", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: "请求体必须是有效的 JSON", code: "INVALID_JSON" },
      400,
    );
  }

  const parsed = supplementSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  if (!config.SEARXNG_ENABLED) {
    return c.json<SupplementResponse>(
      {
        success: false,
        taskId: "",
        message: "SearXNG 搜索服务未启用，请使用 /knowledge/process 手动提供 URL",
      },
      503,
    );
  }

  const { intent } = parsed.data;

  logger.info({ intent }, "收到 Agent 智能补充请求");

  try {
    const result = await runAgentPipeline(intent);

    const response: SupplementResponse = {
      success: result.status !== "error",
      taskId: result.taskId,
      message:
        result.status === "done"
          ? `Agent 执行完成：搜索 ${result.summary?.searchedUrls.length ?? 0} 个 URL，爬取 ${result.summary?.crawledCount ?? 0} 个页面，入库 ${result.summary?.savedCount ?? 0} 条知识，共 ${result.summary?.iterations ?? 0} 轮迭代`
          : result.status === "error"
            ? `Agent 执行失败: ${result.error ?? "未知错误"}`
            : "Agent 执行中...",
      summary: result.summary ?? undefined,
    };

    return c.json(response, result.status === "error" ? 500 : 200);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errorMsg }, "Agent 执行异常");
    return c.json<ErrorResponse>(
      { success: false, error: errorMsg, code: "AGENT_ERROR" },
      500,
    );
  }
});

/**
 * POST /knowledge/smart
 * 智能路由：自动选择固定流程或 Agent 流程
 */
knowledge.post("/smart", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: "请求体必须是有效的 JSON", code: "INVALID_JSON" },
      400,
    );
  }

  const parsed = smartSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  const { urls, intent, query } = parsed.data;

  // 有 URL → 走固定流程（兜底）
  if (urls && urls.length > 0) {
    logger.info({ urls, query }, "🧠 智能路由 → 固定流程");
    try {
      const result = await runKnowledgePipeline(urls, query);
      return c.json<ProcessKnowledgeResponse>(
        {
          success: result.status !== "error",
          taskId: result.taskId,
          message:
            result.status === "done"
              ? `处理完成：${result.processedData?.length ?? 0} 个页面的知识已入库`
              : `处理失败: ${result.error ?? "未知错误"}`,
        },
        result.status === "error" ? 500 : 200,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg }, "知识处理异常");
      return c.json<ErrorResponse>({ success: false, error: msg, code: "PROCESS_ERROR" }, 500);
    }
  }

  // 有意图 → 走 Agent 流程
  if (intent) {
    if (!config.SEARXNG_ENABLED && config.FALLBACK_TO_FIXED_FLOW) {
      return c.json<ErrorResponse>(
        { success: false, error: "搜索服务未启用，请提供 urls 使用固定流程", code: "SEARCH_DISABLED" },
        503,
      );
    }

    logger.info({ intent }, "🧠 智能路由 → Agent 流程");
    try {
      const result = await runAgentPipeline(intent);
      return c.json<SupplementResponse>(
        {
          success: result.status !== "error",
          taskId: result.taskId,
          message:
            result.status === "done"
              ? `Agent 完成 — 搜索 ${result.summary?.searchedUrls.length ?? 0} URL · 爬取 ${result.summary?.crawledCount ?? 0} 页面 · 入库 ${result.summary?.savedCount ?? 0}`
              : `Agent 失败: ${result.error ?? "未知错误"}`,
          summary: result.summary ?? undefined,
        },
        result.status === "error" ? 500 : 200,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg }, "Agent 执行异常");
      return c.json<ErrorResponse>({ success: false, error: msg, code: "AGENT_ERROR" }, 500);
    }
  }

  return c.json<ErrorResponse>(
    { success: false, error: "请提供 urls 或 intent", code: "INVALID_REQUEST" },
    400,
  );
});

export { knowledge as knowledgeRoutes };

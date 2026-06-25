/**
 * src/agents/knowledgeManagerAgent.ts
 * 知识管理 Agent — LLM 驱动的自主搜索→爬取→摘要→入库循环
 */
import { StateGraph, END } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { createLLM } from "../services/deepseek.js";
import { config } from "../config/index.js";
import { logger } from "../tools/logger.js";
import { searchWeb } from "../tools/searchTool.js";
import { crawlSinglePage } from "../tools/crawler.js";
import { callLocalLLM } from "../tools/llm.js";
import { upsertKnowledge, searchKnowledge } from "../tools/qdrant.js";
import type { KnowledgeDocument, SearchResult } from "../types/index.js";

// ============================================
// Agent 工具定义
// ============================================

/**
 * 工具 1：搜索网页
 */
const searchWebTool = tool(
  async ({ query, maxResults }) => {
    const results = await searchWeb(query, maxResults);
    return JSON.stringify(results, null, 2);
  },
  {
    name: "search_web",
    description:
      "根据关键词搜索互联网上的网页。返回标题、URL 和摘要片段。适用于用户想了解某个主题但不清楚具体有哪些网页可以参考的场景。",
    schema: z.object({
      query: z.string().describe("搜索关键词"),
      maxResults: z.number().int().min(1).max(10).default(5).describe("最大搜索结果数"),
    }),
  },
);

/**
 * 工具 2：爬取网页
 */
const crawlWebpageTool = tool(
  async ({ url }) => {
    const page = await crawlSinglePage(url);
    if (page.error) {
      return `❌ 爬取失败: ${page.error}`;
    }
    return JSON.stringify(
      { title: page.title, url: page.url, content: page.content.slice(0, 3000) },
      null, 2,
    );
  },
  {
    name: "crawl_webpage",
    description:
      "爬取指定 URL 的网页内容，返回 Markdown 格式文本。用于获取搜索结果的完整正文。",
    schema: z.object({
      url: z.string().url().describe("要爬取的网页 URL"),
    }),
  },
);

/**
 * 工具 3：生成摘要
 */
const summarizeContentTool = tool(
  async ({ content }) => {
    return await callLocalLLM(
      "请提取以下文本的核心信息，生成简洁的中文摘要（200字以内），并提取3-5个关键词",
      content,
    );
  },
  {
    name: "summarize_content",
    description:
      "将文本内容提炼为简洁的中文摘要，提取核心信息和关键词。用于对爬取到的网页内容进行知识压缩。",
    schema: z.object({
      content: z.string().describe("待摘要的文本内容"),
    }),
  },
);

/**
 * 工具 4：存入知识库
 */
const saveKnowledgeTool = tool(
  async ({ text, title, summary, keywords, sourceUrl }) => {
    const doc: KnowledgeDocument = {
      text,
      metadata: {
        sourceUrl,
        title,
        summary,
        keywords,
        chunkIndex: 0,
        processedAt: new Date().toISOString(),
      },
    };
    await upsertKnowledge([doc]);
    return `✅ 知识已入库: ${title}`;
  },
  {
    name: "save_knowledge",
    description:
      "将处理好的知识文档（含摘要和关键词）存入 Qdrant 向量数据库。在完成爬取和摘要之后调用。",
    schema: z.object({
      text: z.string().describe("原始文本内容"),
      title: z.string().describe("文档标题"),
      summary: z.string().describe("LLM 生成的摘要"),
      keywords: z.array(z.string()).describe("关键词列表"),
      sourceUrl: z.string().describe("来源 URL"),
    }),
  },
);

/**
 * 工具 5：查询已有知识库
 */
const queryExistingTool = tool(
  async ({ query }) => {
    const results = await searchKnowledge(query, 3, 0.4);
    if (results.length === 0) {
      return "知识库中暂无相关内容。";
    }
    return JSON.stringify(
      results.map((r) => ({ text: r.text.slice(0, 300), score: r.score })),
      null, 2,
    );
  },
  {
    name: "query_existing",
    description:
      "查询 Qdrant 知识库中是否已有相关内容。在搜索新网页之前，可先检查已有知识，避免重复工作。",
    schema: z.object({
      query: z.string().describe("搜索查询"),
    }),
  },
);

/** 所有工具列表 */
const agentTools = [
  searchWebTool,
  crawlWebpageTool,
  summarizeContentTool,
  saveKnowledgeTool,
  queryExistingTool,
];

// ============================================
// Agent 状态定义
// ============================================

export const AgentState = Annotation.Root({
  /** 消息历史（LangGraph Agent 标准字段） */
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...(current ?? []), ...update],
    default: () => [],
  }),

  /** 用户意图 */
  intent: Annotation<string>({
    reducer: (_c, u) => u ?? "",
    default: () => "",
  }),

  /** 任务追踪信息 */
  taskId: Annotation<string>({
    reducer: (_c, u) => u ?? "",
    default: () => "",
  }),

  /** 已搜索的 URL */
  searchedUrls: Annotation<string[]>({
    reducer: (current, update) => [...(current ?? []), ...(update ?? [])],
    default: () => [],
  }),

  /** 已爬取的 URL */
  crawledUrls: Annotation<string[]>({
    reducer: (current, update) => [...(current ?? []), ...(update ?? [])],
    default: () => [],
  }),

  /** 已入库数量 */
  savedCount: Annotation<number>({
    reducer: (current, update) => (current ?? 0) + (update ?? 0),
    default: () => 0,
  }),

  /** 迭代次数 */
  iteration: Annotation<number>({
    reducer: (_c, u) => (u ?? 0),
    default: () => 0,
  }),

  /** Agent 是否完成 */
  finished: Annotation<boolean>({
    reducer: (_c, u) => u ?? false,
    default: () => false,
  }),
});

export type AgentStateType = typeof AgentState.State;

// ============================================
// Agent LLM 节点
// ============================================

const llmWithToolsPromise = createLLM({ maxTokens: 4096 }).then((llm) =>
  llm.bindTools(agentTools),
);

/**
 * 调用 LLM 节点：让模型决策下一步行动
 */
async function callLLM(
  state: AgentStateType,
  _config?: RunnableConfig,
): Promise<Partial<AgentStateType>> {
  const { messages, iteration } = state;

  logger.info({ iteration, msgCount: messages.length }, "Agent LLM 节点被调用");

  const llmWithTools = await llmWithToolsPromise;
  const response = await llmWithTools.invoke(messages);
  const aiMsg = response as AIMessage;

  // 调试：记录 LLM 是否返回 tool_calls
  if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
    logger.info(
      { toolCalls: aiMsg.tool_calls.map((tc) => tc.name), iteration },
      "Agent LLM 请求调用工具",
    );
  } else {
    logger.warn(
      {
        iteration,
        contentPreview: typeof aiMsg.content === "string"
          ? aiMsg.content.slice(0, 200)
          : JSON.stringify(aiMsg.content).slice(0, 200),
      },
      "Agent LLM 未请求任何工具 — 将直接终止",
    );
  }

  return {
    messages: [aiMsg],
    iteration: iteration + 1,
  };
}

/**
 * 工具执行节点：执行 LLM 请求的工具调用
 */
async function callTools(
  state: AgentStateType,
  _config?: RunnableConfig,
): Promise<Partial<AgentStateType>> {
  const { messages } = state;
  const lastMsg = messages[messages.length - 1] as AIMessage;

  if (!lastMsg.tool_calls || lastMsg.tool_calls.length === 0) {
    return {};
  }

  logger.info(
    { toolCalls: lastMsg.tool_calls.map((tc) => tc.name) },
    "Agent 执行工具调用",
  );

  const toolMessages: ToolMessage[] = [];
  let searchedUrls: string[] = [];
  let crawledUrls: string[] = [];
  let savedCount = 0;

  for (const toolCall of lastMsg.tool_calls) {
    const toolName = toolCall.name;
    const toolArgs = toolCall.args as Record<string, unknown>;
    const toolToRun = agentTools.find((t) => t.name === toolName);

    if (!toolToRun) {
      toolMessages.push(
        new ToolMessage({
          tool_call_id: toolCall.id!,
          content: `未知工具: ${toolName}`,
        }),
      );
      continue;
    }

    try {
      const result = await (toolToRun as any).invoke(toolArgs);

      // 追踪 Agent 行为
      if (toolName === "search_web") {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          searchedUrls = parsed.map((r: SearchResult) => r.url);
        }
      } else if (toolName === "crawl_webpage") {
        crawledUrls = [String(toolArgs.url ?? "")];
      } else if (toolName === "save_knowledge") {
        savedCount = 1;
      }

      toolMessages.push(
        new ToolMessage({
          tool_call_id: toolCall.id!,
          content: String(result),
        }),
      );
    } catch (err) {
      toolMessages.push(
        new ToolMessage({
          tool_call_id: toolCall.id!,
          content: `工具执行出错: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
    }
  }

  return {
    messages: toolMessages,
    searchedUrls,
    crawledUrls,
    savedCount,
  };
}

/**
 * 路由判断：继续 Agent 循环还是终止
 */
function shouldContinue(state: AgentStateType): "callTools" | typeof END {
  const { messages, iteration } = state;
  const lastMsg = messages[messages.length - 1] as AIMessage;

  // 超过最大迭代次数
  if (iteration >= config.AGENT_MAX_ITERATIONS) {
    logger.warn({ iteration }, "Agent 达到最大迭代次数，强制终止");
    return END;
  }

  // LLM 请求了工具调用 → 执行工具
  if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
    return "callTools";
  }

  // 无工具调用 → 工作完成
  return END;
}

/**
 * 工具执行后继续：判断是否重新调用 LLM 或终止
 */
function shouldLoop(state: AgentStateType): "callLLM" | typeof END {
  const { iteration } = state;

  if (iteration >= config.AGENT_MAX_ITERATIONS) {
    logger.warn({ iteration }, "Agent 达到最大迭代次数，强制终止");
    return END;
  }

  // 总是回到 LLM 继续决策
  return "callLLM";
}

// ============================================
// Agent 图编译
// ============================================

const agentWorkflow = new StateGraph(AgentState)
  .addNode("callLLM", callLLM)
  .addNode("callTools", callTools)
  .addEdge("__start__", "callLLM")
  .addConditionalEdges("callLLM", shouldContinue)
  .addConditionalEdges("callTools", shouldLoop);

export const knowledgeManagerAgent = agentWorkflow.compile();

// ============================================
// Agent 执行入口
// ============================================

const AGENT_SYSTEM_PROMPT = `你是一个专业的知识管理助手 Agent。你的核心任务是**实际调用工具**来收集、整理和保存知识。你绝不能凭空回答或依赖自己的训练数据，必须通过工具获取真实信息。

## 工作流程（每一步都必须调用工具）
1. 首先调用 search_web 搜索相关网页
2. 从搜索结果中筛选 1-2 个最优质的网址
3. 对每个选中的网页调用 crawl_webpage 获取完整内容
4. 爬取成功后**立即**调用 summarize_content 生成摘要
5. 摘要完成后**立即**调用 save_knowledge 存入知识库
6. 全部保存后才任务完成

## 强制规则
- **必须**在第一步调用 search_web，不允许跳过
- 爬取成功后**必须立即** summarize → save，不得再回去搜索
- 不要爬取同一个 URL 两次
- 搜索间隔建议用简明的中文关键词
- 如果搜索结果为空，更换搜索词再试一次（最多 3 次）
- 如果连续搜索 3 次均无结果，直接告知用户搜索服务不可用并结束
- 搜索服务不可用时告知用户`;

/**
 * 运行知识管理 Agent
 *
 * @param intent - 用户意图描述
 * @param taskId - 任务 ID
 * @returns Agent 执行结果状态
 */
export async function runKnowledgeAgent(
  intent: string,
  taskId: string,
): Promise<AgentStateType> {
  logger.info({ taskId, intent }, "启动知识管理 Agent");

  const initialState: Partial<AgentStateType> = {
    messages: [
      new SystemMessage({ content: AGENT_SYSTEM_PROMPT }),
      new HumanMessage({ content: `用户意图：${intent}\n\n请立即开始执行知识收集任务。第一步必须调用 search_web。` }),
    ],
    intent,
    taskId,
    iteration: 0,
    searchedUrls: [],
    crawledUrls: [],
    savedCount: 0,
    finished: false,
  };

  const result = await knowledgeManagerAgent.invoke(initialState);

  logger.info({ taskId, iteration: result.iteration }, "Agent 执行完成");

  return result;
}

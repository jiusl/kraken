/**
 * src/graphs/agentGraph.ts
 * Agent 驱动的知识处理流程图定义
 */
import { StateGraph, END } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { runKnowledgeAgent } from "../agents/index.js";
import { logger } from "../tools/index.js";
import type { AgentStateType } from "../agents/knowledgeManagerAgent.js";

// ============================================
// 流水线包装状态
// ============================================

export const AgentPipelineState = Annotation.Root({
  /** 用户意图 */
  intent: Annotation<string>({
    reducer: (_c, u) => u ?? "",
    default: () => "",
  }),

  /** 任务 ID */
  taskId: Annotation<string>({
    reducer: (_c, u) => u ?? "",
    default: () => "",
  }),

  /** 执行状态 */
  status: Annotation<"pending" | "running" | "done" | "error">({
    reducer: (_c, u) => u ?? "pending",
    default: () => "pending",
  }),

  /** Agent 执行结果摘要 */
  summary: Annotation<{
    searchedUrls: string[];
    crawledCount: number;
    savedCount: number;
    iterations: number;
  } | null>({
    reducer: (_c, u) => u,
    default: () => null,
  }),

  /** 错误信息 */
  error: Annotation<string | null>({
    reducer: (_c, u) => u,
    default: () => null,
  }),

  /** 提示消息 */
  messages: Annotation<string[]>({
    reducer: (current, update) => [...(current ?? []), ...(update ?? [])],
    default: () => [],
  }),
});

export type AgentPipelineStateType = typeof AgentPipelineState.State;

// ============================================
// 节点定义
// ============================================

/**
 * Agent 执行节点：调用 runKnowledgeAgent
 */
async function agentNode(
  state: AgentPipelineStateType,
): Promise<Partial<AgentPipelineStateType>> {
  const { intent, taskId } = state;

  logger.info({ taskId }, "Agent 节点开始执行");

  try {
    const result: AgentStateType = await runKnowledgeAgent(intent, taskId);

    return {
      status: "done",
      summary: {
        searchedUrls: result.searchedUrls ?? [],
        crawledCount: result.crawledUrls?.length ?? 0,
        savedCount: result.savedCount ?? 0,
        iterations: result.iteration ?? 0,
      },
      messages: [
        `✅ Agent 执行完成：搜索 ${result.searchedUrls?.length ?? 0} 个URL，爬取 ${result.crawledUrls?.length ?? 0} 个页面，入库 ${result.savedCount ?? 0} 条知识，共 ${result.iteration ?? 0} 轮`,
      ],
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ taskId, error: errorMsg }, "Agent 节点执行失败");

    return {
      status: "error",
      error: errorMsg,
      messages: [`❌ Agent 执行失败: ${errorMsg}`],
    };
  }
}

// ============================================
// 图定义
// ============================================

const agentPipeline = new StateGraph(AgentPipelineState)
  .addNode("agent", agentNode)
  .addEdge("__start__", "agent")
  .addEdge("agent", END);

export const agentGraph = agentPipeline.compile();

// ============================================
// 执行入口
// ============================================

/**
 * 运行 Agent 驱动的知识处理流水线
 *
 * @param intent - 用户意图描述
 * @returns 流水线执行结果
 */
export async function runAgentPipeline(
  intent: string,
): Promise<AgentPipelineStateType> {
  const taskId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  logger.info({ taskId, intent }, "启动 Agent 知识处理流水线");

  const initialState: Partial<AgentPipelineStateType> = {
    intent,
    taskId,
    status: "pending",
  };

  const result = await agentGraph.invoke(initialState);

  logger.info({ taskId, status: result.status }, "Agent 流水线完成");

  return result;
}

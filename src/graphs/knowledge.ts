import { StateGraph, END } from "@langchain/langgraph";
import { KnowledgeState } from "../state/index.js";
import type { KnowledgeStateType } from "../state/index.js";
import {
  crawlerNode,
  processorNode,
  summarizerNode,
  behaviorChangeTestNode,
  qdrantNode,
} from "../nodes/index.js";
import { logger } from "../tools/index.js";

/**
 * 条件路由：检查是否有错误发生
 */
function shouldContinue(state: KnowledgeStateType): "processor" | typeof END {
  if (state.status === "error") {
    logger.error({ error: state.error }, "工作流因错误终止");
    return END;
  }
  return "processor";
}

function shouldSummarize(state: KnowledgeStateType): "summarizer" | typeof END {
  if (state.status === "error") {
    return END;
  }
  return "summarizer";
}

function shouldTest(state: KnowledgeStateType): "behaviorChangeTest" | typeof END {
  if (state.status === "error") {
    return END;
  }
  return "behaviorChangeTest";
}

function shouldUpsert(state: KnowledgeStateType): "qdrant" | typeof END {
  if (state.status === "error") {
    return END;
  }
  return "qdrant";
}

/**
 * 构建知识处理工作流图
 *
 * 流程：crawler → processor → summarizer → behaviorChangeTest → qdrant → END
 * 每步出错都会短路到 END
 */
const workflow = new StateGraph(KnowledgeState)
  // ---- 注册节点 ----
  .addNode("crawler", crawlerNode)
  .addNode("processor", processorNode)
  .addNode("summarizer", summarizerNode)
  .addNode("behaviorChangeTest", behaviorChangeTestNode)
  .addNode("qdrant", qdrantNode)

  // ---- 定义边 ----
  .addEdge("__start__", "crawler")
  .addConditionalEdges("crawler", shouldContinue)
  .addConditionalEdges("processor", shouldSummarize)
  .addConditionalEdges("summarizer", shouldTest)
  .addConditionalEdges("behaviorChangeTest", shouldUpsert)
  .addEdge("qdrant", END);

/** 编译后的可执行图 */
export const knowledgeGraph = workflow.compile();

/**
 * 运行知识处理工作流
 */
export async function runKnowledgePipeline(
  urls: string[],
  query?: string
): Promise<KnowledgeStateType> {
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  logger.info({ taskId, urls, query }, "启动知识处理流水线");

  const initialState: Partial<KnowledgeStateType> = {
    urls,
    query: query ?? "",
    taskId,
    status: "pending",
  };

  const result = await knowledgeGraph.invoke(initialState);

  logger.info({ taskId, status: result.status }, "知识处理流水线完成");

  return result;
}

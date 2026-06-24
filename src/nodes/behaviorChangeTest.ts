import type { KnowledgeStateType } from "../state/index.js";
import type { ProcessedData } from "../types/index.js";
import { callLocalLLM, logger } from "../tools/index.js";

/**
 * 行为变化测试（Behavior Change Test）节点
 *
 * 核心问题：如果这条知识不存在，Agent 是否会做出不同的（错误的）决策？
 *   ✅ 是 → 通过测试，入库保存
 *   ❌ 否 → 过滤掉，避免知识库膨胀
 *
 * 位于 summarizer → qdrant 之间，充当知识库的"质量门禁"
 */
export async function behaviorChangeTestNode(
  state: KnowledgeStateType
): Promise<Partial<KnowledgeStateType>> {
  const { processedData, query, taskId } = state;

  logger.info(
    { taskId, dataCount: processedData.length },
    "behaviorChangeTestNode 开始执行"
  );

  if (processedData.length === 0) {
    logger.warn({ taskId }, "没有数据需要测试");
    return {
      status: "done",
      passedTestCount: 0,
      filteredCount: 0,
      messages: ["⚠️ 行为变化测试：无数据"],
    };
  }

  try {
    const passed: ProcessedData[] = [];
    const filtered: string[] = [];

    for (const item of processedData) {
      const pass = await evaluateKnowledge(item.summary, item.sourceUrl, query);

      if (pass) {
        passed.push(item);
      } else {
        filtered.push(item.sourceUrl);
        logger.info(
          { sourceUrl: item.sourceUrl, taskId },
          "行为变化测试未通过，已过滤"
        );
      }
    }

    logger.info(
      {
        taskId,
        total: processedData.length,
        passed: passed.length,
        filtered: filtered.length,
      },
      "behaviorChangeTestNode 测试完成"
    );

    return {
      processedData: passed,
      passedTestCount: passed.length,
      filteredCount: filtered.length,
      status: "processing",
      messages: [
        `🔍 行为变化测试完成：${passed.length} 通过 / ${filtered.length} 过滤` +
          (filtered.length > 0
            ? `（过滤: ${filtered.map((u) => u.slice(0, 50)).join(", ")}）`
            : ""),
      ],
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ taskId, error: errorMsg }, "behaviorChangeTestNode 执行失败");

    // 测试失败不阻塞流程，保留全部数据
    return {
      status: "error",
      error: `行为变化测试失败: ${errorMsg}`,
      messages: [`❌ 行为变化测试失败: ${errorMsg}`],
    };
  }
}

/**
 * 判断一条知识是否值得入库
 *
 * @param knowledge - LLM 生成的摘要内容
 * @param sourceUrl - 来源 URL（辅助判断）
 * @param query - 原始查询意图（辅助判断）
 * @returns true = 通过测试，应入库
 */
async function evaluateKnowledge(
  knowledge: string,
  sourceUrl: string,
  query: string
): Promise<boolean> {
  const systemPrompt = `你是一个知识库管理员。你的任务是判断一条知识是否需要永久保存。

判断标准：**如果没有这条知识，Agent 在处理相关任务时，是否会做出不同的（错误的）决策？**

- 如果答案是"是"（这条知识属于 Agent 的认知盲区），请回答 是
- 如果答案是"否"（LLM 本来就知道这条常识，存不存都一样），请回答 否

注意：
1. 通用常识（如"巴黎是法国首都"）→ 否，不需要存
2. 私有信息、特定领域细节、个人偏好 → 是，必须存
3. 模糊笼统、毫无信息量的内容 → 否`;

  const contextParts: string[] = [`来源: ${sourceUrl}`];
  if (query) contextParts.push(`查询意图: ${query}`);

  const userMessage = `${contextParts.join("\n")}

待判断的知识摘要：
${knowledge.slice(0, 2000)}

请只回答 "是" 或 "否"。`;

  try {
    const response = await callLocalLLM(systemPrompt, userMessage);
    const clean = response.trim().replace(/[。，\.\,]/g, "");
    const passed = clean.includes("是") && !clean.includes("否");
    return passed;
  } catch {
    // LLM 调用失败时默认通过，避免因网络问题丢失知识
    return true;
  }
}

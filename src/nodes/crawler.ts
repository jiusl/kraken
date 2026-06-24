import type { KnowledgeStateType } from "../state/index.js";
import { crawlWebsites, logger } from "../tools/index.js";

/**
 * 爬虫节点：爬取 URL 列表中的网页，转为 Markdown
 */
export async function crawlerNode(
  state: KnowledgeStateType
): Promise<Partial<KnowledgeStateType>> {
  const { urls, taskId } = state;

  logger.info({ taskId, urlCount: urls.length }, "crawlerNode 开始执行");

  if (urls.length === 0) {
    logger.warn({ taskId }, "URL 列表为空，跳过爬取");
    return {
      status: "done",
      messages: ["⚠️ URL 列表为空，没有需要爬取的内容"],
    };
  }

  try {
    const crawledContent = await crawlWebsites(urls);

    return {
      crawledContent,
      status: "processing",
      messages: [
        `✅ 爬取完成：成功 ${crawledContent.successCount} 个，失败 ${crawledContent.failCount} 个`,
      ],
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ taskId, error: errorMsg }, "crawlerNode 执行失败");
    return {
      status: "error",
      error: errorMsg,
      messages: [`❌ 爬取失败: ${errorMsg}`],
    };
  }
}

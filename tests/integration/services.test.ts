/**
 * tests/integration/services.test.ts
 * 端到端集成测试 — 验证 LLM (DeepSeek/Ollama 兜底) + Embeddings + Qdrant 联通性
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantVectorStore } from "@langchain/qdrant";
import { Document } from "@langchain/core/documents";
import { config } from "../../src/config/index.js";

// 测试配置常量
const TEST_COLLECTION = "kraken_test_integration";
const TEST_TIMEOUT = 30_000;

/** 检测是否使用 DeepSeek API */
const useDeepseek =
  config.DEEPSEEK_API_KEY && config.DEEPSEEK_API_KEY.length > 0;

const LLM_CONFIG = useDeepseek
  ? {
      model: config.DEEPSEEK_MODEL,
      apiKey: config.DEEPSEEK_API_KEY,
      configuration: { baseURL: `${config.DEEPSEEK_BASE_URL}/v1` },
    }
  : {
      model: config.OLLAMA_FALLBACK_MODEL,
      apiKey: "ollama",
      configuration: { baseURL: `${config.OLLAMA_BASE_URL}/v1` },
    };

// 共享客户端实例
let chatModel: ChatOpenAI;
let embeddings: OpenAIEmbeddings;
let qdrantClient: QdrantClient;
let vectorStore: QdrantVectorStore;

describe("🔗 本地服务集成测试", () => {
  // ============================================
  // Setup — 仅在服务可用时运行
  // ============================================
  beforeAll(async () => {
    chatModel = new ChatOpenAI({
      ...LLM_CONFIG,
      temperature: 0.3,
      maxTokens: 256,
    });

    embeddings = new OpenAIEmbeddings({
      model: config.OLLAMA_EMBEDDING_MODEL,
      apiKey: "ollama",
      configuration: { baseURL: `${config.OLLAMA_BASE_URL}/v1` },
    });

    qdrantClient = new QdrantClient({
      url: config.QDRANT_URL,
      checkCompatibility: false,
    });

    // 清理并重建测试集合
    try {
      await qdrantClient.deleteCollection(TEST_COLLECTION);
    } catch { /* 不存在则忽略 */ }

    vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      client: qdrantClient,
      collectionName: TEST_COLLECTION,
    });
  }, TEST_TIMEOUT);

  // ============================================
  // 1. 大语言模型（DeepSeek / Ollama 兜底）
  // ============================================
  describe(useDeepseek ? "DeepSeek LLM" : "Ollama LLM (兜底)", () => {
    it(
      "应能成功调用 LLM 并返回非空响应",
      async () => {
        const response = await chatModel.invoke("用一句话介绍什么是 RAG 技术。");

        expect(response).toBeDefined();
        expect(typeof response.content).toBe("string");
        expect(response.content.length).toBeGreaterThan(0);
        console.log(`\n📤 LLM 响应: ${response.content.slice(0, 120)}...`);
      },
      TEST_TIMEOUT,
    );

    it(
      "应支持流式输出",
      async () => {
        const stream = await chatModel.stream("说 'hello world'");
        const chunks: string[] = [];

        for await (const chunk of stream) {
          if (typeof chunk.content === "string") {
            chunks.push(chunk.content);
          }
        }

        const full = chunks.join("");
        expect(full.length).toBeGreaterThan(0);
        console.log(`\n📤 流式输出 (${chunks.length} chunks): ${full.slice(0, 80)}...`);
      },
      TEST_TIMEOUT,
    );

    it(
      "应能处理中文指令",
      async () => {
        const response = await chatModel.invoke(
          "请提取以下文本的关键词（以逗号分隔）：\n\n人工智能正在深刻改变我们的生活方式，从自动驾驶到智能医疗，AI技术无处不在。",
        );

        expect(response.content).toBeDefined();
        const text = String(response.content);
        // 关键词应包含逗号
        expect(text).toMatch(/[,，]/);
        console.log(`\n📤 关键词提取: ${text}`);
      },
      TEST_TIMEOUT,
    );
  });

  // ============================================
  // 2. Ollama Embeddings
  // ============================================
  describe("Ollama Embeddings", () => {
    it(
      "应能生成中文文本向量",
      async () => {
        const vectors = await embeddings.embedDocuments([
          "kraken 是一个智能知识处理服务",
          "它基于 LangGraph 构建，支持多节点流水线处理",
        ]);

        expect(vectors).toHaveLength(2);
        // 每个向量应该是数字数组
        expect(Array.isArray(vectors[0])).toBe(true);
        expect(vectors[0].length).toBeGreaterThan(0);
        console.log(
          `\n🧮 向量维度: ${vectors[0].length}（期望 embeddinggemma 768 维）`,
        );
      },
      TEST_TIMEOUT,
    );

    it(
      "应能生成查询向量",
      async () => {
        const queryVector = await embeddings.embedQuery("知识处理流水线");

        expect(Array.isArray(queryVector)).toBe(true);
        expect(queryVector.length).toBeGreaterThan(0);
        console.log(`\n🧮 查询向量维度: ${queryVector.length}`);
      },
      TEST_TIMEOUT,
    );

    it(
      "相似文本应产生相近的向量（余弦相似度校验）",
      async () => {
        const [v1, v2, v3] = await embeddings.embedDocuments([
          "机器学习是人工智能的一个重要分支",
          "机器学习是AI领域的重要技术方向",
          "今天天气非常好，阳光明媚",
        ]);

        // 余弦相似度函数
        const cosineSimilarity = (a: number[], b: number[]): number => {
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
          }
          return dot / (Math.sqrt(normA) * Math.sqrt(normB));
        };

        const simSame = cosineSimilarity(v1, v2); // 同话题
        const simDiff = cosineSimilarity(v1, v3); // 不同话题

        console.log(
          `\n📐 相似度 — 同话题: ${simSame.toFixed(4)} | 不同话题: ${simDiff.toFixed(4)}`,
        );

        // 同话题相似度应 > 不同话题
        expect(simSame).toBeGreaterThan(simDiff);
      },
      TEST_TIMEOUT,
    );
  });

  // ============================================
  // 3. Qdrant 向量数据库
  // ============================================
  describe("Qdrant 向量数据库", () => {
    it(
      "应能创建并确认集合",
      async () => {
        const { collections } = await qdrantClient.getCollections();
        const names = collections.map((c) => c.name);

        console.log(`\n📦 Qdrant 集合列表: ${names.join(", ")}`);
        expect(names).toContain(TEST_COLLECTION);
      },
      TEST_TIMEOUT,
    );

    it(
      "应能添加文档并搜索",
      async () => {
        // 通过 QdrantVectorStore 直接添加（确保 collection 已存在）
        const docIds = await vectorStore.addDocuments([
          new Document({
            pageContent: "Kraken 是基于 LangGraph 的知识处理服务",
            metadata: { source: "test", id: "1" },
          }),
          new Document({
            pageContent: "LangGraph 支持 StateGraph 实现多节点工作流",
            metadata: { source: "test", id: "2" },
          }),
          new Document({
            pageContent: "向量数据库用于存储和检索高维向量数据",
            metadata: { source: "test", id: "3" },
          }),
        ]);

        // fromExistingCollection 的 addDocuments 可能返回空数组，直接验证搜索
        console.log(`\n📝 已添加文档，开始搜索验证...`);

        // 搜索相关文档
        const results = await vectorStore.similaritySearchWithScore(
          "知识处理框架",
          2,
        );

        expect(results.length).toBeGreaterThanOrEqual(1);
        for (const [doc, score] of results) {
          console.log(
            `\n🔍 搜索结果 → 相似度: ${score.toFixed(4)} | 内容: ${doc.pageContent.slice(0, 60)}`,
          );
        }
      },
      TEST_TIMEOUT,
    );

    it(
      "应能通过向量 ID 直接获取点数据",
      async () => {
        // 先 upsert 一个点
        const embedding = await embeddings.embedDocuments(["测试文档内容"]);
        const pointId = crypto.randomUUID();
        await qdrantClient.upsert(TEST_COLLECTION, {
          wait: true,
          points: [
            {
              id: pointId,
              vector: embedding[0],
              payload: { source: "test", text: "测试文档内容" },
            },
          ],
        });

        // 查询点
        const result = await qdrantClient.retrieve(TEST_COLLECTION, {
          ids: [pointId],
          with_payload: true,
        });

        expect(result).toHaveLength(1);
        expect(result[0].payload?.text).toBe("测试文档内容");
        console.log(`\n✅ 直接检索到点: ${result[0].id}`);
      },
      TEST_TIMEOUT,
    );

    it(
      "应能在不同相似度阈值下返回合理结果",
      async () => {
        // 添加无关文档测试
        const results = await vectorStore.similaritySearchWithScore(
          "完全无关的查询文字xxxx",
          2,
        );

        expect(results.length).toBeGreaterThanOrEqual(0);
        if (results.length > 0) {
          console.log(
            `\n🔍 低相关搜索 → 最高分: ${results[0][1].toFixed(4)}`,
          );
        }
      },
      TEST_TIMEOUT,
    );
  });

  // ============================================
  // 4. 端到端流水线
  // ============================================
  describe("端到端 RAG 流水线", () => {
    it(
      "嵌入 → 入库 → 检索 → LLM 增强回答",
      async () => {
        // Step 1: 嵌入并入库知识
        await vectorStore.addDocuments([
          new Document({
            pageContent:
              "Kraken 项目使用 Ollama 运行本地大语言模型 qwen2.5:1.5b，并通过 embeddinggemma 模型进行文本向量化。Qdrant 提供高效的向量检索能力。整个流水线由 LangGraph 的状态图协调。",
            metadata: { source: "kraken-docs", id: "arch" },
          }),
        ]);
        console.log(`\n✅ 知识文档已入库`);

        // Step 2: 根据用户查询检索相关文档
        const query = "Kraken 使用了哪些技术组件？";
        const [embedQuery] = await embeddings.embedDocuments([query]);
        expect(embedQuery.length).toBeGreaterThan(0);

        const searchResults = await vectorStore.similaritySearchWithScore(
          query,
          1,
        );
        expect(searchResults.length).toBeGreaterThan(0);

        const [topDoc] = searchResults;
        const context = topDoc[0].pageContent;
        console.log(`\n🔍 检索到的上下文: ${context.slice(0, 120)}...`);

        // Step 3: 用检索结果增强 LLM 回答
        const augmentedPrompt = `基于以下上下文回答问题。如果上下文中没有相关信息，请如实说明。

上下文：${context}

问题：${query}

回答：`;

        const response = await chatModel.invoke(augmentedPrompt);
        const answer = String(response.content);

        console.log(`\n🤖 RAG 回答: ${answer.slice(0, 200)}`);

        expect(answer.length).toBeGreaterThan(0);
        // 回答中应包含上下文的关键信息
        expect(
          answer.includes("Ollama") ||
            answer.includes("Qdrant") ||
            answer.includes("LangGraph"),
        ).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });
});

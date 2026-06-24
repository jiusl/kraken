# 🐙 Kraken — 智能知识处理服务

基于 **LangGraph** 的网页内容抓取 → LLM 摘要 → 向量化入库的后台服务。支持固定流水线和 Agent 自主决策双轨并行，通过 REST API 对外暴露。

## 架构

```
HTTP API (Hono)
    │
    ├── POST /knowledge/process   → 固定流水线 (Crawler → Chunk → Summarize → Upsert)
    ├── POST /knowledge/supplement → Agent 自主流程 (LLM 决策: 搜索→爬取→摘要→入库)
    ├── POST /knowledge/smart     → 智能路由 (自动选择上述两种)
    ├── POST /knowledge/search    → 语义搜索 (Qdrant 向量检索)
    └── GET  /health             → 服务健康检查
```

### 固定流水线

```
crawlerNode → processorNode → summarizerNode → qdrantNode
```

用户提供 URL 列表，服务自动完成爬取 → 文本切分 → LLM 摘要 → 向量入库。

### Agent 流程

LLM 配备 5 个工具自主决策：`search_web`、`crawl_webpage`、`summarize_content`、`save_knowledge`、`query_existing`。用户只需描述意图，Agent 自行规划并执行多轮迭代。

### LLM 策略

| 条件 | 使用模型 |
|------|----------|
| `DEEPSEEK_API_KEY` 已配置 | DeepSeek (`deepseek-chat`, 4096 tokens) |
| `DEEPSEEK_API_KEY` 为空 | Ollama 兜底 (`qwen2.5:1.5b`, 512 tokens) |

## 依赖服务

| 服务 | 用途 | 默认端口 |
|------|------|----------|
| **Ollama** | Embedding 模型 + LLM 兜底 | `11434` |
| **Qdrant** | 向量数据库 | `6333` |
| **SearXNG** | 元搜索引擎（Agent 流程需要） | `8080` |
| **DeepSeek API** | 远程推理（可选） | — |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 DeepSeek API Key（可选，留空则用 Ollama 兜底）

# 3. 开发模式启动
npm run dev
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `3000` | HTTP 服务端口 |
| `OLLAMA_BASE_URL` | 否 | `http://localhost:11434` | Ollama 地址 |
| `OLLAMA_EMBEDDING_MODEL` | 否 | `embeddinggemma` | 嵌入模型名 |
| `OLLAMA_FALLBACK_MODEL` | 否 | `qwen2.5:1.5b-instruct-q4_K_M` | LLM 兜底模型 |
| `DEEPSEEK_API_KEY` | 否 | — | DeepSeek API Key（为空则降级） |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | DeepSeek 地址 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-chat` | DeepSeek 模型名 |
| `QDRANT_URL` | 否 | `http://localhost:6333` | Qdrant 地址 |
| `QDRANT_COLLECTION_NAME` | 否 | `kraken_knowledge` | Qdrant 集合名 |
| `SEARXNG_URL` | 否 | `http://localhost:8080` | SearXNG 地址 |
| `SEARXNG_ENABLED` | 否 | `true` | 是否启用搜索 |
| `CHUNK_SIZE` | 否 | `1000` | 文本切分大小 |
| `AGENT_MAX_ITERATIONS` | 否 | `10` | Agent 最大迭代次数 |
| `LOG_FILE_PATH` | 否 | — | 日志文件路径（留空仅控制台） |

## API 参考

### `GET /health`

健康检查，返回所有依赖服务的连接状态。

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "uptime": 3600,
  "services": {
    "ollama": "connected",
    "deepseek": "connected",
    "qdrant": "connected",
    "searxng": "connected"
  },
  "version": "1.0.0"
}
```

### `POST /knowledge/process`

提交 URL 列表，执行固定流水线（爬取 → 切分 → 摘要 → 入库）。

```bash
curl -X POST http://localhost:3000/knowledge/process \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com/doc"], "query": "AI 技术"}'
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `urls` | `string[]` | ✅ | 1-10 个 URL |
| `query` | `string` | 否 | 指导摘要方向（≤500 字） |

### `POST /knowledge/search`

语义搜索已入库的知识。

```bash
curl -X POST http://localhost:3000/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "什么是 RAG", "limit": 5, "scoreThreshold": 0.5}'
```

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `query` | `string` | ✅ | — | 搜索词 |
| `limit` | `number` | 否 | `5` | 返回条数 (1-50) |
| `scoreThreshold` | `number` | 否 | `0.5` | 相似度阈值 (0-1) |

### `POST /knowledge/supplement`

Agent 驱动的智能知识补充（需 SearXNG 已启用）。

```bash
curl -X POST http://localhost:3000/knowledge/supplement \
  -H "Content-Type: application/json" \
  -d '{"intent": "我需要了解 Transformer 架构的最新进展"}'
```

### `POST /knowledge/smart`

智能路由：有 `urls` 走固定流程，有 `intent` 走 Agent 流程。

```bash
curl -X POST http://localhost:3000/knowledge/smart \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://..."], "intent": "了解 AI 最新进展"}'
```

### 错误响应

所有接口 4xx/5xx 统一返回：

```json
{ "success": false, "error": "错误描述", "code": "VALIDATION_ERROR" }
```

## 项目结构

```
src/
├── index.ts                        # 应用入口
├── api/
│   ├── app.ts                      # Hono 实例 + 中间件
│   ├── middleware/
│   │   ├── accessLog.ts            # 访问日志 (IP, UA, body, 耗时)
│   │   └── requestId.ts            # X-Request-Id 注入
│   └── routes/
│       ├── health.ts               # GET  /health
│       └── knowledge.ts            # POST /knowledge/*
├── agents/
│   └── knowledgeManagerAgent.ts    # Agent 定义 (5 工具 + StateGraph)
├── config/
│   └── env.ts                      # Zod 环境变量验证
├── graphs/
│   ├── knowledge.ts                # 固定流水线 StateGraph
│   └── agentGraph.ts               # Agent 流水线包装
├── nodes/                          # 固定流水线节点
│   ├── crawler.ts                  # 网页爬取
│   ├── processor.ts                # 文本切分
│   ├── summarizer.ts               # LLM 摘要
│   └── qdrant.ts                   # 向量入库
├── services/                       # 外部服务封装
│   ├── ollama.ts                   # Ollama (LLM 兜底 + Embedding)
│   ├── deepseek.ts                 # DeepSeek API + 智能降级工厂
│   ├── qdrant.ts                   # Qdrant 客户端
│   └── searxng.ts                  # SearXNG 健康检查
├── state/
│   └── knowledge.ts                # LangGraph Annotation 状态
├── tools/                          # 底层工具
│   ├── crawler.ts                  # Cheerio 爬虫
│   ├── llm.ts                      # LLM 调用封装
│   ├── logger.ts                   # Pino 结构化日志
│   ├── qdrant.ts                   # Qdrant CRUD
│   ├── searchTool.ts               # SearXNG 搜索
│   └── text.ts                     # 文本切分
└── types/
    ├── api.ts                      # HTTP 请求/响应类型
    └── knowledge.ts                # 领域类型
```

## 脚本

```bash
npm run dev         # 开发模式 (tsx watch)
npm run build       # TypeScript 编译
npm run start       # 生产启动 (dist/index.js)
npm run typecheck   # 类型检查
npm test            # 运行测试 (88 个)
npm run lint        # ESLint
npm run format      # Prettier
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js + TypeScript |
| HTTP 框架 | Hono |
| 工作流引擎 | LangGraph |
| LLM 调用 | @langchain/openai |
| 向量数据库 | Qdrant |
| 搜索引擎 | SearXNG |
| 日志 | Pino |
| 验证 | Zod |
| 测试 | Vitest |


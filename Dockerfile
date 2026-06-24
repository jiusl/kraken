# ===== Node.js 应用 =====
# 多阶段构建: builder → runner
FROM node:22-alpine AS builder

WORKDIR /app

# 利用 Docker 层缓存：先装依赖
COPY package.json package-lock.json ./
RUN npm ci --production=false

# 编译 TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# 修剪到仅生产依赖
RUN npm ci --production=true && npm cache clean --force


# ===== 运行镜像 =====
FROM node:22-alpine AS runner

# 安全：非 root 用户运行
RUN addgroup -S kraken && adduser -S kraken -G kraken
USER kraken

WORKDIR /app

# 从 builder 复制产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]

/**
 * src/api/middleware/accessLog.ts
 * 完整 HTTP 访问日志中间件 —— 记录 IP、UA、方法、路径、耗时、状态码、请求/响应体
 */
import type { MiddlewareHandler } from "hono";
import { logger } from "../../tools/index.js";

/**
 * 获取客户端真实 IP（支持反向代理）
 */
function getClientIP(c: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const realIP = c.req.header("x-real-ip");
  if (realIP) return realIP;
  // Hono 的 req.raw 没有直接暴露 remoteAddress，尝试从 header 取
  return c.req.header("x-remote-addr") ?? "unknown";
}

/**
 * 截断过长的 body 用于日志（避免日志膨胀）
 */
function truncateBody(body: unknown, maxLen = 2000): unknown {
  if (typeof body === "string") {
    return body.length > maxLen ? body.slice(0, maxLen) + `...[截断,总长${body.length}]` : body;
  }
  if (body && typeof body === "object") {
    const str = JSON.stringify(body);
    return str.length > maxLen ? str.slice(0, maxLen) + `...[截断,总长${str.length}]` : body;
  }
  return body;
}

/**
 * 构建标准访问日志条目
 */
interface AccessLogEntry {
  requestId: string;
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  clientIP: string;
  userAgent: string;
  query?: Record<string, string[] | string>;
  requestBody?: unknown;
  responseBody?: unknown;
  responseSize?: number;
}

export const accessLog: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const requestId = c.get("requestId") as string ?? "unknown";
  const method = c.req.method;
  const path = c.req.path;
  const clientIP = getClientIP(c);
  const userAgent = c.req.header("user-agent") ?? "unknown";
  const query = c.req.queries();

  // 尝试解析请求体
  let requestBody: unknown = undefined;
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    try {
      const cloned = c.req.raw.clone();
      const contentType = c.req.header("content-type") ?? "";
      if (contentType.includes("application/json")) {
        requestBody = await cloned.json().catch(() => "[无法解析 JSON body]");
        requestBody = truncateBody(requestBody);
      }
    } catch {
      requestBody = "[body 解析错误]";
    }
  }

  await next();

  const durationMs = Date.now() - start;
  const statusCode = c.res.status;

  // 尝试捕获响应体
  let responseBody: unknown = undefined;
  let responseSize: number | undefined;
  try {
    const cloned = c.res.clone();
    const contentType = c.res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const text = await cloned.text().catch(() => null);
      if (text) {
        responseSize = text.length;
        responseBody = truncateBody(JSON.parse(text));
      }
    }
  } catch {
    // 无法读取响应体则忽略
  }

  const logEntry: AccessLogEntry = {
    requestId,
    timestamp: start,
    method,
    path,
    statusCode,
    durationMs,
    clientIP,
    userAgent,
    query: Object.keys(query).length > 0 ? query : undefined,
    requestBody,
    responseBody,
    responseSize,
  };

  // 根据状态码选择日志级别
  if (statusCode >= 500) {
    logger.error(logEntry, `❌ ${method} ${path}`);
  } else if (statusCode >= 400) {
    logger.warn(logEntry, `⚠️ ${method} ${path}`);
  } else {
    // 健康检查端点降级为 debug
    if (path === "/health") {
      logger.debug(logEntry, `✅ ${method} ${path}`);
    } else {
      logger.info(logEntry, `✅ ${method} ${path}`);
    }
  }
};

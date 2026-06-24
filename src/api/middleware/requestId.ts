/**
 * src/api/middleware/requestId.ts
 * 为每个请求生成唯一 ID（X-Request-Id），贯穿整个请求生命周期
 */
import type { MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";

const REQUEST_ID_HEADER = "X-Request-Id";

export const requestId: MiddlewareHandler = async (c, next) => {
  // 优先使用上游传入的，否则自行生成
  const incoming = c.req.header(REQUEST_ID_HEADER);
  const id = incoming ?? randomUUID();

  // 注入到 context 和响应头
  c.set("requestId", id);
  c.res.headers.set(REQUEST_ID_HEADER, id);

  await next();
};

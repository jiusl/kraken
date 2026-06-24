import pino from "pino";
import { config } from "../config/index.js";

/**
 * 结构化日志实例
 *
 * - 开发环境：pino-pretty 美化输出到控制台
 * - 生产 / 配置了 LOG_FILE_PATH：同时写入文件（JSON 格式，按天轮转）
 */

const targets: pino.TransportTargetOptions[] = [];

if (config.NODE_ENV === "development") {
  targets.push({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname",
    },
    level: "info",
  });
} else {
  // 生产环境仍输出 JSON 到控制台
  targets.push({
    target: "pino/file",
    options: { destination: 1 },
    level: config.LOG_LEVEL,
  });
}

// 配置了文件路径则同时写入磁盘
if (config.LOG_FILE_PATH) {
  targets.push({
    target: "pino/file",
    options: { destination: config.LOG_FILE_PATH, mkdir: true },
    level: config.LOG_LEVEL,
  });
}

export const logger = targets.length > 0
  ? pino({
      level: config.LOG_LEVEL,
      transport: { targets },
    })
  : pino({
      level: config.LOG_LEVEL,
    });

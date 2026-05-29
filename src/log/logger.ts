import { appendFile } from "fs/promises";
import { join } from "path";
import type { Logger, LogLevel } from "./types";

// 编译时常量：esbuild --define:__DEV__=false 时全局替换为 false
// ts-node 开发时 __DEV__ 不存在，typeof 安全兜底避免 ReferenceError
declare const __DEV__: boolean;

// DevLogger 仅在 IS_DEV 为 true 时被引用，esbuild 生产构建时该分支变为 dead code
// DevLogger 类体及所有依赖（appendFile/join/agent.log）被 tree-shaking 彻底移除
class DevLogger implements Logger {
  private category: string;

  constructor(category: string) {
    this.category = category;
  }

  private format(level: LogLevel, msg: string, data?: unknown): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    let line = `[${timestamp}] [${level.toUpperCase()}] [${this.category}] ${msg}`;
    if (data !== undefined) {
      line += ` | ${JSON.stringify(data)}`;
    }
    return line + "\n";
  }

  private async write(
    level: LogLevel,
    msg: string,
    data?: unknown,
  ): Promise<void> {
    const formatted = this.format(level, msg, data);

    if (level !== "debug") {
      process.stderr.write(formatted);
    }

    try {
      await appendFile(join(process.cwd(), "agent.log"), formatted, "utf-8");
    } catch {
      // 写文件失败不影响正常运行
    }
  }

  debug(msg: string, data?: unknown): void {
    this.write("debug", msg, data);
  }
  info(msg: string, data?: unknown): void {
    this.write("info", msg, data);
  }
  warn(msg: string, data?: unknown): void {
    this.write("warn", msg, data);
  }
  error(msg: string, data?: unknown): void {
    this.write("error", msg, data);
  }
}

class NoopLogger implements Logger {
  debug(_msg: string, _data?: unknown): void {}
  info(_msg: string, _data?: unknown): void {}
  warn(_msg: string, _data?: unknown): void {}
  error(_msg: string, _data?: unknown): void {}
}

// __DEV__ 被 esbuild --define 替换为 false 时：
// false !== false → false → DevLogger 分支变为 dead code
// ts-node 开发时 __DEV__ 未定义 → undefined !== false → true → 使用 DevLogger
// ts-node 开发: typeof __DEV__ === "undefined" → true → DevLogger，写 agent.log
// esbuild 生产: __DEV__ → false → typeof false === "undefined" → false
//   → false || false → false → DevLogger 分支整体被 DCE 移除
export function createLogger(category: string): Logger {
  if (typeof __DEV__ === "undefined" || __DEV__) {
    return new DevLogger(category);
  }
  return new NoopLogger();
}

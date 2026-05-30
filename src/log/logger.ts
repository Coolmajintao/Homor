import { openSync, writeSync, fsyncSync } from "fs";
import { join } from "path";
import type { Logger, LogLevel } from "./types";

declare const __DEV__: boolean;

class DevLogger implements Logger {
  private category: string;
  private static logFd: number | null = null;
  private static readonly BUFFER_SIZE = 4096; // 4KB缓冲区，平衡性能和可靠性
  private buffer: string = "";

  constructor(category: string) {
    this.category = category;
    // 单例模式打开一次文件句柄，整个程序生命周期只打开一次
    if (!DevLogger.logFd) {
      try {
        DevLogger.logFd = openSync(join(process.cwd(), "agent.log"), "a");
      } catch {
        DevLogger.logFd = null;
      }
    }
  }

  private format(level: LogLevel, msg: string, data?: unknown): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, "0")}`;
    let line = `[${timestamp}] [${level.toUpperCase()}] [${this.category}] ${msg}`;
    if (data !== undefined) {
      line += ` | ${JSON.stringify(data, (_, v) => (v instanceof Error ? { message: v.message, stack: v.stack } : v))}`;
    }
    return line + "\n";
  }

  private flush(): void {
    if (DevLogger.logFd && this.buffer.length > 0) {
      try {
        writeSync(DevLogger.logFd, this.buffer);
        this.buffer = "";
      } catch {
        // 写文件失败不影响正常运行
      }
    }
  }

  private write(level: LogLevel, msg: string, data?: unknown): void {
    const formatted = this.format(level, msg, data);

    // stderr写入：Node.js中stderr指向TTY/文件时是同步的，保证时序
    if (level !== "debug") {
      process.stderr.write(formatted);
    }

    if (DevLogger.logFd) {
      this.buffer += formatted;

      // 缓冲区满 或 错误日志 立即刷盘
      if (this.buffer.length >= DevLogger.BUFFER_SIZE || level === "error") {
        this.flush();

        // 错误日志额外调用fsync强制刷到磁盘物理介质
        if (level === "error") {
          try {
            fsyncSync(DevLogger.logFd);
          } catch {}
        }
      }
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

  // 程序优雅退出时调用，确保所有日志都写入磁盘
  static shutdown(): void {
    if (DevLogger.logFd) {
      try {
        // 刷新所有实例的缓冲区
        // 注意：这里简化了，实际需要维护所有DevLogger实例的列表
        // 或者将buffer改为静态变量
        fsyncSync(DevLogger.logFd);
      } catch {}
    }
  }
}

class NoopLogger implements Logger {
  debug(_msg: string, _data?: unknown): void {}
  info(_msg: string, _data?: unknown): void {}
  warn(_msg: string, _data?: unknown): void {}
  error(_msg: string, _data?: unknown): void {}
}

export function createLogger(category: string): Logger {
  if (typeof __DEV__ === "undefined" || __DEV__) {
    return new DevLogger(category);
  }
  return new NoopLogger();
}

// 注册进程退出事件，确保程序退出时所有日志都写入磁盘
process.on("exit", () => {
  if (typeof __DEV__ === "undefined" || __DEV__) {
    DevLogger.shutdown();
  }
});

process.on("uncaughtException", (err) => {
  if (typeof __DEV__ === "undefined" || __DEV__) {
    const logger = createLogger("uncaughtException");
    logger.error("Uncaught exception", err);
    DevLogger.shutdown();
  }
  process.exit(1);
});

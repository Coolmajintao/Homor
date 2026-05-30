// ============================================================
// MemoryStore — 纯文件读写层，不含业务逻辑
// ============================================================
import * as fs from "fs";
import * as path from "path";
import { createLogger, Logger } from "../../log";
import type { MemoryMessage, SessionIndex, SessionMeta } from "./types";

export class MemoryStore {
  private baseDir: string;
  private sessionsDir: string;
  private indexPath: string;
  private logger: Logger;

  constructor(projectRoot: string, dirName = ".dun") {
    this.baseDir = path.join(projectRoot, dirName);
    this.sessionsDir = path.join(this.baseDir, "sessions");
    this.indexPath = path.join(this.sessionsDir, "index.json");
    this.logger = createLogger("MEM-STORE");
  }

  // ---- 目录初始化 ----
  ensureDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
      this.logger.info("创建记忆目录", { dir: this.sessionsDir });
    }
  }

  // ---- 消息读写 ----
  appendMessage(sessionId: string, msg: MemoryMessage): void {
    const filePath = this.rawPath(sessionId);
    const line = JSON.stringify(msg) + "\n";
    fs.appendFileSync(filePath, line, "utf-8");
  }

  readMessages(sessionId: string, fromIndex = 0): MemoryMessage[] {
    const filePath = this.rawPath(sessionId);
    if (!fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, "utf-8");
    const messages: MemoryMessage[] = [];
    let idx = 0;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as MemoryMessage;
        if (idx >= fromIndex) messages.push(msg);
        idx++;
      } catch {
        this.logger.warn("jsonl 行解析失败，跳过", { sessionId, line: line.slice(0, 80) });
        idx++; // 仍然计数以保持 fromIndex 语义
      }
    }
    return messages;
  }

  countMessages(sessionId: string): number {
    const filePath = this.rawPath(sessionId);
    if (!fs.existsSync(filePath)) return 0;
    const raw = fs.readFileSync(filePath, "utf-8");
    return raw.split("\n").filter((l) => l.trim()).length;
  }

  // ---- 摘要读写 ----
  writeSummary(sessionId: string, md: string): void {
    const filePath = this.summaryPath(sessionId);
    fs.writeFileSync(filePath, md, "utf-8");
  }

  readSummary(sessionId: string): string {
    const filePath = this.summaryPath(sessionId);
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf-8");
  }

  // ---- 索引读写（原子写） ----
  readIndex(): SessionIndex {
    if (!fs.existsSync(this.indexPath)) {
      return { version: 1, sessions: [] };
    }
    try {
      const raw = fs.readFileSync(this.indexPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1) {
        throw new Error(`不支持的索引版本: ${parsed.version}`);
      }
      return parsed as SessionIndex;
    } catch (err: any) {
      this.logger.warn("索引读取失败，尝试重建", { error: err.message });
      // 备份损坏文件
      const bak = this.indexPath + ".bak";
      try { fs.copyFileSync(this.indexPath, bak); } catch {}
      // 扫描 sessions 目录重建
      return this.rebuildIndex();
    }
  }

  writeIndex(index: SessionIndex): void {
    // 原子写：先写临时文件，再 rename
    const tmp = this.indexPath + ".tmp";
    const json = JSON.stringify(index, null, 2);
    fs.writeFileSync(tmp, json, "utf-8");
    fs.renameSync(tmp, this.indexPath);
  }

  /** 扫描 sessions 目录重建索引 */
  private rebuildIndex(): SessionIndex {
    const sessions: SessionMeta[] = [];
    if (fs.existsSync(this.sessionsDir)) {
      for (const entry of fs.readdirSync(this.sessionsDir)) {
        if (entry.endsWith(".jsonl")) {
          const id = entry.replace(".jsonl", "");
          const rawFile = entry;
          const summaryFile = id + ".md";
          const stats = fs.statSync(path.join(this.sessionsDir, entry));
          sessions.push({
            id,
            title: "Recovered",
            status: "interrupted" as const,
            startedAt: stats.birthtime.toISOString(),
            updatedAt: stats.mtime.toISOString(),
            messageCount: this.countMessages(id),
            summaryFile,
            rawFile,
            pendingTodos: [],
            lastDistilledIndex: 0,
          });
        }
      }
    }
    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.logger.info("索引重建完成", { sessionCount: sessions.length });
    return { version: 1, sessions };
  }

  /** 删除会话文件 */
  deleteSession(sessionId: string): void {
    try { fs.unlinkSync(this.rawPath(sessionId)); } catch {}
    try { fs.unlinkSync(this.summaryPath(sessionId)); } catch {}
  }

  // ---- 路径工具 ----
  rawPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.jsonl`);
  }
  summaryPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.md`);
  }
}

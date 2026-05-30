// ============================================================
// SessionManager — 会话生命周期管理
// ============================================================
import * as crypto from "crypto";
import { MemoryStore } from "./MemoryStore";
import type {
  MemoryMessage,
  SessionMeta,
  SessionIndex,
  ResumeContext,
  MemoryConfig,
} from "./types";
import { DEFAULT_MEMORY_CONFIG } from "./types";
import { createLogger, Logger } from "../../log";

export class SessionManager {
  private store: MemoryStore;
  private config: MemoryConfig;
  private activeSessionId: string | null = null;
  private logger: Logger;
  private messageCount = 0; // 当前会话的消息数

  constructor(projectRoot: string, config?: Partial<MemoryConfig>) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.store = new MemoryStore(projectRoot, this.config.dir);
    this.logger = createLogger("SESSION");
    this.store.ensureDir();
  }

  // ---- 会话创建 ----
  createSession(): SessionMeta {
    const id = this.generateId();
    const now = new Date().toISOString();
    const meta: SessionMeta = {
      id,
      title: "Untitled",
      status: "active",
      startedAt: now,
      updatedAt: now,
      messageCount: 0,
      summaryFile: `${id}.md`,
      rawFile: `${id}.jsonl`,
      pendingTodos: [],
      lastDistilledIndex: 0,
    };

    const index = this.store.readIndex();
    index.sessions.unshift(meta);
    this.store.writeIndex(index);

    this.activeSessionId = id;
    this.messageCount = 0;
    this.logger.info("会话创建", { id });

    return meta;
  }

  // ---- 消息追加 ----
  addMessage(sessionId: string, msg: MemoryMessage): void {
    this.store.appendMessage(sessionId, msg);
    this.messageCount++;

    // 更新 index 中的 messageCount 和 updatedAt
    const index = this.store.readIndex();
    const meta = index.sessions.find((s) => s.id === sessionId);
    if (meta) {
      meta.messageCount = this.store.countMessages(sessionId);
      meta.updatedAt = new Date().toISOString();
      this.store.writeIndex(index);
    }
  }

  getMessageCount(): number {
    return this.messageCount;
  }

  // ---- 会话结束 ----
  endSession(sessionId: string, status: "completed" | "interrupted"): void {
    const index = this.store.readIndex();
    const meta = index.sessions.find((s) => s.id === sessionId);
    if (meta) {
      meta.status = status;
      meta.updatedAt = new Date().toISOString();
      meta.messageCount = this.store.countMessages(sessionId);
      this.store.writeIndex(index);
      this.logger.info("会话结束", { id: sessionId, status });
    }
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
  }

  // ---- 恢复 ----
  findResumable(): SessionMeta | null {
    const index = this.store.readIndex();
    // 找最近一条 interrupted 的会话
    const interrupted = index.sessions
      .filter((s) => s.status === "interrupted")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return interrupted[0] || null;
  }

  resume(sessionId: string): ResumeContext {
    const index = this.store.readIndex();
    const meta = index.sessions.find((s) => s.id === sessionId);
    if (!meta) throw new Error(`会话不存在: ${sessionId}`);

    // 更新状态为 active
    meta.status = "active";
    meta.updatedAt = new Date().toISOString();
    this.store.writeIndex(index);

    this.activeSessionId = sessionId;
    this.messageCount = meta.messageCount;

    const summary = this.store.readSummary(sessionId);
    const allMessages = this.store.readMessages(sessionId);
    const recentMessages = allMessages.slice(-this.config.recentMessageCount);

    this.logger.info("会话恢复", { id: sessionId, messageCount: allMessages.length });

    return {
      sessionId,
      title: meta.title,
      summary,
      pendingTodos: meta.pendingTodos,
      recentMessages,
    };
  }

  // ---- 更新摘要元信息 ----
  updateDistillMeta(
    sessionId: string,
    lastDistilledIndex: number,
    title?: string,
    pendingTodos?: string[],
  ): void {
    const index = this.store.readIndex();
    const meta = index.sessions.find((s) => s.id === sessionId);
    if (meta) {
      meta.lastDistilledIndex = lastDistilledIndex;
      if (title) meta.title = title;
      if (pendingTodos) meta.pendingTodos = pendingTodos;
      this.store.writeIndex(index);
    }
  }

  // ---- 读取会话消息（供蒸馏用） ----
  getMessagesSince(sessionId: string, fromIndex: number): MemoryMessage[] {
    return this.store.readMessages(sessionId, fromIndex);
  }

  getSessionMeta(sessionId: string): SessionMeta | null {
    const index = this.store.readIndex();
    return index.sessions.find((s) => s.id === sessionId) || null;
  }

  // ---- 写入摘要 ----
  writeSummary(sessionId: string, md: string): void {
    this.store.writeSummary(sessionId, md);
  }

  readSummary(sessionId: string): string {
    return this.store.readSummary(sessionId);
  }

  // ---- 辅助 ----
  private generateId(): string {
    const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    const rand = crypto.randomBytes(2).toString("hex");
    return `${ts}-${rand}`;
  }

  // ---- 记忆浏览 ----
  listRecentSessions(limit = 10): SessionMeta[] {
    const index = this.store.readIndex();
    return index.sessions.slice(0, limit);
  }

  getSessionMemory(sessionId: string): {
    meta: SessionMeta;
    summary: string;
    recentMessages: MemoryMessage[];
  } | null {
    const meta = this.getSessionMeta(sessionId);
    if (!meta) return null;
    const summary = this.store.readSummary(sessionId);
    const allMessages = this.store.readMessages(sessionId);
    const recentMessages = allMessages.slice(-this.config.recentMessageCount);
    return { meta, summary, recentMessages };
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }
}

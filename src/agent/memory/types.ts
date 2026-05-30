// ============================================================
// 对话记忆子系统 — 数据模型
// ============================================================

/** 单条消息（写入 jsonl，每行一个 JSON） */
export interface MemoryMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: string; // ISO 8601
  tokens?: number;
}

/** 会话状态 */
export type SessionStatus = "active" | "interrupted" | "completed";

/** index.json 中的单条会话元信息 */
export interface SessionMeta {
  id: string;
  title: string;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  summaryFile: string;
  rawFile: string;
  pendingTodos: string[];
  lastDistilledIndex: number;
}

/** index.json 根结构 */
export interface SessionIndex {
  version: 1;
  sessions: SessionMeta[];
}

/** 恢复上下文 */
export interface ResumeContext {
  sessionId: string;
  title: string;
  summary: string;
  pendingTodos: string[];
  recentMessages: MemoryMessage[];
}

/** 蒸馏结果 */
export interface DistillResult {
  title: string;
  summaryMarkdown: string;
  pendingTodos: string[];
}

/** 配置项 */
export interface MemoryConfig {
  dir: string;
  distillMessageThreshold: number;
  distillTokenThreshold: number;
  recentMessageCount: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  dir: ".dun",
  distillMessageThreshold: 20,
  distillTokenThreshold: 8000,
  recentMessageCount: 6,
};

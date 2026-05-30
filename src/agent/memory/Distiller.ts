// ============================================================
// Distiller — LLM 驱动的会话蒸馏器（增量压缩）
// ============================================================
import { client } from "../../client";
import { SessionManager } from "./SessionManager";
import type { DistillResult, MemoryMessage, MemoryConfig } from "./types";
import { DEFAULT_MEMORY_CONFIG } from "./types";
import { sessionPrompt } from "../../prompts/index";
import { createLogger, Logger } from "../../log";

// ---- 蒸馏 Prompt 模板 ----
function buildDistillPrompt(
  existingSummary: string,
  newMessages: string,
): string {
  const filledPrompt = sessionPrompt.replace(
    "{此处插入本次会话的 messages}",
    newMessages,
  );

  let prompt = filledPrompt;

  if (existingSummary) {
    prompt += `\n\n---\n现有摘要（在其基础上增量合并）：\n${existingSummary}`;
  }

  prompt +=
    '\n\n---\n请在蒸馏结果最后追加一行 JSON（不要放在代码块内）：\n{"title": "会话标题", "pendingTodos": ["待办1", "待办2"]}';

  return prompt;
}

// ---- 蒸馏结果解析 ----
function parseDistillResponse(text: string): DistillResult | null {
  try {
    // 尝试严格格式：=== MARKDOWN === / === JSON ===
    const mdMatch = text.match(/=== MARKDOWN ===\n([\s\S]*?)(?==== JSON ===)/);
    const jsonMatch = text.match(/=== JSON ===\n?([\s\S]*)/);

    let md = "";
    let jsonStr = "";

    if (mdMatch && jsonMatch) {
      md = mdMatch[1].trim();
      jsonStr = jsonMatch[1].trim();
    } else {
      // 宽松匹配：找最后一个 JSON 对象，之前的是 markdown
      const lastBrace = text.lastIndexOf("{");
      if (lastBrace === -1) return null;

      // 从最后一个 { 开始找匹配的 }
      let depth = 0;
      let end = -1;
      for (let i = lastBrace; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }

      if (end === -1) return null;
      md = text.slice(0, lastBrace).trim();
      jsonStr = text.slice(lastBrace, end + 1);
    }

    // 清理 json 字符串
    const cleanJson = jsonStr
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleanJson);
    return {
      title: parsed.title || "Untitled",
      summaryMarkdown: md,
      pendingTodos: parsed.pendingTodos || [],
    };
  } catch {
    return null;
  }
}

// ---- 估算 token 数（粗略：英文 1token/4chars，中文 1token/1char） ----
function estimateTokens(messages: MemoryMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    for (const ch of msg.content) {
      chars += /[一-鿿]/.test(ch) ? 1 : 0.25;
    }
  }
  return Math.ceil(chars);
}

// ============================================================
// Distiller
// ============================================================
export class Distiller {
  private sessionManager: SessionManager;
  private config: MemoryConfig;
  private logger: Logger;
  private distilling = false; // 防止并发蒸馏

  constructor(sessionManager: SessionManager, config?: Partial<MemoryConfig>) {
    this.sessionManager = sessionManager;
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.logger = createLogger("DISTILL");
  }

  // ---- 判断是否需要蒸馏 ----
  shouldDistill(sessionId: string): boolean {
    const meta = this.sessionManager.getSessionMeta(sessionId);
    if (!meta) return false;

    const newMsgCount = meta.messageCount - meta.lastDistilledIndex;
    if (newMsgCount >= this.config.distillMessageThreshold) {
      this.logger.debug("蒸馏触发：消息数阈值", {
        newMsgCount,
        threshold: this.config.distillMessageThreshold,
      });
      return true;
    }

    // 估算 token
    const newMessages = this.sessionManager.getMessagesSince(
      sessionId,
      meta.lastDistilledIndex,
    );
    const tokens = estimateTokens(newMessages);
    if (tokens >= this.config.distillTokenThreshold) {
      this.logger.debug("蒸馏触发：token 阈值", {
        tokens,
        threshold: this.config.distillTokenThreshold,
      });
      return true;
    }

    return false;
  }

  // ---- 执行蒸馏（异步，不阻塞主循环） ----
  async distill(sessionId: string): Promise<DistillResult | null> {
    if (this.distilling) return null;
    this.distilling = true;

    try {
      const meta = this.sessionManager.getSessionMeta(sessionId);
      if (!meta) return null;

      const existingSummary = this.sessionManager.readSummary(sessionId);
      const newMessages = this.sessionManager.getMessagesSince(
        sessionId,
        meta.lastDistilledIndex,
      );
      if (newMessages.length === 0) return null;

      this.logger.info("开始蒸馏", {
        sessionId,
        newMsgCount: newMessages.length,
      });

      const newMsgText = this.formatMessages(newMessages);
      const prompt = buildDistillPrompt(existingSummary, newMsgText);

      const result = await this.callLLM(prompt);
      if (!result) {
        this.logger.warn("蒸馏解析失败，保留原始数据");
        return null;
      }

      // 合并摘要
      const mergedMd = existingSummary
        ? `${existingSummary}\n\n---\n\n${result.summaryMarkdown}`
        : result.summaryMarkdown;

      this.sessionManager.writeSummary(sessionId, mergedMd);
      this.sessionManager.updateDistillMeta(
        sessionId,
        meta.messageCount,
        result.title,
        result.pendingTodos,
      );

      this.logger.info("蒸馏完成", {
        sessionId,
        title: result.title,
        todos: result.pendingTodos.length,
      });
      return result;
    } catch (err: any) {
      this.logger.error("蒸馏失败", { error: err.message });
      return null;
    } finally {
      this.distilling = false;
    }
  }

  // ---- 调用 LLM 做蒸馏 ----
  private async callLLM(prompt: string): Promise<DistillResult | null> {
    try {
      const response = await client.chat.completions.create({
        model: process.env.model || "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content:
              "你是一个会话归档助手。严格按要求的格式输出，不要添加额外说明。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const text = response.choices[0]?.message?.content || "";
      return parseDistillResponse(text);
    } catch (err: any) {
      this.logger.error("蒸馏 LLM 调用失败", { error: err.message });
      return null;
    }
  }

  // ---- 格式化消息为文本 ----
  private formatMessages(messages: MemoryMessage[]): string {
    return messages
      .map((m) => `[${m.role}] ${m.content.slice(0, 500)}`)
      .join("\n\n");
  }
}

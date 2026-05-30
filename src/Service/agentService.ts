import { ToolRegistry } from "../tools/mainTools";
import { client } from "../client";
import { ToolHook } from "../agent/hooks";
import { createLogger, Logger } from "../log";
import {
  SessionManager,
  Distiller,
  type MemoryMessage,
  type ResumeContext,
} from "../agent/memory";
import { getProjectRoot } from "../utils/projectRoot";
import { systemPrompt as taskPrompt } from "../prompts/index";
import "dotenv/config";

export interface AgentCallbacks {
  onToken?: (token: string) => void;
  onToolStart?: (tool: string, args: Record<string, unknown>) => void;
  onToolEnd?: (tool: string, success: boolean, summary: string) => void;
}

export class AgentService {
  private toolRegistry: ToolRegistry;
  private messages: Array<{ role: string; content: string }> = [];
  private hooks: ToolHook[] = [];
  private logger: Logger;

  // ---- 记忆系统 ----
  private sessionManager: SessionManager;
  private distiller: Distiller;
  private sessionId: string | null = null;
  private initialized = false;

  constructor() {
    this.toolRegistry = new ToolRegistry();
    this.logger = createLogger("AGENT");

    // 记忆系统：使用项目根目录作为存储根
    const projectRoot = (() => {
      try {
        return getProjectRoot();
      } catch {
        return process.cwd();
      }
    })();
    this.sessionManager = new SessionManager(projectRoot);
    this.distiller = new Distiller(this.sessionManager);
  }

  registerHook(hook: ToolHook): void {
    this.hooks.push(hook);
  }

  // ---- 启动时检查是否有可恢复会话 ----
  findResumableSession(): ResumeContext | null {
    const meta = this.sessionManager.findResumable();
    if (!meta) return null;
    try {
      return this.sessionManager.resume(meta.id);
    } catch {
      return null;
    }
  }

  // ---- 确认恢复会话 ----
  confirmResume(sessionId: string, systemPrompt: string): void {
    const ctx = this.sessionManager.resume(sessionId);
    this.sessionId = sessionId;

    // 注入恢复上下文到消息列表
    const resumeSystem = `${systemPrompt}

## 历史会话摘要（从上一次中断恢复）
${ctx.summary || "(无)"}

## 未完成待办
${ctx.pendingTodos.length > 0 ? ctx.pendingTodos.map((t) => `- ${t}`).join("\n") : "(无)"}

## 最近对话
${ctx.recentMessages.map((m) => `[${m.role}] ${m.content.slice(0, 300)}`).join("\n")}`;

    this.messages = [{ role: "system", content: resumeSystem }];
    this.initialized = true;
    this.logger.info("会话恢复确认", { id: sessionId });
  }

  // ---- 初始化会话 ----
  init(): void {
    const toolDescription = this.toolRegistry.generateToolDescription();
    const systemPrompt = `你是编程助手。你可以使用以下工具完成任务。

${toolDescription}

## 工具调用规则
当需要使用工具时，必须严格按以下 JSON 格式返回，不要添加任何多余文字：
{"tool": "工具名", "args": {"参数名": "参数值"}}

如果需要使用工具，请只返回上述 JSON，不要包含其他内容。
当任务完成时，直接回复最终结果，不需要使用工具。
如果不需要使用工具就能回答问题，直接回复答案。

${taskPrompt}`;

    this.messages = [{ role: "system", content: systemPrompt }];

    // 创建新会话
    const meta = this.sessionManager.createSession();
    this.sessionId = meta.id;
    this.initialized = true;
    this.logger.info("会话初始化");
  }

  // ---- 一次性执行（向后兼容） ----
  async execute(userTask: string): Promise<string> {
    this.init();
    this.messages.push({ role: "user", content: userTask });
    this.logger.info("任务开始: " + userTask);
    return this.runAgentLoop();
  }

  // ---- 交互式对话 ----
  async chat(userMessage: string, callbacks?: AgentCallbacks): Promise<string> {
    this.messages.push({ role: "user", content: userMessage });
    this.logger.info("用户消息: " + userMessage);

    // 记录到记忆系统
    if (this.sessionId) {
      this.recordMessage("user", userMessage);
    }

    return this.runAgentLoop(callbacks);
  }

  // ---- 共享 Agent 循环 ----
  private currentPlan: Array<{ id: string; content: string; status: string }> =
    [];

  private async runAgentLoop(callbacks?: AgentCallbacks): Promise<string> {
    let consecutiveNoToolCalls = 0;
    const MAX_CONSECUTIVE = 3;
    const HARD_LIMIT = 200;

    for (let loop = 0; loop < HARD_LIMIT; loop++) {
      const response = await this.callModelStream(callbacks?.onToken);
      if (!response) {
        this.logger.warn("模型返回空响应");
        continue;
      }
      this.logger.debug("模型响应", { responseLength: response.length });

      const parsed = this.parseToolCall(response);
      if (parsed) {
        consecutiveNoToolCalls = 0;
        this.logger.debug("解析工具调用", {
          tool: parsed.tool,
          args: parsed.args,
        });
        this.messages.push({ role: "assistant", content: response });

        // 记录 assistant 消息到记忆
        if (this.sessionId) {
          this.recordMessage("assistant", response);
        }

        callbacks?.onToolStart?.(parsed.tool, parsed.args);

        const beforeText = this.applyBeforeHooksText(parsed.tool, parsed.args);
        const result = await this.toolRegistry.execute(
          parsed.tool,
          parsed.args,
        );

        // ---- TodoWrite：记录最新计划 ----
        if (parsed.tool === "TodoWrite" && result.success) {
          try {
            const todos = JSON.parse(parsed.args.todos as string);
            if (Array.isArray(todos)) this.currentPlan = todos;
          } catch {}
        }

        const toolSummary = result.success
          ? String(result.data).slice(0, 100)
          : result.error || "未知错误";
        callbacks?.onToolEnd?.(parsed.tool, result.success, toolSummary);

        const afterTextFinal = this.applyAfterHooksText(
          parsed.tool,
          parsed.args,
          result,
        );

        if (result.success) {
          this.logger.info("工具执行成功", {
            tool: parsed.tool,
            result: toolSummary,
          });
        } else {
          this.logger.warn("工具执行失败", {
            tool: parsed.tool,
            error: result.error,
          });
        }

        let userMessage = "";
        if (beforeText) userMessage += `【提示】${beforeText}\n`;
        userMessage += `工具执行结果：${result.success ? result.data : "错误：" + result.error}`;
        if (afterTextFinal) userMessage += `\n【提示】${afterTextFinal}`;
        userMessage += `\n请继续完成任务。如果任务已完成，直接回复结果即可。`;

        this.messages.push({ role: "user", content: userMessage });

        // 记录 tool 结果到记忆
        if (this.sessionId) {
          this.recordMessage("tool", userMessage.slice(0, 500));
        }

        // ---- 检查是否需要蒸馏 ----
        if (this.sessionId) {
          this.checkDistill();
        }

        continue;
      }

      // ---- 非工具调用 → 判断是否完成 ----
      consecutiveNoToolCalls++;

      const hasUnfinishedPlan = this.currentPlan.some(
        (item) => item.status === "pending" || item.status === "in_progress",
      );

      if (hasUnfinishedPlan) {
        this.logger.debug("计划未完成，强制提醒模型");
        this.messages.push({ role: "assistant", content: response });
        this.messages.push({
          role: "user",
          content: `⚠️ 你还有未完成的待办项：\n${this.currentPlan
            .filter((i) => i.status !== "completed")
            .map((i) => `  - [${i.id}] ${i.content}`)
            .join(
              "\n",
            )}\n\n请调用 TodoWrite 更新状态，然后继续执行未完成的任务。`,
        });
        continue;
      }

      if (consecutiveNoToolCalls < MAX_CONSECUTIVE) {
        if (this.looksLikeFailedToolCall(response)) {
          this.logger.debug("疑似格式错误的工具调用");
          this.messages.push({ role: "assistant", content: response });
          this.messages.push({
            role: "user",
            content:
              '你的回复格式不正确。如需使用工具，请严格按 JSON 格式返回：\n{"tool": "工具名", "args": {"参数名": "参数值"}}\n\n如果你已完成任务，直接回复结果即可。',
          });
          continue;
        }
      }

      // 记录最终 assistant 回复
      if (this.sessionId) {
        this.recordMessage("assistant", response);
      }

      this.logger.info("任务完成");
      return response;
    }

    this.logger.warn("达到硬上限，强制退出");
    return "任务未完成，已达到最大循环次数。";
  }

  // ---- 记忆记录 ----
  private recordMessage(
    role: "user" | "assistant" | "tool",
    content: string,
  ): void {
    if (!this.sessionId) return;
    const msg: MemoryMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    this.sessionManager.addMessage(this.sessionId, msg);
  }

  private distillingPromise: Promise<void> | null = null;

  // 上下文窗口：保留最近 N 条消息 + 摘要
  private static readonly MAX_CONTEXT_MESSAGES = 20;
  private static readonly HARD_CONTEXT_LIMIT = 50;

  private checkDistill(): void {
    if (!this.sessionId || this.distillingPromise) return;

    // 硬上限：超过 50 条强制裁剪，防止上下文爆炸
    if (this.messages.length > AgentService.HARD_CONTEXT_LIMIT) {
      this.logger.warn("上下文超限，强制裁剪", {
        before: this.messages.length,
      });
      this.trimContext();
      return;
    }

    if (this.distiller.shouldDistill(this.sessionId)) {
      this.distillingPromise = this.distiller
        .distill(this.sessionId)
        .then(() => {
          this.distillingPromise = null;
          // 蒸馏完成后裁剪上下文，用摘要替换旧消息
          this.trimContext();
        })
        .catch(() => {
          this.distillingPromise = null;
        });
    }
  }

  /** 用摘要替换旧消息，只保留 system + 摘要 + 最近消息 */
  private trimContext(): void {
    if (!this.sessionId) return;
    if (this.messages.length <= AgentService.MAX_CONTEXT_MESSAGES + 5) return;

    const summary = this.sessionManager.readSummary(this.sessionId);
    const sysMsg = this.messages[0]; // system prompt
    const recent = this.messages.slice(-AgentService.MAX_CONTEXT_MESSAGES);

    if (summary) {
      this.messages = [
        sysMsg,
        {
          role: "user",
          content: `【上下文摘要】以下是之前对话的摘要，请基于这些信息继续工作：\n\n${summary}\n\n---\n以下是最近的对话：`,
        },
        ...recent,
      ];
    } else {
      // 无摘要时简单裁剪
      this.messages = [sysMsg, ...recent];
    }

    this.logger.info("上下文裁剪完成", {
      before: this.messages.length + AgentService.MAX_CONTEXT_MESSAGES,
      after: this.messages.length,
      hasSummary: !!summary,
    });
  }

  // ---- 关闭会话（正常结束/异常退出） ----
  async shutdown(
    status: "completed" | "interrupted" = "interrupted",
  ): Promise<void> {
    if (!this.sessionId) return;
    try {
      // 最终蒸馏
      await this.distiller.distill(this.sessionId);
      // 标记结束
      this.sessionManager.endSession(this.sessionId, status);
      this.logger.info("会话已关闭", { id: this.sessionId, status });
    } catch (err: any) {
      this.logger.error("关闭会话失败", { error: err.message });
      // 至少尝试标记为 interrupted
      try {
        this.sessionManager.endSession(this.sessionId, "interrupted");
      } catch {}
    }
  }

  getActiveSessionId(): string | null {
    return this.sessionId;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ---- 记忆浏览 ----
  listRecentSessions(limit?: number) {
    return this.sessionManager.listRecentSessions(limit);
  }

  /** 将记忆上下文注入到 LLM 消息历史中 */
  injectContext(text: string): void {
    this.messages.push({
      role: "user",
      content: `【系统提示】以下是从历史会话中加载的记忆，请在后续对话中参考这些内容：\n\n${text}\n\n请确认你已理解这些上下文，并简要确认关键信息。`,
    });
  }

  loadSessionMemory(sessionId: string): string | null {
    const mem = this.sessionManager.getSessionMemory(sessionId);
    if (!mem) return null;
    return [
      `## 历史会话: ${mem.meta.title}`,
      `时间: ${mem.meta.startedAt.slice(0, 16)}`,
      `状态: ${mem.meta.status}`,
      ``,
      `### 摘要`,
      mem.summary || "(无摘要)",
      ``,
      `### 最近对话`,
      ...mem.recentMessages.map(
        (m) => `[${m.role}] ${m.content.slice(0, 300)}`,
      ),
    ].join("\n");
  }

  // ---- 工具匹配 ----
  private matchToolPattern(pattern: string, toolName: string): boolean {
    if (pattern === "*") return true;
    if (pattern.endsWith("*")) return toolName.startsWith(pattern.slice(0, -1));
    return pattern === toolName;
  }

  private applyBeforeHooksText(
    toolName: string,
    args: Record<string, unknown>,
  ): string {
    const snippets: string[] = [];
    for (const hook of this.hooks) {
      if (
        this.matchToolPattern(hook.toolPattern, toolName) &&
        hook.beforeExecute
      ) {
        const snippet = hook.beforeExecute(toolName, args);
        if (snippet) snippets.push(snippet);
      }
    }
    return snippets.join("\n");
  }

  private applyAfterHooksText(
    toolName: string,
    args: Record<string, unknown>,
    result: any,
  ): string {
    const snippets: string[] = [];
    for (const hook of this.hooks) {
      if (
        this.matchToolPattern(hook.toolPattern, toolName) &&
        hook.afterExecute
      ) {
        const snippet = hook.afterExecute(toolName, args, result);
        if (snippet) snippets.push(snippet);
      }
    }
    return snippets.join("\n");
  }

  // ---- 流式调用 ----
  private async callModelStream(
    onToken?: (token: string) => void,
  ): Promise<string> {
    try {
      const stream = await client.chat.completions.create({
        model: process.env.model || "deepseek-v4-flash",
        messages: this.messages as any,
        stream: true,
      });

      let fullContent = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          if (onToken) {
            onToken(delta.content);
          } else {
            process.stdout.write(delta.content);
          }
          fullContent += delta.content;
        }
      }
      if (!onToken) process.stdout.write("\n");
      return fullContent;
    } catch (error: any) {
      this.logger.error("流式调用失败", {
        error: error?.message || String(error),
      });
      console.error("调用 AI 出错：", error);
      return "";
    }
  }

  // ---- 解析工具调用 ----
  private parseToolCall(
    response: string,
  ): { tool: string; args: Record<string, unknown> } | null {
    const trimmed = response.trim();
    const direct = this.tryParseToolJson(trimmed);
    if (direct) return direct;
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const fromBlock = this.tryParseToolJson(codeBlockMatch[1].trim());
      if (fromBlock) return fromBlock;
    }
    const jsonMatch = this.extractJsonObject(trimmed);
    if (jsonMatch) {
      const fromExtract = this.tryParseToolJson(jsonMatch);
      if (fromExtract) return fromExtract;
    }
    return null;
  }

  private tryParseToolJson(
    jsonStr: string,
  ): { tool: string; args: Record<string, unknown> } | null {
    try {
      const json = JSON.parse(jsonStr);
      if (json.tool && json.args && typeof json.tool === "string") {
        return { tool: json.tool, args: json.args };
      }
    } catch {}
    return null;
  }

  private extractJsonObject(text: string): string | null {
    const firstBrace = text.indexOf("{");
    if (firstBrace === -1) return null;
    let depth = 0;
    let lastValidClose = -1;
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          lastValidClose = i;
          break;
        }
      }
    }
    if (lastValidClose > firstBrace) {
      return text.slice(firstBrace, lastValidClose + 1);
    }
    return null;
  }

  private looksLikeFailedToolCall(response: string): boolean {
    const trimmed = response.trim();
    if (/\btool\b/.test(trimmed) && /\bargs\b/.test(trimmed)) return true;
    if (/```json/.test(trimmed)) return true;
    if (trimmed.startsWith("{") && !trimmed.endsWith("}")) return true;
    return false;
  }
}

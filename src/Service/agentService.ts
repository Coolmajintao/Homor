import { ToolRegistry } from "../tools/mainTools";
import { client } from "../client";
import { ToolHook } from "../agent/hooks";
import { createLogger, Logger } from "../log";
import "dotenv/config";

export class AgentService {
  private toolRegistry: ToolRegistry;
  private messages: Array<{ role: string; content: string }> = [];
  private hooks: ToolHook[] = [];
  private logger: Logger;

  constructor() {
    this.toolRegistry = new ToolRegistry();
    this.logger = createLogger("AGENT");
  }

  registerHook(hook: ToolHook): void {
    this.hooks.push(hook);
  }

  async execute(userTask: string): Promise<string> {
    const toolDescription = this.toolRegistry.generateToolDescription();
    const projectRoot = process.cwd();
    const systemPrompt = `你是编程助手。你可以使用以下工具完成任务。
${toolDescription}

## 工具调用规则
当需要使用工具时，必须严格按以下 JSON 格式返回，不要添加任何多余文字：
{"tool": "工具名", "args": {"参数名": "参数值"}}

如果需要使用工具，请只返回上述 JSON，不要包含其他内容。
当任务完成时，直接回复最终结果，不需要使用工具。
如果不需要使用工具就能回答问题，直接回复答案。`;

    this.messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userTask },
    ];

    this.logger.info("任务开始: " + userTask);

    let maxLoops = 10;
    let consecutiveRetries = 0;
    while (maxLoops-- > 0) {
      const response = await this.callModelStream();
      if (!response) {
        this.logger.warn("模型返回空响应");
        continue;
      }
      this.logger.debug("模型响应", { responseLength: response.length });

      const parsed = this.parseToolCall(response);
      if (parsed) {
        this.logger.debug("解析工具调用", { tool: parsed.tool, args: parsed.args });
        // 记录 AI 的工具调用
        this.messages.push({ role: "assistant", content: response });

        // 执行前 Hook
        const beforeText = this.applyBeforeHooksText(parsed.tool, parsed.args);

        // 执行工具
        const result = await this.toolRegistry.execute(
          parsed.tool,
          parsed.args,
        );

        // 执行后 Hook
        const afterTextFinal = this.applyAfterHooksText(
          parsed.tool,
          parsed.args,
          result,
        );

        // 工具执行日志
        if (result.success) {
          this.logger.info("工具执行成功", {
            tool: parsed.tool,
            result:
              typeof result.data === "string"
                ? result.data.slice(0, 100)
                : result.data,
          });
        } else {
          this.logger.warn("工具执行失败", {
            tool: parsed.tool,
            error: result.error,
          });
        }

        // 组装返回给 AI 的消息
        let userMessage = "";
        if (beforeText) userMessage += `【提示】${beforeText}\n`;
        userMessage += `工具执行结果：${result.success ? result.data : "错误：" + result.error}`;
        if (afterTextFinal) userMessage += `\n【提示】${afterTextFinal}`;
        userMessage += `\n请继续完成任务。如果任务已完成，直接回复结果即可。`;

        this.messages.push({ role: "user", content: userMessage });
        continue;
      }

      // 不是工具调用 → 判断是格式错误还是最终回答
      this.logger.debug("非工具调用，判断为格式错误或最终答案");
      if (this.looksLikeFailedToolCall(response)) {
        consecutiveRetries++;
        if (consecutiveRetries >= 3) {
          return "模型多次返回错误格式，任务中断。请检查模型配置或简化任务描述。";
        }
        this.messages.push({ role: "assistant", content: response });
        this.messages.push({
          role: "user",
          content:
            '你的回复格式不正确。如需使用工具，请严格按 JSON 格式返回（不要添加任何其他文字）：\n{"tool": "工具名", "args": {"参数名": "参数值"}}\n\n如果你已完成任务，直接回复结果即可。',
        });
        continue;
      }

      consecutiveRetries = 0;

      // 不是工具调用也不是格式错误 → 最终回答
      this.logger.info("任务完成");
      return response;
    }

    this.logger.warn("循环次数耗尽，强制退出", { maxLoops: 10 });
    return "任务未完成，循环次数已用完。";
  }

  // 工具匹配
  private matchToolPattern(pattern: string, toolName: string): boolean {
    if (pattern === "*") return true;
    if (pattern.endsWith("*")) {
      return toolName.startsWith(pattern.slice(0, -1));
    }
    return pattern === toolName;
  }

  // Hook 文本
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

  // 流式调用
  private async callModelStream(): Promise<string> {
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
          process.stdout.write(delta.content);
          fullContent += delta.content;
        }
      }
      process.stdout.write("\n");
      return fullContent;
    } catch (error: any) {
      this.logger.error("流式调用失败", { error: error?.message || String(error) });
      console.error("调用 AI 出错：", error);
      return "";
    }
  }

  // 解析工具调用
  private parseToolCall(
    response: string,
  ): { tool: string; args: Record<string, unknown> } | null {
    const trimmed = response.trim();

    // 1. 直接解析 JSON
    const direct = this.tryParseToolJson(trimmed);
    if (direct) return direct;

    // 2. 从 markdown 代码块提取
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const fromBlock = this.tryParseToolJson(codeBlockMatch[1].trim());
      if (fromBlock) return fromBlock;
    }

    // 3. 从文本中提取最大 JSON 对象（处理模型在 JSON 前后加了文字的情况）
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

  // 检测是否为格式错误的工具调用尝试
  private looksLikeFailedToolCall(response: string): boolean {
    const trimmed = response.trim();
    // 包含 tool/args 关键字且看起来像 JSON
    if (/\btool\b/.test(trimmed) && /\bargs\b/.test(trimmed)) return true;
    // 包含 JSON 代码块但解析失败
    if (/```json/.test(trimmed)) return true;
    // 以 { 开头但不以 } 结尾（截断的 JSON）
    if (trimmed.startsWith("{") && !trimmed.endsWith("}")) return true;
    return false;
  }
}

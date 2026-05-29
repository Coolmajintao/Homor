import { ToolRegistry } from "../tools/mainTools";
import { client } from "../client";
import { ToolHook } from "../agent/hooks";
import "dotenv/config";

export class AgentService {
  private toolRegistry: ToolRegistry;
  private messages: Array<{ role: string; content: string }> = [];
  private hooks: ToolHook[] = [];

  constructor() {
    this.toolRegistry = new ToolRegistry();
  }

  registerHook(hook: ToolHook): void {
    this.hooks.push(hook);
  }

  async execute(userTask: string): Promise<string> {
    const toolDescription = this.toolRegistry.generateToolDescription();
    const systemPrompt = `你是编程助手。你可以使用以下工具完成任务。

${toolDescription}

## 工具调用规则
当需要使用工具时，必须严格按以下 JSON 格式返回，不要添加任何多余文字：
{
  "tool": "工具名",
  "args": {
    "参数名": "参数值"
  }
}
如果需要使用工具，请只返回上述 JSON，不要包含其他内容。
如果你能直接回答用户问题，就不要使用工具，直接返回最终答案。`;

    this.messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userTask },
    ];

    let maxLoops = 10;
    while (maxLoops-- > 0) {
      const response = await this.callModelStream();
      if (!response) continue;

      const parsed = this.parseToolCall(response);
      if (parsed) {
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

        // 组装返回给 AI 的消息
        let userMessage = "";
        if (beforeText) userMessage += `【提示】${beforeText}\n`;
        userMessage += `工具执行结果：${result.success ? result.data : "错误：" + result.error}`;
        if (afterTextFinal) userMessage += `\n【提示】${afterTextFinal}`;
        userMessage += `\n请继续完成任务，直到全部完成为止。完成后请回复“任务完成”。`;

        this.messages.push({ role: "user", content: userMessage });
        continue;
      }

      // ==============================================
      // 👇 修复：不是工具调用 → 判断是否结束，不结束就续跑
      // ==============================================
      const finishWords = [
        "完成",
        "已完成",
        "任务完成",
        "结束",
        "✅ 完成",
        "全部完成",
      ];
      const isTaskFinished = finishWords.some((w) => response.includes(w));

      if (isTaskFinished) {
        return response;
      }

      // 否则当作上下文继续
      this.messages.push({ role: "assistant", content: response });
    }

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
    } catch (error) {
      console.error("调用 AI 出错：", error);
      return "";
    }
  }

  // 解析工具调用
  private parseToolCall(
    response: string,
  ): { tool: string; args: Record<string, unknown> } | null {
    try {
      const json = JSON.parse(response.trim());
      if (json.tool && json.args) {
        return { tool: json.tool, args: json.args };
      }
    } catch {}

    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        const json = JSON.parse(codeBlockMatch[1].trim());
        if (json.tool && json.args) {
          return { tool: json.tool, args: json.args };
        }
      } catch {}
    }
    return null;
  }
}

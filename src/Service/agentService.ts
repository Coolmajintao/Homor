import { ToolRegistry } from "../tools/mainTools";
import { client } from "../client";
import { ToolHook } from "../agent/hooks"; // 引入 Hook 类型

export class AgentService {
  private toolRegistry: ToolRegistry;
  private messages: Array<{ role: string; content: string }> = [];
  private hooks: ToolHook[] = []; // ← 新增

  constructor() {
    this.toolRegistry = new ToolRegistry();
  }

  // ← 新增：注册 Hook
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
        // 记录工具调用
        this.messages.push({ role: "assistant", content: response });

        // ← 新增：执行前 Hook
        this.applyBeforeHooks(parsed.tool, parsed.args);

        // 执行工具
        const result = await this.toolRegistry.execute(
          parsed.tool,
          parsed.args,
        );

        // ← 新增：执行后 Hook
        this.applyAfterHooks(parsed.tool, parsed.args, result);

        // 追加工具执行结果
        this.messages.push({
          role: "user",
          content: `工具执行结果：${result.success ? result.data : "错误：" + result.error}`,
        });
        continue;
      }

      return response || "模型未返回有效内容。";
    }

    return "任务未完成，循环次数已用完。";
  }

  // ─── 新增：Hook 相关方法 ───

  // 匹配工具名（支持通配符 *）
  private matchToolPattern(pattern: string, toolName: string): boolean {
    if (pattern === "*") return true;
    if (pattern.endsWith("*")) {
      return toolName.startsWith(pattern.slice(0, -1));
    }
    return pattern === toolName;
  }

  // 执行前 Hook
  private applyBeforeHooks(
    toolName: string,
    args: Record<string, unknown>,
  ): void {
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
    if (snippets.length > 0) {
      this.messages.push({
        role: "system",
        content: `[动态提示] ${snippets.join("\n")}`,
      });
    }
  }

  // 执行后 Hook
  private applyAfterHooks(
    toolName: string,
    args: Record<string, unknown>,
    result: any,
  ): void {
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
    if (snippets.length > 0) {
      this.messages.push({
        role: "system",
        content: `[动态提示] ${snippets.join("\n")}`,
      });
    }
  }

  // ─── 原有方法（不变） ───

  private async callModelStream(): Promise<string> {
    try {
      const stream = await client.chat.completions.create({
        model: "deepseek-v4-flash",
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

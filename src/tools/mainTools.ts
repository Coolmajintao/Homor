// Tool/toolMain.ts
import { ITool, ToolResult } from "./toolInterface";
import {
  ReadFileTool,
  WriteFileTool,
  DeleteFileTool,
  MkdirTool,
} from "./index";

import { FindProjectRootTool } from "./project";
import { ExecTool } from "./bash"; // 或者 "./bash/index"
import { GlobTool, GrepTool } from "../search"; // 搜索工具

export class ToolRegistry {
  // ① 用一个 Map 存储所有工具，key 是工具名，value 是工具实例
  private tools: Map<string, ITool> = new Map();

  constructor() {
    // ② 在构造函数里注册所有工具
    this.register(new ReadFileTool());
    this.register(new WriteFileTool());
    this.register(new DeleteFileTool());
    this.register(new MkdirTool());
    this.register(new FindProjectRootTool());
    this.register(new ExecTool());
    this.register(new GlobTool());
    this.register(new GrepTool());
  }

  // ③ 注册方法：把工具放进 Map
  register(tool: ITool): void {
    this.tools.set(tool.name, tool);
  }

  // ④ 获取单个工具
  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  // ⑤ 生成给大模型看的工具列表（自然语言）
  generateToolDescription(): string {
    let description = "你可以使用以下工具：\n\n";

    for (const tool of this.tools.values()) {
      description += `- ${tool.name}: ${tool.description}\n`;

      // 遍历 parameters 数组，生成参数说明
      for (const param of tool.parameters) {
        const requiredText = param.required ? "必填" : "可选";
        description += `    - ${param.name} (${param.type}, ${requiredText}): ${param.description}\n`;
      }
      description += "\n";
    }

    return description;
  }

  // ⑥ 统一的执行入口：根据工具名和参数，调用对应工具的 execute
  async execute(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, data: "", error: `未知工具: ${name}` };
    }
    return await tool.execute(args);
  }
}

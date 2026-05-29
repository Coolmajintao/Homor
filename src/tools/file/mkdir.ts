import { ITool, ToolResult, ToolParameter } from "../toolInterface";

export class MkdirTool implements ITool {
  name = "mkdir";
  description = "创建目录，如果父目录不存在会自动创建";
  parameters: ToolParameter[] = [
    {
      name: "dirPath",
      type: "string",
      description: "要创建的目录路径（相对于项目根目录）",
      required: true,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = args.dirPath as string;
    if (!dirPath) {
      return { success: false, data: "", error: "缺少参数 dirPath" };
    }

    try {
      const fs = await import("fs/promises");
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true, data: `目录已创建: ${dirPath}` };
    } catch (err: any) {
      return {
        success: false,
        data: "",
        error: `创建目录失败: ${err.message}`,
      };
    }
  }
}

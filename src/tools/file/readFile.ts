import { ITool, ToolResult, ToolParameter } from "../toolInterface";

export class ReadFileTool implements ITool {
  name = "read_file";
  description = "读取指定路径的文件内容";
  parameters: ToolParameter[] = [
    {
      name: "filePath",
      type: "string",
      description: "要读取的文件路径（相对于项目根目录）",
      required: true,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.filePath as string;
    if (!filePath) {
      return { success: false, data: "", error: "缺少参数 filePath" };
    }

    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(filePath, "utf-8");
      return { success: true, data: content };
    } catch (err: any) {
      return {
        success: false,
        data: "",
        error: `读取文件失败: ${err.message}`,
      };
    }
  }
}

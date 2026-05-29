import { ITool, ToolResult, ToolParameter } from "../toolInterface";
import * as path from "path";

export class WriteFileTool implements ITool {
  name = "write_file";
  description = "写入内容到指定文件。如果文件所在的目录不存在，会自动创建。";
  parameters: ToolParameter[] = [
    {
      name: "filePath",
      type: "string",
      description: "要写入的文件路径（相对于项目根目录）",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "要写入的文件内容",
      required: true,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.filePath as string;
    const content = args.content as string;

    if (!filePath) {
      return { success: false, data: "", error: "缺少参数 filePath" };
    }
    if (content === undefined || content === null) {
      return { success: false, data: "", error: "缺少参数 content" };
    }

    try {
      const fs = await import("fs/promises");
      // 自动创建目录
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return { success: true, data: `文件已成功写入: ${filePath}` };
    } catch (err: any) {
      return {
        success: false,
        data: "",
        error: `写入文件失败: ${err.message}`,
      };
    }
  }
}

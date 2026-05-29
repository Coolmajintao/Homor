// src/tools/file/rmdir.ts
import { ITool, ToolResult, ToolParameter } from "../toolInterface";
import { rmdir } from "fs/promises";

export class RmdirTool implements ITool {
  name = "delete_dir";
  description =
    "删除一个空目录。如果目录非空，操作会失败。请先删除目录内的文件再使用此工具。";
  parameters: ToolParameter[] = [
    {
      name: "dirPath",
      type: "string",
      description: "要删除的目录路径",
      required: true,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = args.dirPath as string;
    try {
      await rmdir(dirPath);
      return { success: true, data: `目录已删除: ${dirPath}` };
    } catch (err: any) {
      return { success: false, data: "", error: `删除失败: ${err.message}` };
    }
  }
}

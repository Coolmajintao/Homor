import { ITool, ToolResult, ToolParameter } from "../toolInterface";

export class DeleteFileTool implements ITool {
  name = "delete_file";
  description = "删除指定路径的文件";
  parameters: ToolParameter[] = [
    {
      name: "filePath",
      type: "string",
      description: "要删除的文件路径（相对于项目根目录）",
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
      await fs.unlink(filePath);
      return { success: true, data: `文件已成功删除: ${filePath}` };
    } catch (err: any) {
      return {
        success: false,
        data: "",
        error: `删除文件失败: ${err.message}`,
      };
    }
  }
}

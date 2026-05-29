// Tool/project/findRoot.ts
import { ITool, ToolResult, ToolParameter } from "../toolInterface";
import { getProjectRoot } from "../../utils/projectRoot";

export class FindProjectRootTool implements ITool {
  name = "find_project_root";
  description =
    "查找当前项目的根目录。向上搜索 .git 目录，如果没有则返回当前工作目录。";
  parameters: ToolParameter[] = [
    {
      name: "startPath",
      type: "string",
      description: "开始搜索的起始目录（可选，默认当前目录）",
      required: false,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const startPath = (args.startPath as string) || process.cwd();
    const root = getProjectRoot(startPath);
    return {
      success: true,
      data: root,
    };
  }
}

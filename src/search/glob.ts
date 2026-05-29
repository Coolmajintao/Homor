// src/search/glob.ts
import { ITool, ToolResult, ToolParameter } from "../tools/toolInterface";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class GlobTool implements ITool {
  name = "glob";
  description =
    "根据文件名模式查找文件，支持通配符，例如 '**/*.ts' 或 'src/**/*.vue'。返回匹配的文件路径列表。";
  parameters: ToolParameter[] = [
    {
      name: "pattern",
      type: "string",
      description: "glob 模式，例如 'src/**/*.ts' 或 '*.json'",
      required: true,
    },
    {
      name: "path",
      type: "string",
      description: "搜索的起始目录，默认为项目根目录",
      required: false,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || ".";

    if (!pattern) {
      return { success: false, data: "", error: "缺少参数 pattern" };
    }

    try {
      // 使用 ripgrep 的 --files --glob 组合来列出匹配文件
      const { stdout } = await execFileAsync(
        "rg",
        ["--files", "--glob", pattern, "--sort", "modified", searchPath],
        { timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
      );

      const files = stdout.trim().split("\n").filter(Boolean);
      if (files.length === 0) {
        return { success: true, data: "未找到匹配文件" };
      }

      // 限制返回数量
      const sliced = files.slice(0, 200);
      const truncated =
        files.length > 200 ? `\n... (共 ${files.length} 个文件，已截断)` : "";
      return { success: true, data: sliced.join("\n") + truncated };
    } catch (error: any) {
      return {
        success: false,
        data: "",
        error: `文件名搜索失败: ${error.message}`,
      };
    }
  }
}

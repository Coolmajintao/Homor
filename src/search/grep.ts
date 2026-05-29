// src/search/glob.ts
import { ITool, ToolResult, ToolParameter } from "../tools/toolInterface";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class GrepTool implements ITool {
  name = "grep";
  description =
    "在文件内容中搜索指定模式（正则表达式），返回匹配的文件路径、行号和内容。速度极快，优先使用。";
  parameters: ToolParameter[] = [
    {
      name: "pattern",
      type: "string",
      description: "要搜索的正则表达式，例如 'function login'",
      required: true,
    },
    {
      name: "path",
      type: "string",
      description: "搜索的目录或文件路径（相对于项目根目录），默认为项目根目录",
      required: false,
    },
    {
      name: "include",
      type: "string",
      description:
        "限制搜索的文件类型，用 glob 模式，例如 '*.ts' 或 '*.{ts,tsx}'",
      required: false,
    },
    {
      name: "caseSensitive",
      type: "boolean",
      description: "是否区分大小写，默认为 false（不区分）",
      required: false,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || ".";
    const include = args.include as string;
    const caseSensitive = args.caseSensitive as boolean;

    if (!pattern) {
      return { success: false, data: "", error: "缺少参数 pattern" };
    }

    const rgArgs = ["--line-number", "--no-heading", "--color=never"];
    if (!caseSensitive) rgArgs.push("--ignore-case");
    if (include) {
      rgArgs.push("--glob", include);
    }

    rgArgs.push("--", pattern, searchPath);

    try {
      const { stdout } = await execFileAsync("rg", rgArgs, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = stdout.trim();
      if (!output) {
        return { success: true, data: "未找到匹配项" };
      }

      // 限制返回行数，防止上下文溢出
      const lines = output.split("\n").slice(0, 100);
      const truncated =
        lines.length < output.split("\n").length ? "\n... (结果已截断)" : "";
      return { success: true, data: lines.join("\n") + truncated };
    } catch (error: any) {
      // rg 找不到匹配时退出码为 1，不是错误
      if (error.code === 1) {
        return { success: true, data: "未找到匹配项" };
      }
      // 如果 rg 不可用，回退到纯 Node 实现
      return this.fallbackGrep(pattern, searchPath, include, caseSensitive);
    }
  }

  // 简单的回退方案：当系统没有 ripgrep 时，使用 fs 遍历
  private async fallbackGrep(
    pattern: string,
    searchPath: string,
    include?: string,
    caseSensitive?: boolean,
  ): Promise<ToolResult> {
    // 此处可先暂时返回错误，提示用户安装 ripgrep，或后续实现原生搜索
    return {
      success: false,
      data: "",
      error: "ripgrep 未安装，且原生搜索暂未实现。请安装 ripgrep 后重试。",
    };
  }
}

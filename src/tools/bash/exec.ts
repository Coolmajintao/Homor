// Tool/bash/exec.ts
import { ITool, ToolResult, ToolParameter } from "../toolInterface";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class ExecTool implements ITool {
  name = "execute_command";
  description =
    "在项目根目录下执行 Shell 命令，用于安装依赖、运行脚本、调试等。返回 stdout 和 stderr。";
  parameters: ToolParameter[] = [
    {
      name: "command",
      type: "string",
      description: "要执行的 Shell 命令（例如：npm install lodash）",
      required: true,
    },
    {
      name: "workingDir",
      type: "string",
      description: "工作目录（相对于项目根目录），默认为项目根目录",
      required: false,
    },
    {
      name: "timeout",
      type: "number",
      description: "超时秒数，默认 30 秒",
      required: false,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    const workingDir = (args.workingDir as string) || ".";
    const timeout = (args.timeout as number) || 30;

    if (!command) {
      return { success: false, data: "", error: "缺少参数 command" };
    }

    // 安全限制：禁止包含危险命令的关键词（可根据需要扩展）
    const blocked = ["rm -rf /", "sudo", "shutdown", "reboot", ":(){ :|:& };:"];
    if (blocked.some((b) => command.includes(b))) {
      return { success: false, data: "", error: "命令被安全策略拦截" };
    }

    try {
      // 使用 exec 执行，限制超时
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10MB 输出缓冲区
      });

      const result = [stdout, stderr].filter(Boolean).join("\n");
      return {
        success: true,
        data: result || "命令执行成功（无输出）",
      };
    } catch (error: any) {
      // 命令执行失败（非零退出码），仍然返回 stdout/stderr 让模型分析
      const stdout = error.stdout || "";
      const stderr = error.stderr || "";
      const message = error.message || "";
      return {
        success: false,
        data: [stdout, stderr, message].filter(Boolean).join("\n"),
        error: `命令执行失败，退出码: ${error.code || "未知"}`,
      };
    }
  }
}

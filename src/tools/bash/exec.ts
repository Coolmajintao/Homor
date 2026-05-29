// Tool/bash/exec.ts
import { ITool, ToolResult, ToolParameter } from "../toolInterface";
import { exec } from "child_process";
import { promisify } from "util";
import readline from "readline"; // 👈 加在这里

const execAsync = promisify(exec);

// 确认用户输入函数（放在类外面）
async function confirmWithUser(prompt: string): Promise<boolean> {
  const rl = readline.createInterface(process.stdin, process.stdout);
  const answer = await new Promise<string>((resolve) => {
    rl.question(prompt, resolve);
  });
  rl.close();
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

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
    // 1. 校验参数
    const command = args.command as string;
    if (!command) {
      return { success: false, data: "", error: "缺少参数 command" };
    }

    const workingDir = (args.workingDir as string) || ".";
    const timeout = (args.timeout as number) || 30;
    const commandStr = command.toLowerCase().trim();
    const projectRoot = process.cwd().toLowerCase();

    // 2. 危险命令黑名单
    const DANGEROUS_COMMANDS = [
      "rm -rf /",
      "rm -rf --no-preserve-root",
      "sudo rm",
      "mkfs",
      "dd if=",
      ":(){ :|:& };:",
      "chmod -R 777 /",
      "Remove-Item -Recurse",
      "del /F /S",
      "rd /S /Q",
      "format",
      "diskpart",
      "> /dev/sda",
      "shutdown",
      "reboot",
      "halt",
    ];

    if (
      DANGEROUS_COMMANDS.some((dc) => commandStr.includes(dc.toLowerCase()))
    ) {
      return {
        success: false,
        data: "",
        error: `安全拦截：命令 "${command}" 包含高危操作，已被禁止执行。`,
      };
    }

    // 3. 根目录删除保护
    const isDeleteCmd =
      commandStr.includes("rm") ||
      commandStr.includes("remove-item") ||
      commandStr.includes("del");

    const isRootDelete =
      commandStr.includes(projectRoot) ||
      commandStr.includes(" .") ||
      commandStr.includes(" *");

    if (isDeleteCmd && isRootDelete) {
      return {
        success: false,
        data: "",
        error:
          "安全拦截：禁止对项目根目录执行批量删除操作。请指定具体文件或子目录。",
      };
    }

    // ==============================================
    // 【你写的确认功能 → 我帮你放这里了！】
    // ==============================================
    const needsConfirmation = isDeleteCmd;

    if (needsConfirmation) {
      const confirmed = await confirmWithUser(
        `⚠️  即将执行命令: "${command}"\n此命令可能删除文件，确认继续？(y/n): `,
      );
      if (!confirmed) {
        return { success: false, data: "", error: "用户取消了操作。" };
      }
    }

    // 4. 执行命令
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const result = [stdout, stderr].filter(Boolean).join("\n");
      return {
        success: true,
        data: result || "命令执行成功（无输出）",
      };
    } catch (error: any) {
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

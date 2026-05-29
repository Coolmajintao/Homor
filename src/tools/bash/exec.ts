import { ITool, ToolResult, ToolParameter } from "../toolInterface";
import { exec } from "child_process";
import { promisify } from "util";
import {
  PermissionManager,
  RiskLevel,
} from "./permissionManager";
import { createLogger, Logger } from "../../log";

const execAsync = promisify(exec);

let permissionManager: PermissionManager | null = null;

function getPermissionManager(): PermissionManager {
  if (!permissionManager) {
    permissionManager = new PermissionManager(process.cwd());
  }
  return permissionManager;
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

  private logger: Logger = createLogger("EXEC");

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    if (!command) {
      return { success: false, data: "", error: "缺少参数 command" };
    }

    const workingDir = (args.workingDir as string) || ".";
    const timeout = (args.timeout as number) || 30;
    const pm = getPermissionManager();

    // 1. 智能评估命令风险
    const assessment = pm.assessCommand(command);

    // 2. 根据风险级别处理
    if (assessment.needsApproval) {
      // 高危命令直接拒绝（除非在永久白名单中）
      if (assessment.risk === RiskLevel.BLOCKED) {
        this.logger.warn("安全拦截：高危命令", {
          command,
          reason: "BLOCKED",
        });
        return {
          success: false,
          data: "",
          error: assessment.blockReason ||
            `安全拦截：命令 "${command}" 被识别为高危操作。如需执行，请将其添加到 reports.json 的 permissions.allow 列表中。`,
        };
      }

      // MODIFY / DESTRUCTIVE：需要用户确认
      this.logger.info("等待用户确认", {
        command,
        riskLevel: assessment.risk,
      });
      const result = await pm.confirmCommand(command, assessment.risk);

      this.logger.info("用户确认结果", {
        command,
        confirmed: result.allowed,
      });
      if (!result.allowed) {
        return { success: false, data: "", error: "用户取消了操作。" };
      }

      // 处理用户选择（记住本次会话 / 永久保存）
      pm.handleConfirmResult(assessment.parsed, result);
    }

    // 3. 执行命令
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = [stdout, stderr].filter(Boolean).join("\n");
      this.logger.debug("命令执行成功", {
        command,
        outputLength: output.length,
      });
      return {
        success: true,
        data: output || "命令执行成功（无输出）",
      };
    } catch (error: any) {
      const stdout = error.stdout || "";
      const stderr = error.stderr || "";
      const message = error.message || "";
      this.logger.error("命令执行失败", {
        command,
        exitCode: error.code || "未知",
        stderr: stderr.slice(0, 200),
      });
      return {
        success: false,
        data: [stdout, stderr, message].filter(Boolean).join("\n"),
        error: `命令执行失败，退出码: ${error.code || "未知"}`,
      };
    }
  }
}

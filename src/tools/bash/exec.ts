import { ITool, ToolResult, ToolParameter } from "../toolInterface";
import { spawn } from "child_process";
import {
  PermissionManager,
  RiskLevel,
} from "./permissionManager";
import { requestConfirm } from "./confirmStore";
import { createLogger, Logger } from "../../log";

const MAX_BUFFER = 10 * 1024 * 1024; // 10MB

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
    "在项目根目录下执行 Shell 命令。注意：务必使用非交互模式参数（如 --yes、-y、--force），因为命令无法接受用户输入。例如 npx create-vite@latest . --template vue-ts --yes";
  parameters: ToolParameter[] = [
    {
      name: "command",
      type: "string",
      description: "要执行的 Shell 命令，务必使用非交互式参数（如 --yes、-y、--force）",
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

    // 2. 分级处理
    if (assessment.risk === RiskLevel.BLOCKED) {
      this.logger.warn("安全拦截：高危命令", { command, reason: "BLOCKED" });
      return {
        success: false,
        data: "",
        error: assessment.blockReason ||
          `安全拦截：命令 "${command}" 被识别为高危操作。`,
      };
    }

    // DESTRUCTIVE：通过 UI 可见弹窗确认（不阻塞）
    if (assessment.risk === RiskLevel.DESTRUCTIVE) {
      this.logger.info("危险命令等待UI确认", { command });
      const allowed = await requestConfirm(command, "危险操作");
      if (!allowed) {
        return { success: false, data: "", error: "用户取消了操作。" };
      }
    }

    // 3. 执行命令（使用 spawn，stdin 关闭防止交互式命令挂起）
    try {
      const output = await this.spawnAsync(command, workingDir, timeout);
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

      // 检测是否因为交互式提示而失败
      const combined = [stdout, stderr, message].filter(Boolean).join("\n");
      const maybeInteractive =
        /\([yYnN]\/[a-zA-Z]\)|\[y\/N\]|\[Y\/n\]|Do you want to proceed|\(yes\)|\(no\)/i;

      this.logger.error("命令执行失败", {
        command,
        exitCode: error.code || "未知",
        stderr: stderr.slice(0, 200),
      });

      let hint = "";
      if (maybeInteractive.test(combined)) {
        hint =
          "\n\n⚠ 该命令可能需要交互确认。请重新执行并添加非交互参数，如 --yes、-y 或 --force。";
      }

      return {
        success: false,
        data: combined + hint,
        error: `命令执行失败，退出码: ${error.code || "未知"}`,
      };
    }
  }

  // ---- spawn 封装：stdin 关闭，防止阻塞 ----
  private spawnAsync(
    command: string,
    cwd: string,
    timeoutSec: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"], // stdin → ignore，防止交互式挂起
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        const err = new Error(`命令超时（${timeoutSec}s）`) as any;
        err.code = "TIMEOUT";
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }, timeoutSec * 1000);

      child.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length < MAX_BUFFER) stdout += chunk;
      });

      child.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length < MAX_BUFFER) stderr += chunk;
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve([stdout, stderr].filter(Boolean).join("\n"));
        } else {
          const err = new Error(`命令退出码: ${code}`) as any;
          err.code = code;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        }
      });
    });
  }
}

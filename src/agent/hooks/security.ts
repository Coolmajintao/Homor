import { ToolHook } from "./types";
import { parseCommand, classifyCommand, RiskLevel } from "../../tools/bash/permissionManager";

export const securityHook: ToolHook = {
  toolPattern: "execute_command",
  beforeExecute: (_toolName, args) => {
    const command = (args.command as string) || "";
    if (!command.trim()) return null;

    const parsed = parseCommand(command);
    const risk = classifyCommand(parsed);

    switch (risk) {
      case RiskLevel.BLOCKED:
        return `【高危命令】你尝试执行的 "${command}" 被归类为高危操作，将被系统拒绝。请寻找替代方案（如使用项目内置工具替代 shell 命令），或建议用户手动执行。`;
      case RiskLevel.DESTRUCTIVE:
        return `【需确认】命令 "${command}" 是危险操作（如删除文件/修改权限），执行前会要求用户确认。请确保这是完成任务所必需的，并告知用户该操作的影响。`;
      case RiskLevel.MODIFY:
        return null; // MODIFY 级别很常见，不需要特别警告
      default:
        return null;
    }
  },

  afterExecute: (_toolName, args, result) => {
    // 当命令因安全原因被拒绝时，引导 AI 换方案
    if (result && !result.success && result.error) {
      const error = result.error as string;
      if (error.includes("安全拦截") || error.includes("高危操作") || error.includes("用户取消了操作")) {
        return `命令被拦截或取消。请不要重试相同命令，考虑以下替代方案：
1. 使用项目内置的文件工具（read_file / write_file / delete_file）替代 shell 命令
2. 如果是安装依赖，询问用户是否需要手动安装
3. 如果是删除操作，使用 delete_file 工具逐文件删除更安全`;
      }
    }
    return null;
  },
};

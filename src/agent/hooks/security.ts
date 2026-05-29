import { ToolHook } from "./types";

export const securityHook: ToolHook = {
  toolPattern: "execute_command",
  beforeExecute: (toolName, args) => {
    const command = (args.command as string) || "";
    const dangerous = [
      "rm -rf /",
      "sudo rm",
      "shutdown",
      "reboot",
      "mkfs",
      "dd if=",
      ":(){ :|:& };:",
      "> /dev/sda",
    ];
    for (const d of dangerous) {
      if (command.includes(d)) {
        return `【安全警告】你正在尝试执行可能危险的命令："${command}"。请仔细确认这是用户要求的操作，并考虑是否有更安全的替代方案。如果必须执行，请说明原因。`;
      }
    }
    return null;
  },
};

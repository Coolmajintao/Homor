import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { UIMessage, AgentStatus } from "./types.js";

// ============================================================
// Header
// ============================================================
export const Header: React.FC = () => (
  <Box flexDirection="column" marginBottom={1}>
    <Box>
      <Text color="magentaBright" bold>
        ╭─ 🤖 Homor
      </Text>
      <Text dimColor> —— 智能编程助手</Text>
    </Box>
    <Text color="magentaBright" dimColor>
      │
    </Text>
  </Box>
);

// ============================================================
// Message
// ============================================================
const Message: React.FC<{ msg: UIMessage }> = ({ msg }) => {
  switch (msg.type) {
    case "user":
      return (
        <Box marginY={1} paddingLeft={2}>
          <Text>
            <Text color="cyanBright" bold>
              ▸{" "}
            </Text>
            <Text bold>{msg.content}</Text>
          </Text>
        </Box>
      );

    case "agent": {
      const isEmpty = !msg.content;
      return (
        <Box marginY={1} paddingLeft={2} flexDirection="column">
          <Text>
            <Text color="green">●</Text>
            {isEmpty ? (
              <Text color="yellow" dimColor>
                {" "}思考中...
              </Text>
            ) : (
              <Text> {msg.content}</Text>
            )}
          </Text>
        </Box>
      );
    }

    case "tool": {
      const icon =
        msg.toolStatus === "running"
          ? "⟳"
          : msg.toolStatus === "success"
            ? "✓"
            : "✗";
      const color =
        msg.toolStatus === "running"
          ? "yellow"
          : msg.toolStatus === "success"
            ? "green"
            : "red";
      return (
        <Box paddingLeft={4}>
          <Text color={color}>{icon}</Text>
          <Text dimColor> {msg.content}</Text>
        </Box>
      );
    }

    case "system":
      return (
        <Box paddingLeft={2}>
          <Text dimColor>  {msg.content}</Text>
        </Box>
      );

    default:
      return null;
  }
};

// ============================================================
// MessageList
// ============================================================
export const MessageList: React.FC<{
  messages: UIMessage[];
  maxHeight: number;
}> = ({ messages, maxHeight }) => {
  const visible = messages.slice(-maxHeight);

  if (messages.length === 0) {
    return (
      <Box flexDirection="column" paddingLeft={2} marginY={1}>
        <Text color="magentaBright" dimColor>
          ╰─ 欢迎使用 Homor
        </Text>
        <Text dimColor>   输入你的任务，Agent 将自动调用工具完成。</Text>
        <Text dimColor>   内置命令: /help · /clear · /exit</Text>
        <Box marginTop={1}>
          <Text color="magentaBright" dimColor>
            ─────────────────────────────────────
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {visible.map((msg) => (
        <Message key={msg.id} msg={msg} />
      ))}
    </Box>
  );
};

// ============================================================
// InputLine
// ============================================================
export const InputLine: React.FC<{
  onSubmit: (text: string) => void;
  disabled: boolean;
}> = ({ onSubmit, disabled }) => {
  const [value, setValue] = useState("");

  useInput(
    (input, key) => {
      if (disabled) return;

      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          onSubmit(trimmed);
          setValue("");
        }
        return;
      }

      if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta && !key.tab && !key.escape) {
        setValue((prev) => prev + input);
      }
    },
    { isActive: true },
  );

  return (
    <Box marginTop={1} paddingLeft={2}>
      {disabled ? (
        <Text dimColor>⏳ </Text>
      ) : (
        <Text color="cyanBright" bold>
          ▸{" "}
        </Text>
      )}
      <Text>{value}</Text>
      {!disabled && <Text color="cyanBright">█</Text>}
    </Box>
  );
};

// ============================================================
// StatusBar
// ============================================================
export const StatusBar: React.FC<{
  status: AgentStatus;
  messageCount: number;
}> = ({ status, messageCount }) => {
  const dot =
    status === "idle" ? "●" : status === "thinking" ? "◉" : "◉";
  const label =
    status === "idle"
      ? "就绪"
      : status === "thinking"
        ? "思考中"
        : "执行中";
  const dotColor =
    status === "idle" ? "green" : status === "thinking" ? "yellow" : "blue";

  return (
    <Box marginTop={1}>
      <Text dimColor>──────────────────────────────</Text>
      <Text>
        {" "}
        <Text color={dotColor}>{dot} {label}</Text>
        {" · "}
        <Text dimColor>{messageCount} 条消息</Text>
        {" · "}
        <Text dimColor>/exit 退出</Text>
      </Text>
    </Box>
  );
};

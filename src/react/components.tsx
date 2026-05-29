import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { UIMessage, AgentStatus } from "./types.js";

const HOMOR_LOGO = `
  ██╗  ██╗ ██████╗ ███╗   ███╗ ██████╗ ██████╗ 
  ██║  ██║██╔═══██╗████╗ ████║██╔═══██╗██╔══██╗
  ███████║██║   ██║██╔████╔██║██║   ██║██████╔╝
  ██╔══██║██║   ██║██║╚██╔╝██║██║   ██║██╔══██╗
  ██║  ██║╚██████╔╝██║ ╚═╝ ██║╚██████╔╝██║  ██║
  ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝
`;

// ============================================================
// Header with border
// ============================================================
export const Header: React.FC = () => (
  <Box flexDirection="column">
    <Box>
      <Text color="orange" bold>╭─</Text>
      <Text color="orange" bold> Homor </Text>
      <Text color="orange" dimColor>v1.0.0</Text>
      <Text color="orange" bold> ─</Text>
    </Box>
  </Box>
);

// ============================================================
// Welcome Screen
// ============================================================
export const WelcomeScreen: React.FC = () => {
  const leftContent = (
    <Box flexDirection="column" flexGrow={1} paddingX={2}>
      <Box justifyContent="center" marginY={1}>
        <Text color="orange">Welcome back!</Text>
      </Box>
      <Box justifyContent="center" marginY={1}>
        <Text color="orange">{HOMOR_LOGO}</Text>
      </Box>
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>
          deepseek-v4-pro[1m] with medi... · API Usage Billing
        </Text>
      </Box>
      <Box justifyContent="center">
        <Text dimColor>{process.cwd()}</Text>
      </Box>
    </Box>
  );

  const rightContent = (
    <Box flexDirection="column" flexGrow={1} paddingX={2} borderStyle="single" borderLeft>
      <Box marginBottom={1}>
        <Text color="orange" bold>Tips for getting started</Text>
      </Box>
      <Text dimColor>Run /init to create a HOMOR.md file with instructions for Homor...</Text>
      <Box marginTop={1}>
        <Text color="orange" bold>What's new</Text>
      </Box>
      <Text dimColor>Added `homor agents --json` to list live Homor sessions as JSON</Text>
      <Text dimColor>Added `agent_id` and `parent_agent_id` attributes to `homor_c...</Text>
      <Text dimColor>Status line JSON input now includes GitHub repo and PR informa...</Text>
      <Text dimColor>/release-notes for more</Text>
    </Box>
  );

  return (
    <Box flexDirection="row" borderStyle="single" borderColor="orange">
      {leftContent}
      {rightContent}
    </Box>
  );
};

// ============================================================
// Update Notification
// ============================================================
export const UpdateNotification: React.FC = () => {
  const model = process.env.model || "deepseek-v4-flash";
  const cwd = process.cwd();
  return (
    <Box marginTop={1} paddingX={1}>
      <Text color="orange" bold>Model: {model}</Text>
      <Text dimColor> · </Text>
      <Text dimColor>{cwd}</Text>
    </Box>
  );
};

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
    return null;
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
    <Box paddingX={1} flexDirection="column">
      <Box marginTop={1}>
        <Text dimColor>─────────────────────────────────────────────────────</Text>
      </Box>
      <Box marginTop={0}>
        {disabled ? (
          <Text dimColor>⏳ 处理中，请稍候...</Text>
        ) : (
          <>
            <Text color="orange" bold>{">"}</Text>
            <Text> {value}</Text>
            <Text color="orange">█</Text>
          </>
        )}
      </Box>
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
  const dot = status === "idle" ? "●" : "◉";
  const label =
    status === "idle"
      ? "就绪"
      : status === "thinking"
        ? "思考中"
        : "执行中";
  const dotColor =
    status === "idle"
      ? "green"
      : status === "thinking"
        ? "yellow"
        : "blue";

  return (
    <Box marginTop={1} paddingX={2}>
      <Text dimColor>────────────────────────────</Text>
      <Text>
        {" "}
        <Text color={dotColor}>
          {dot} {label}
        </Text>
        {" · "}
        <Text dimColor>{messageCount} 条消息</Text>
        {" · "}
        <Text dimColor>/exit 退出</Text>
      </Text>
    </Box>
  );
};

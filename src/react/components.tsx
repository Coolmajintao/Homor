import { Box, Text, useInput } from "ink";
import { useState, useEffect, memo } from "react";
import type { UIMessage, AgentStatus } from "./types.js";
import { getTodos, subscribeTodos, type TodoItem } from "./todoStore.js";

const HOMOR_LOGO = `
  ██╗  ██╗ ██████╗ ███╗   ███╗ ██████╗ ██████╗
  ██║  ██║██╔═══██╗████╗ ████║██╔═══██╗██╔══██╗
  ███████║██║   ██║██╔████╔██║██║   ██║██████╔╝
  ██╔══██║██║   ██║██║╚██╔╝██║██║   ██║██╔══██╗
  ██║  ██║╚██████╔╝██║ ╚═╝ ██║╚██████╔╝██║  ██║
  ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝
`;

// ============================================================
// Header
// ============================================================
export const Header = memo(() => (
  <Box>
    <Text color="magentaBright" bold>╭─</Text>
    <Text color="cyanBright" bold> Homor </Text>
    <Text color="magentaBright" dimColor>v1.0.0</Text>
    <Text color="cyanBright" bold> ─────────────────────╮</Text>
  </Box>
));

// ============================================================
// Welcome Screen
// ============================================================
export const WelcomeScreen = memo(({ projectRoot }: { projectRoot: string }) => {
  const model = process.env.model || "deepseek-v4-flash";
  return (
    <Box flexDirection="row" borderStyle="round" borderColor="cyan" paddingX={2}>
      <Box flexDirection="column" flexGrow={1} paddingRight={2}>
        <Box justifyContent="center" marginY={1}>
          <Text color="cyanBright">{HOMOR_LOGO}</Text>
        </Box>
        <Box justifyContent="center">
          <Text dimColor>Model: </Text>
          <Text color="yellow">{model}</Text>
        </Box>
        <Box justifyContent="center">
          <Text dimColor>{projectRoot}</Text>
        </Box>
      </Box>
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderLeft paddingLeft={2}>
        <Box marginBottom={1}>
          <Text color="cyanBright" bold>快捷命令</Text>
        </Box>
        <Text dimColor>/help    显示帮助</Text>
        <Text dimColor>/clear   清屏</Text>
        <Text dimColor>/exit    退出程序</Text>
        <Box marginTop={1}>
          <Text color="cyanBright" bold>提示</Text>
        </Box>
        <Text dimColor>直接输入任务描述，Agent 自动调用工具完成。</Text>
        <Text dimColor>支持多轮对话，可连续追加需求。</Text>
      </Box>
    </Box>
  );
});

// ============================================================
// UpdateNotification
// ============================================================
export const UpdateNotification: React.FC = () => {
  const model = process.env.model || "deepseek-v4-flash";
  const cwd = process.cwd();
  return (
    <Box paddingX={1} flexDirection="row">
      <Text color="cyanBright">◆ </Text>
      <Text color="yellow">{model}</Text>
      <Text dimColor> · </Text>
      <Text dimColor>{cwd}</Text>
    </Box>
  );
};

// ============================================================
// Agent 回复格式化：解析代码块、行内代码、加粗
// ============================================================
interface TextSegment {
  type: "text" | "codeBlock" | "inlineCode" | "bold";
  content: string;
}

function parseAgentContent(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let remaining = text;
  let codeBlockOpen = false;

  while (remaining.length > 0) {
    if (!codeBlockOpen) {
      const fenceIdx = remaining.indexOf("```");
      if (fenceIdx !== -1) {
        // 代码块之前的普通文本
        if (fenceIdx > 0) {
          segments.push(...parseInlineFormats(remaining.slice(0, fenceIdx)));
        }
        // 查找结束 fence
        const afterFence = remaining.slice(fenceIdx + 3);
        const langEnd = afterFence.indexOf("\n");
        const contentStart = langEnd === -1 ? 0 : langEnd + 1;
        const endFenceIdx = afterFence.indexOf("\n```", contentStart);
        if (endFenceIdx !== -1) {
          const codeContent = afterFence.slice(contentStart, endFenceIdx);
          if (codeContent.trim()) {
            segments.push({ type: "codeBlock", content: codeContent.trimEnd() });
          }
          remaining = afterFence.slice(endFenceIdx + 4);
        } else {
          // 无闭合 fence，整段作为代码
          codeBlockOpen = true;
          segments.push({ type: "codeBlock", content: afterFence.slice(contentStart) });
          remaining = "";
        }
      } else {
        segments.push(...parseInlineFormats(remaining));
        remaining = "";
      }
    } else {
      segments.push({ type: "codeBlock", content: remaining });
      remaining = "";
    }
  }

  return segments;
}

function parseInlineFormats(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const tickIdx = remaining.indexOf("`");
    const boldIdx = remaining.indexOf("**");

    // 找最先出现的
    const nextTick = tickIdx === -1 ? Infinity : tickIdx;
    const nextBold = boldIdx === -1 ? Infinity : boldIdx;

    if (nextTick === Infinity && nextBold === Infinity) {
      if (remaining) segments.push({ type: "text", content: remaining });
      break;
    }

    if (nextTick < nextBold) {
      // 行内代码
      if (tickIdx > 0) {
        segments.push({ type: "text", content: remaining.slice(0, tickIdx) });
      }
      const afterTick = remaining.slice(tickIdx + 1);
      const closeTick = afterTick.indexOf("`");
      if (closeTick !== -1) {
        const code = afterTick.slice(0, closeTick);
        if (code) segments.push({ type: "inlineCode", content: code });
        remaining = afterTick.slice(closeTick + 1);
      } else {
        segments.push({ type: "text", content: "`" + afterTick });
        remaining = "";
      }
    } else {
      // 加粗
      if (boldIdx > 0) {
        segments.push({ type: "text", content: remaining.slice(0, boldIdx) });
      }
      const afterBold = remaining.slice(boldIdx + 2);
      const closeBold = afterBold.indexOf("**");
      if (closeBold !== -1) {
        const boldText = afterBold.slice(0, closeBold);
        if (boldText) segments.push({ type: "bold", content: boldText });
        remaining = afterBold.slice(closeBold + 2);
      } else {
        segments.push({ type: "text", content: "**" + afterBold });
        remaining = "";
      }
    }
  }

  return segments;
}

function renderFormattedText(segments: TextSegment[]): React.ReactNode[] {
  return segments.map((seg, i) => {
    switch (seg.type) {
      case "codeBlock":
        return (
          <Box key={i} paddingLeft={2}>
            <Text color="yellow" dimColor>{seg.content}</Text>
          </Box>
        );
      case "inlineCode":
        return (
          <Text key={i} color="cyanBright">{seg.content}</Text>
        );
      case "bold":
        return (
          <Text key={i} bold color="white">{seg.content}</Text>
        );
      default:
        return <Text key={i}>{seg.content}</Text>;
    }
  });
}

// ============================================================
// 估算单条消息占用的终端行数
// ============================================================
function estimateMsgLines(msg: UIMessage, termCols: number): number {
  const prefixW = msg.type === "tool" ? 6 : 4;
  const avail = Math.max(20, termCols - prefixW);
  const text = msg.content || "";
  let lines = 1;
  for (const seg of text.split("\n")) {
    lines += seg.length === 0 ? 1 : Math.ceil(seg.length / avail);
  }
  return lines;
}

// ============================================================
// MessageItem (memo 避免不变消息重复渲染)
// ============================================================
const MessageItem: React.FC<{ msg: UIMessage }> = memo(({ msg }) => {
  switch (msg.type) {
    case "user":
      return (
        <Box paddingLeft={1} flexDirection="row">
          <Text color="blueBright" bold>▶ </Text>
          <Text color="white" bold>{msg.content}</Text>
        </Box>
      );

    case "agent": {
      const isEmpty = !msg.content;
      return (
        <Box paddingLeft={1} flexDirection="column">
          {isEmpty ? (
            <Text>
              <Text color="green">●</Text>
              <Text color="yellow" dimColor> 思考中...</Text>
            </Text>
          ) : (
            <Box flexDirection="column" paddingLeft={1}>
              {parseAgentContent(msg.content).map((seg, si) => {
                if (seg.type === "codeBlock") {
                  return (
                    <Box key={si} paddingLeft={1} flexDirection="column">
                      {seg.content.split("\n").map((line, li) => (
                        <Box key={li}>
                          <Text color="gray" dimColor>│ </Text>
                          <Text color="yellow">{line}</Text>
                        </Box>
                      ))}
                    </Box>
                  );
                }
                // 普通文本块：逐行解析
                return (
                  <Box key={si} flexDirection="column">
                    {seg.content.split("\n").map((line, li) => {
                      const lineKey = `${si}-${li}`;
                      // 标题
                      const hMatch = line.match(/^(#{1,3})\s+(.+)/);
                      if (hMatch) {
                        const color = hMatch[1].length === 1 ? "cyanBright"
                          : hMatch[1].length === 2 ? "yellow"
                          : "magentaBright";
                        return (
                          <Box key={lineKey} marginTop={li > 0 ? 1 : 0}>
                            <Text bold color={color}>{hMatch[2]}</Text>
                          </Box>
                        );
                      }
                      // 列表项
                      const liMatch = line.match(/^(\s*)[-*]\s+(.+)/);
                      if (liMatch) {
                        return (
                          <Box key={lineKey} paddingLeft={1}>
                            <Text dimColor>• </Text>
                            <Text>{liMatch[2]}</Text>
                          </Box>
                        );
                      }
                      // 引用
                      const quoteMatch = line.match(/^>\s?(.+)/);
                      if (quoteMatch) {
                        return (
                          <Box key={lineKey} paddingLeft={1}>
                            <Text color="green" dimColor>│ </Text>
                            <Text dimColor>{quoteMatch[1]}</Text>
                          </Box>
                        );
                      }
                      // 缩进代码行
                      const indentCode = line.match(/^( {4}|\t)(.+)/);
                      if (indentCode) {
                        return (
                          <Box key={lineKey} paddingLeft={2}>
                            <Text color="yellow">{indentCode[2]}</Text>
                          </Box>
                        );
                      }
                      // 分隔线
                      if (/^[-*_]{3,}$/.test(line.trim())) {
                        return (
                          <Box key={lineKey}>
                            <Text dimColor>──────────────────────────────────────</Text>
                          </Box>
                        );
                      }
                      // 空行
                      if (!line.trim()) {
                        return <Box key={lineKey} height={1} />;
                      }
                      // 普通行 —— 行内格式
                      const segments = parseInlineFormats(line);
                      return (
                        <Box key={lineKey}>
                          <Text>{renderFormattedText(segments)}</Text>
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      );
    }

    case "tool": {
      const icon =
        msg.toolStatus === "running" ? "⟳"
          : msg.toolStatus === "success" ? "✓"
          : "✗";
      const color =
        msg.toolStatus === "running" ? "yellowBright"
          : msg.toolStatus === "success" ? "green"
          : "red";
      return (
        <Box paddingLeft={3}>
          <Text color={color} bold>{icon}</Text>
          <Text dimColor> {msg.content}</Text>
        </Box>
      );
    }

    case "system":
      return (
        <Box paddingLeft={1}>
          <Text color="gray">  {msg.content}</Text>
        </Box>
      );

    default:
      return null;
  }
});

// ============================================================
// MessageList —— 按实际行数截断，防止溢出到输入区上方
// ============================================================
export const MessageList: React.FC<{
  messages: UIMessage[];
  maxLines: number;
  termCols: number;
  isBusy?: boolean;
}> = ({ messages, maxLines, termCols, isBusy }) => {
  if (messages.length === 0) {
    if (isBusy) {
      return (
        <Box paddingLeft={1}>
          <Text dimColor>⏳ 处理中...</Text>
        </Box>
      );
    }
    return null;
  }

  // 从最新消息往前累计行数，只渲染能显示得下的
  let used = 0;
  const visible: UIMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const lines = estimateMsgLines(messages[i], termCols);
    if (used + lines <= maxLines || visible.length === 0) {
      visible.unshift(messages[i]);
      used += lines;
    } else {
      break;
    }
  }

  return (
    <Box flexDirection="column">
      {visible.map((msg) => (
        <MessageItem key={msg.id} msg={msg} />
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
  showDivider?: boolean;
  confirmCommand?: string | null;
  confirmRisk?: string;
}> = ({ onSubmit, disabled, showDivider, confirmCommand, confirmRisk }) => {
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
    <Box flexDirection="column">
      {showDivider && (
        <Box>
          <Text color="magentaBright" dimColor>───</Text>
        </Box>
      )}
      {confirmCommand ? (
        <Box flexDirection="column">
          <Box>
            <Text color="yellow" bold>
              ⚠ {confirmRisk}: {confirmCommand}
            </Text>
          </Box>
          <Box>
            <Text color="green">[y] 确认执行</Text>
            <Text>  </Text>
            <Text color="red">[n] 取消</Text>
          </Box>
          <Box>
            <Text color="cyanBright" bold>{">"}</Text>
            <Text> </Text>
          </Box>
        </Box>
      ) : disabled ? (
        <Box>
          <Text color="yellow" dimColor>⏳ 处理中，请稍候...</Text>
        </Box>
      ) : (
        <Box>
          <Text color="cyanBright" bold>{">"}</Text>
          <Text color="white"> {value}</Text>
        </Box>
      )}
    </Box>
  );
};

// ============================================================
// TaskList —— 动态任务清单，订阅 todoStore
// ============================================================
export const TaskList: React.FC = () => {
  const [todos, setTodos] = useState<TodoItem[]>(getTodos());

  useEffect(() => {
    return subscribeTodos(() => setTodos(getTodos()));
  }, []);

  if (todos.length === 0) return null;

  const doneCount = todos.filter((t) => t.status === "completed").length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box>
        <Text bold color="cyanBright">
          📋 任务进度 ({doneCount}/{todos.length})
        </Text>
      </Box>
      {todos.map((t) => {
        const icon =
          t.status === "completed" ? "✓"
            : t.status === "in_progress" ? "⟳"
            : "○";
        const color =
          t.status === "completed" ? "green"
            : t.status === "in_progress" ? "yellowBright"
            : "gray";
        return (
          <Box key={t.id} paddingLeft={1}>
            <Text color={color} bold>{icon}</Text>
            <Text color={t.status === "completed" ? "green" : undefined} dimColor={t.status === "completed"}>
              {" "}[{t.id}] {t.content}
            </Text>
          </Box>
        );
      })}
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
    status === "idle" ? "●"
      : status === "thinking" ? "◉"
      : "◈";
  const label =
    status === "idle" ? "就绪"
      : status === "thinking" ? "思考中"
      : "执行中";
  const dotColor =
    status === "idle" ? "greenBright"
      : status === "thinking" ? "yellowBright"
      : "blueBright";

  return (
    <Box>
      <Text dimColor>╰─</Text>
      <Text color={dotColor}> {dot} {label}</Text>
      <Text dimColor> · </Text>
      <Text dimColor>{messageCount} 条消息</Text>
      <Text dimColor> · </Text>
      <Text dimColor>/help /clear /exit</Text>
    </Box>
  );
};

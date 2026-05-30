import { useEffect, useState, useCallback, useMemo } from "react";
import { Box, Text, useStdout, useApp } from "ink";
import { useAgent } from "./hooks.js";
import {
  Header,
  MessageList,
  InputLine,
  WelcomeScreen,
  StatusBar,
  UpdateNotification,
  TaskList,
} from "./components.js";
import { getPendingConfirm, answerConfirm } from "../tools/bash/confirmStore.js";

// 固定 UI 占行
const HEADER_LINES = 2;
const UPDATE_LINES = 2;
const INPUT_LINES = 5;
const STATUS_LINES = 2;
const FIXED_LINES = HEADER_LINES + UPDATE_LINES + INPUT_LINES + STATUS_LINES;
const WELCOME_LINES = 15;

export default function App({
  initialTask,
  projectRoot,
}: {
  initialTask?: string;
  projectRoot: string;
}) {
  const {
    messages,
    status,
    sendMessage,
    addSystemMessage,
    clearMessages,
    resumeCtx,
    resumeSession,
    startNewSession,
    listSessions,
    loadMemory,
  } = useAgent();
  const { stdout } = useStdout();
  const { exit } = useApp();

  const rows = stdout?.rows || 24;
  const cols = stdout?.columns || 80;

  const isBusy = status !== "idle";
  const showWelcome = messages.length === 0;
  const [pendingInitial, setPendingInitial] = useState(!!initialTask?.trim());

  // ---- 记忆浏览器 ----
  const [memoryMode, setMemoryMode] = useState(false);
  const [memorySessions, setMemorySessions] = useState<
    Array<{ id: string; title: string; startedAt: string; messageCount: number; status: string }>
  >([]);

  // ---- 确认状态轮询 ----
  const [confirmCmd, setConfirmCmd] = useState<string | null>(null);
  const [confirmRisk, setConfirmRisk] = useState<string>("");

  useEffect(() => {
    const id = setInterval(() => {
      const c = getPendingConfirm();
      if (c) {
        setConfirmCmd(c.command);
        setConfirmRisk(c.risk);
      } else {
        setConfirmCmd(null);
        setConfirmRisk("");
      }
    }, 150);
    return () => clearInterval(id);
  }, []);

  const maxMsgLines = useMemo(() => {
    const chrome = FIXED_LINES + (showWelcome ? WELCOME_LINES : 0);
    return Math.max(5, rows - chrome);
  }, [rows, showWelcome]);

  const handleSubmit = useCallback(
    (text: string) => {
      // 恢复会话提示：处理 y/n
      if (resumeCtx) {
        const lower = text.trim().toLowerCase();
        if (lower === "y" || lower === "yes") {
          resumeSession();
        } else {
          startNewSession();
        }
        return;
      }

      // 如果有待确认项，这里的输入是确认/取消
      if (confirmCmd) {
        const lower = text.trim().toLowerCase();
        if (lower === "y" || lower === "yes" || lower === "/confirm") {
          answerConfirm(true);
        } else if (lower === "n" || lower === "no" || lower === "/deny") {
          answerConfirm(false);
        }
        // 其他输入忽略，等待明确回复
        return;
      }

      // 记忆浏览器模式：处理数字选择或取消
      if (memoryMode) {
        const lower = text.trim().toLowerCase();
        if (lower === "c" || lower === "cancel") {
          setMemoryMode(false);
          setMemorySessions([]);
        } else {
          const idx = parseInt(lower, 10);
          if (!isNaN(idx) && idx >= 1 && idx <= memorySessions.length) {
            const session = memorySessions[idx - 1];
            loadMemory(session.id);
            setMemoryMode(false);
            setMemorySessions([]);
          }
        }
        return;
      }

      if (isBusy) return;

      if (text === "/memory") {
        const sessions = listSessions();
        if (sessions.length === 0) {
          addSystemMessage("📋 没有找到历史会话记录。");
        } else {
          setMemorySessions(sessions.map((s) => ({
            id: s.id,
            title: s.title,
            startedAt: s.startedAt,
            messageCount: s.messageCount,
            status: s.status,
          })));
          setMemoryMode(true);
        }
        return;
      }

      if (text === "/exit") {
        exit();
        return;
      }
      if (text === "/help") {
        addSystemMessage(
          "可用命令:\n  /help    显示帮助\n  /exit    退出程序\n  /clear   清屏\n  /memory  浏览历史会话记忆\n\n直接输入任务描述，Agent 会自动调用工具完成任务。",
        );
        return;
      }
      if (text === "/clear") {
        clearMessages();
        return;
      }

      sendMessage(text);
    },
    [isBusy, exit, addSystemMessage, clearMessages, sendMessage, confirmCmd, resumeCtx, resumeSession, startNewSession, memoryMode, memorySessions, listSessions, loadMemory],
  );

  // 初始任务延迟发送
  useEffect(() => {
    if (pendingInitial && initialTask?.trim() && status === "idle") {
      setPendingInitial(false);
      sendMessage(initialTask.trim());
    }
  }, [pendingInitial, initialTask, status, sendMessage]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Header />
      {showWelcome && <WelcomeScreen projectRoot={projectRoot} />}
      <UpdateNotification />
      <TaskList />
      <MessageList
        messages={messages}
        maxLines={maxMsgLines}
        termCols={cols}
        isBusy={isBusy}
      />
      {memoryMode && memorySessions.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">📋 历史会话 (输入序号加载，c 取消)</Text>
          {memorySessions.map((s, i) => {
            const statusIcon = s.status === "completed" ? "✓" : s.status === "interrupted" ? "⚡" : "●";
            const date = s.startedAt.slice(0, 16).replace("T", " ");
            return (
              <Box key={s.id}>
                <Text color="yellow">[{i + 1}]</Text>
                <Text> {statusIcon} </Text>
                <Text bold>{s.title}</Text>
                <Text dimColor> — {date} · {s.messageCount}条</Text>
              </Box>
            );
          })}
        </Box>
      )}
      {resumeCtx && (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">
            ⚡ 发现未完成的会话
          </Text>
          <Text>
            上次在做：<Text bold>{resumeCtx.title}</Text>
          </Text>
          {resumeCtx.pendingTodos.length > 0 && (
            <Text>
              未完成待办：{resumeCtx.pendingTodos.join("、")}
            </Text>
          )}
          <Box marginTop={1}>
            <Text color="green">[y] 恢复继续</Text>
            <Text>  </Text>
            <Text color="red">[n] 重新开始</Text>
          </Box>
        </Box>
      )}
      <InputLine
        onSubmit={handleSubmit}
        disabled={isBusy && !confirmCmd && !resumeCtx && !memoryMode}
        showDivider={messages.length > 0 || !!resumeCtx}
        confirmCommand={confirmCmd}
        confirmRisk={confirmRisk}
      />
      <StatusBar status={status} messageCount={messages.length} />
    </Box>
  );
}

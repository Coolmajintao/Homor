import { useEffect, useState } from "react";
import { Box, useStdout, useApp } from "ink";
import { useAgent } from "./hooks.js";
import {
  Header,
  MessageList,
  InputLine,
  WelcomeScreen,
  StatusBar,
} from "./components.js";

export default function App({ initialTask }: { initialTask?: string }) {
  const {
    messages,
    status,
    sendMessage,
    addSystemMessage,
    clearMessages,
  } = useAgent();
  const { stdout } = useStdout();
  const { exit } = useApp();
  const [pendingInitial, setPendingInitial] = useState(
    !!initialTask?.trim(),
  );

  const headerLines = 2;
  const inputLines = 5;
  const availableHeight = Math.max(
    (stdout?.rows || 24) - headerLines - inputLines,
    5,
  );
  const isBusy = status !== "idle";
  const showWelcome = messages.length === 0;

  const handleSubmit = (text: string) => {
    if (isBusy) return;

    if (text === "/exit") {
      exit();
      return;
    }
    if (text === "/help") {
      addSystemMessage(
        "可用命令:\n  /help   显示帮助\n  /exit   退出程序\n  /clear  清屏\n\n直接输入任务描述，Agent 会自动调用工具完成任务。",
      );
      return;
    }
    if (text === "/clear") {
      clearMessages();
      return;
    }

    sendMessage(text);
  };

  // 初始任务延迟发送，等 Agent 初始化完毕
  useEffect(() => {
    if (pendingInitial && initialTask?.trim() && status === "idle") {
      setPendingInitial(false);
      sendMessage(initialTask.trim());
    }
  }, [pendingInitial, initialTask, status, sendMessage]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Header />
      {showWelcome && <WelcomeScreen />}
      <MessageList messages={messages} maxHeight={availableHeight} />
      <InputLine onSubmit={handleSubmit} disabled={isBusy} />
      <StatusBar status={status} messageCount={messages.length} />
    </Box>
  );
}

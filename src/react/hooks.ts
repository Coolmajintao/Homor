import { useState, useRef, useCallback, useEffect } from "react";
import { AgentService } from "../Service/agentService.js";
import {
  securityHook,
  readFileHook,
  antiRepeatHook,
} from "../agent/hooks/index.js";
import type { UIMessage, AgentStatus } from "./types.js";
import type { ResumeContext, SessionMeta } from "../agent/memory";

let idCounter = 0;
function nextId(): string {
  return `msg_${++idCounter}`;
}

export function useAgent() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const busyRef = useRef(false);
  const [resumeCtx, setResumeCtx] = useState<ResumeContext | null>(null);

  const [agent] = useState(() => {
    const a = new AgentService();
    a.registerHook(securityHook);
    a.registerHook(readFileHook);
    a.registerHook(antiRepeatHook);

    // 检查可恢复会话（不初始化，等用户决定）
    const existing = a.findResumableSession();
    if (existing) {
      // 延迟设置，让 React 先挂载
      setTimeout(() => setResumeCtx(existing), 0);
    } else {
      a.init();
    }

    return a;
  });

  // ---- 进程退出兜底 ----
  useEffect(() => {
    const cleanup = async () => {
      try { await agent.shutdown("interrupted"); } catch {}
    };

    // 注意：SIGINT/SIGTERM 可能被 Ink 或 Node 吞掉，
    // 这里退而求其次用 beforeunload 等价：process on exit
    const onExit = () => {
      // 同步关闭，只标记状态
      try { agent.shutdown("interrupted"); } catch {}
    };

    process.on("exit", onExit);
    // SIGINT 通常可捕获
    const onSig = () => {
      cleanup().then(() => process.exit(0));
    };
    process.on("SIGINT", onSig);
    process.on("SIGTERM", onSig);

    return () => {
      process.off("exit", onExit);
      process.off("SIGINT", onSig);
      process.off("SIGTERM", onSig);
    };
  }, [agent]);

  // ---- 恢复会话 ----
  const resumeSession = useCallback(() => {
    if (!resumeCtx) return;
    agent.confirmResume(resumeCtx.sessionId, "");
    setResumeCtx(null);
    // 注入系统消息提示恢复
    setMessages([
      {
        id: nextId(),
        type: "system",
        content: `📋 已恢复上次会话：${resumeCtx.title}
待办：${resumeCtx.pendingTodos.length > 0 ? resumeCtx.pendingTodos.join("、") : "无"}`,
        timestamp: Date.now(),
      },
    ]);
  }, [agent, resumeCtx]);

  const startNewSession = useCallback(() => {
    agent.init();
    setResumeCtx(null);
  }, [agent]);

  // ---- 发送消息 ----
  const sendMessage = useCallback(async (text: string) => {
    if (!agent || !text.trim() || busyRef.current) return;
    busyRef.current = true;

    const userMsg: UIMessage = {
      id: nextId(),
      type: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStatus("thinking");

    const agentMsgId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: agentMsgId, type: "agent", content: "", timestamp: Date.now() },
    ]);

    // ---- token 批处理 ----
    let tokenBuffer = "";
    let tokenTimer: ReturnType<typeof setTimeout> | null = null;

    const flushTokens = () => {
      if (!tokenBuffer) return;
      const chunk = tokenBuffer;
      tokenBuffer = "";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId ? { ...m, content: m.content + chunk } : m,
        ),
      );
    };

    const onToken = (token: string) => {
      tokenBuffer += token;
      if (!tokenTimer) {
        tokenTimer = setTimeout(() => {
          tokenTimer = null;
          flushTokens();
        }, 50);
      }
    };

    const onToolStart = (tool: string, args: Record<string, unknown>) => {
      if (tokenTimer) { clearTimeout(tokenTimer); tokenTimer = null; }
      flushTokens();
      setStatus("executing");
      const shortArgs = Object.values(args)
        .slice(0, 2)
        .map((v) => String(v).slice(0, 40))
        .join(", ");
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          type: "tool",
          content: `${tool} ${shortArgs ? "— " + shortArgs : ""}`,
          toolName: tool,
          toolStatus: "running",
          timestamp: Date.now(),
        },
      ]);
    };

    const onToolEnd = (_tool: string, success: boolean) => {
      setStatus("thinking");
      setMessages((prev) =>
        prev.map((m) =>
          m.type === "tool" && m.toolName === _tool && m.toolStatus === "running"
            ? { ...m, toolStatus: success ? "success" : "error" }
            : m,
        ),
      );
    };

    try {
      await agent.chat(text, { onToken, onToolStart, onToolEnd });
      flushTokens();
    } catch (err: any) {
      flushTokens();
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          type: "system",
          content: `❌ 错误: ${err.message || String(err)}`,
          timestamp: Date.now(),
        },
      ]);
    }

    if (tokenTimer) clearTimeout(tokenTimer);
    setStatus("idle");
    busyRef.current = false;
  }, [agent]);

  const addSystemMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), type: "system", content: text, timestamp: Date.now() },
    ]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const listSessions = useCallback((): SessionMeta[] => {
    return agent.listRecentSessions(10);
  }, [agent]);

  const loadMemory = useCallback(
    (sessionId: string): boolean => {
      const ctx = agent.loadSessionMemory(sessionId);
      if (!ctx) return false;

      // 先注入到 LLM 上下文
      agent.injectContext(ctx);

      // 同时在 UI 显示确认
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          type: "system",
          content: `📋 已加载历史会话记忆，Agent 将在后续对话中参考这些内容。`,
          timestamp: Date.now(),
        },
      ]);
      return true;
    },
    [agent],
  );

  return {
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
  };
}

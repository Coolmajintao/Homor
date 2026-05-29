import { useState, useRef, useEffect, useCallback } from "react";
import { AgentService } from "../Service/agentService.js";
import {
  securityHook,
  readFileHook,
  antiRepeatHook,
} from "../agent/hooks/index.js";
import type { UIMessage, AgentStatus } from "./types.js";

let idCounter = 0;
function nextId(): string {
  return `msg_${++idCounter}`;
}

export function useAgent() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const agentRef = useRef<AgentService | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const agent = new AgentService();
    agent.registerHook(securityHook);
    agent.registerHook(readFileHook);
    agent.registerHook(antiRepeatHook);
    agent.init();
    agentRef.current = agent;
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const agent = agentRef.current;
    if (!agent || !text.trim() || busyRef.current) return;

    busyRef.current = true;

    // 用户消息
    const userMsg: UIMessage = {
      id: nextId(),
      type: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStatus("thinking");

    // Agent 回复占位
    const agentMsgId = nextId();
    setMessages((prev) => [
      ...prev,
      {
        id: agentMsgId,
        type: "agent",
        content: "",
        timestamp: Date.now(),
      },
    ]);

    const onToken = (token: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId ? { ...m, content: m.content + token } : m,
        ),
      );
    };

    const onToolStart = (tool: string, args: Record<string, unknown>) => {
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

    const onToolEnd = (tool: string, success: boolean) => {
      setStatus("thinking");
      setMessages((prev) =>
        prev.map((m) =>
          m.type === "tool" &&
          m.toolName === tool &&
          m.toolStatus === "running"
            ? { ...m, toolStatus: success ? "success" : "error" }
            : m,
        ),
      );
    };

    try {
      await agent.chat(text, { onToken, onToolStart, onToolEnd });
    } catch (err: any) {
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

    setStatus("idle");
    busyRef.current = false;
  }, []);

  const addSystemMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        type: "system",
        content: text,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, status, sendMessage, addSystemMessage, clearMessages };
}

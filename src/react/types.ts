export interface UIMessage {
  id: string;
  type: "user" | "agent" | "tool" | "system";
  content: string;
  toolName?: string;
  toolStatus?: "running" | "success" | "error";
  timestamp: number;
}

export type AgentStatus = "idle" | "thinking" | "executing";

export interface ToolHook {
  // 工具名匹配模式，支持通配符 *，如 "*" 匹配所有工具
  toolPattern: string;
  // 工具执行前调用，返回要注入的提示片段，null 表示不注入
  beforeExecute?: (
    toolName: string,
    args: Record<string, unknown>,
  ) => string | null;
  // 工具执行后调用，返回要注入的提示片段
  afterExecute?: (
    toolName: string,
    args: Record<string, unknown>,
    result: any,
  ) => string | null;
}

// 工具执行后的返回结果
export interface ToolResult {
  success: boolean; // 是否成功
  data: string; // 返回的数据（成功时）或错误信息（失败时）
  error?: string; // 可选：错误描述
}

// 工具参数的描述（给大模型看的）
export interface ToolParameter {
  name: string; // 参数名，如 "filePath"
  type: "string" | "number" | "boolean"; // 参数类型（只能是这三种）
  description: string; // 参数说明，如 "要读取的文件路径"
  required: boolean; // 是否必填
}

// 工具的"形状契约"：所有工具类必须实现此接口
export interface ITool {
  name: string; // 工具唯一名称，如 "read_file"
  description: string; // 工具功能描述，给大模型看的
  parameters: ToolParameter[]; // 工具需要的参数列表
  execute(args: Record<string, unknown>): Promise<ToolResult>; // 真正执行的方法
}

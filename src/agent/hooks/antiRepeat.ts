import { ToolHook } from "./types";

export const antiRepeatHook: ToolHook = {
  toolPattern: "*",
  afterExecute: () => {
    return "工具执行完毕。如果你准备给出最终答案，请确保回答简洁、清晰，不要重复输出完全相同的代码块或文件内容，只保留必要的部分。";
  },
};

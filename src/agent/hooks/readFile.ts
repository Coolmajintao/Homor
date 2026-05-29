import { ToolHook } from "./types";

export const readFileHook: ToolHook = {
  toolPattern: "read_file",
  afterExecute: (toolName, args, result) => {
    if (result && result.success && result.data) {
      const contentLength = result.data.length;
      if (contentLength > 500) {
        return `你刚才读取了文件 ${args.filePath}，其内容较长（${contentLength} 字符）。请用 1-3 句话简要总结该文件的主要功能，然后根据用户任务决定下一步操作。避免在最终回答中全文复制文件内容。`;
      }
    }
    return null;
  },
};

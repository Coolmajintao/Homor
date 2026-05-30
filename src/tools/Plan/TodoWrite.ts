import { ITool, ToolResult, ToolParameter } from "../toolInterface";

/**
 * 待办项定义（与 Claude Code 的 TodoWrite 输入保持一致）
 */
interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export class TodoWriteTool implements ITool {
  name = "TodoWrite";
  description =
    "用于为复杂任务创建和管理结构化的待办清单。这个工具帮助你拆解任务、追踪进度，并向用户清晰展示你的工作计划。\n\n" +
    "## 何时使用" +
    "在以下情况使用此工具：" +
    "1. 任务复杂，需要 3 个或更多有依赖关系的步骤" +
    "2. 任务涉及多个文件、多个模块，或需要先探索代码库才能动手" +
    "3. 用户明确要求你制定计划，或提供了多项任务" +
    "4. 在执行过程中发现任务比预想的复杂，需要重新梳理" +
    "## 何时【不要】使用 " +
    "以下情况请直接动手，不要创建清单： " +
    "1. 任务简单直接，1-2 步即可完成（如修改一个变量、加一行日志、回答一个问题） " +
    "2. 任务是纯对话、解释或信息查询 " +
    "3. 创建清单本身比完成任务还慢  " +
    "## 如何编写好的待办项 " +
    "- 每一项必须是【可执行的具体动作】，而非模糊目标。 " +
    "  反例：'优化性能' " +
    "  正例：'在 src/db.js 中为 getUser 查询添加索引' " +
    "- 粒度适中：一项对应一个可独立验证的成果，通常对应 1-3 次工具调用。不要拆得太碎（如'打开文件''读第10行'），也不要太粗（如'实现整个功能'）。 " +
    "- 在涉及关键改动的任务中，应包含【验证步骤】（如'运行测试确认登录流程通过'）。  " +
    "## 状态管理规则（必须严格遵守） " +
    "- 每个待办项有三种状态：pending（待办）、in_progress（进行中）、completed（已完成）。 " +
    "- 任何时刻【最多只能有一项】处于 in_progress 状态。 " +
    "- 实时更新：开始做某项时立刻标记为 in_progress；该项真正完成后立刻标记为 completed，再开始下一项。不要批量补记。 " +
    "- 只有在任务【真正完成】时才标记 completed。如果遇到错误、测试未通过、实现被阻塞，请将其保持为 in_progress，并新增一项描述需要解决的问题。 " +
    "- 如果计划需要调整，直接用新的完整清单覆盖即可——计划是可以修订的。";

  parameters: ToolParameter[] = [
    {
      name: "todos",
      type: "string", // 实际输入为 JSON 字符串，这里用 string 让模型传递整个数组的 JSON
      description:
        '完整的待办清单 JSON 字符串。格式：[{"id":"1","content":"...","status":"pending|in_progress|completed"}]。每次调用都传入完整列表（包含已完成项），而非增量。',
      required: true,
    },
  ];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const todosStr = args.todos as string;
    if (!todosStr) {
      return {
        success: false,
        data: "",
        error: "缺少参数 todos",
      };
    }

    let todos: TodoItem[];
    try {
      todos = JSON.parse(todosStr);
      if (!Array.isArray(todos)) throw new Error("todos 必须是数组");
    } catch (e: any) {
      return {
        success: false,
        data: "",
        error: `todos 解析失败：${e.message}`,
      };
    }

    // 校验每个待办项
    for (const item of todos) {
      if (!item.id || !item.content || !item.status) {
        return {
          success: false,
          data: "",
          error: `待办项缺少必要字段 (id, content, status)`,
        };
      }
      if (!["pending", "in_progress", "completed"].includes(item.status)) {
        return {
          success: false,
          data: "",
          error: `无效的状态 "${item.status}"，必须是 pending、in_progress 或 completed`,
        };
      }
    }

    // 最多一项 in_progress
    const inProgressCount = todos.filter(
      (t) => t.status === "in_progress",
    ).length;
    if (inProgressCount > 1) {
      return {
        success: false,
        data: "",
        error: `同一时刻最多只能有一项处于 in_progress 状态，当前有 ${inProgressCount} 项`,
      };
    }

    // 写入共享 store，由 Ink TaskList 组件渲染
    try {
      const { setTodos } = await import("../../react/todoStore.js");
      setTodos(todos);
    } catch {
      // 非 Ink 模式下（纯 CLI），回退到 console 输出
      console.log("\n📋 任务进度：");
      todos.forEach((t) => {
        const icon =
          t.status === "completed"
            ? "✅"
            : t.status === "in_progress"
              ? "🔄"
              : "⬜";
        console.log(`  ${icon} [${t.id}] ${t.content}`);
      });
    }

    return {
      success: true,
      data: `待办清单已更新，共 ${todos.length} 项。${
        inProgressCount === 0 && todos.some((t) => t.status === "pending")
          ? "请继续执行下一项 pending 任务。"
          : ""
      }`,
    };
  }
}

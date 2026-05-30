// 模块级 Todo 状态：TodoWriteTool 写入，TaskList 组件订阅渲染
export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

type Listener = () => void;

let todos: TodoItem[] = [];
const listeners = new Set<Listener>();

export function getTodos(): TodoItem[] {
  return todos;
}

export function setTodos(newTodos: TodoItem[]): void {
  todos = newTodos;
  listeners.forEach((fn) => fn());
}

export function subscribeTodos(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

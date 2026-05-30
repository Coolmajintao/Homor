// 模块级确认状态：连接 ExecTool 和 Ink UI，避免 readline 阻塞
export interface PendingConfirm {
  command: string;
  risk: string;
  promise: Promise<boolean>;
  resolve: (allowed: boolean) => void;
}

let current: PendingConfirm | null = null;

/** ExecTool 调用此函数请求用户确认，返回 Promise 等待 UI 层响应 */
export function requestConfirm(command: string, risk: string): Promise<boolean> {
  let resolve!: (allowed: boolean) => void;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  current = { command, risk, promise, resolve };
  return promise;
}

/** UI 层轮询是否有待确认项 */
export function getPendingConfirm(): PendingConfirm | null {
  return current;
}

/** UI 层响应用户确认结果 */
export function answerConfirm(allowed: boolean): void {
  if (current) {
    const cb = current.resolve;
    current = null;
    cb(allowed);
  }
}

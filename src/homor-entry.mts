#!/usr/bin/env node
// 抑制 dotenvx 的调试输出
process.env.DOTENVX_QUIET = "true";

import { render } from "ink";
import React from "react";
import App from "./react/app.js";
import { getProjectRoot } from "./utils/projectRoot.js";
import { chdir } from "process";

// dotenv 在 client.ts 中手动加载，此处不重复 import

const root = getProjectRoot();
chdir(root);

const args = process.argv.slice(2);
const initialTask = args.join(" ") || "";

// 错误边界防止崩溃后界面重置
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return React.createElement(
        "ink-box",
        { flexDirection: "column", padding: 1 },
        React.createElement(
          "ink-text",
          { color: "red", bold: true },
          "❌ 发生错误，请重启 Homor",
        ),
        React.createElement(
          "ink-text",
          { dimColor: true },
          String(this.state.error?.message || "未知错误"),
        ),
      );
    }
    return this.props.children;
  }
}

const app = React.createElement(
  ErrorBoundary,
  null,
  React.createElement(App, { key: "homor-app", initialTask, projectRoot: root }),
);

const { waitUntilExit } = render(app);
await waitUntilExit();

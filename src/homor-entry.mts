#!/usr/bin/env node
import { render } from "ink";
import React from "react";
import App from "./react/app.js";
import { getProjectRoot } from "./utils/projectRoot.js";
import { chdir } from "process";
import "dotenv/config";

// 切换到项目根目录
const root = getProjectRoot();
console.log(`📍 项目根目录: ${root}`);
chdir(root);

const args = process.argv.slice(2);
const initialTask = args.join(" ") || "";

const { waitUntilExit } = render(
  React.createElement(App, { initialTask }),
);
await waitUntilExit();

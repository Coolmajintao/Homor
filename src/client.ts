import dotenv from "dotenv";
import { resolve } from "path";
import Openai from "openai";

// 按优先级加载 .env：
// 1. 当前工作目录（用户项目的 .env）
// 2. Homor 安装目录（包自带的 .env）
// 3. 默认 dotenv 行为（cwd/.env）
const cwd = process.cwd();
dotenv.config({ path: resolve(cwd, ".env") });

if (!process.env.apiKey && process.env.HOMOR_HOME) {
  dotenv.config({ path: resolve(process.env.HOMOR_HOME, "..", ".env") });
}

export const client = new Openai({
  apiKey: process.env.apiKey,
  baseURL: process.env.baseUrl,
});

#!/usr/bin/env node
process.env.HOMOR_HOME = __dirname;

// dist/homor.mjs 是 ESM bundle，必须用动态 import
import("../dist/homor.mjs").catch((err) => {
  console.error("Homor 启动失败:", err.message);
  console.error("请先运行 npm run build 构建项目");
  process.exit(1);
});

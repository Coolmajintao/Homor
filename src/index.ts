#!/usr/bin/env node
import { Command } from "commander";
import { agentCommand } from "./agent/main";
import { getProjectRoot } from "./utils/projectRoot";
import { chdir } from "process";

const program = new Command();

// ── 全局选项 ──
program
  .name("my_cli")
  .description("这是一个非常好的起点，让我可以学习cli的开发")
  .version("1.0.0")
  .option("-d, --debug", "开启调试")
  .option("-c, --config <path>", "指定配置文件路径")
  .option("-r, --project-root <path>", "指定项目根目录（默认为自动检测）"); // 新增

// ── 原有子命令（保持不变） ──
program
  .command("name <name>")
  .description("输出名字")
  .option("-u, --user", "即将打印你的名字")
  .action((name: string) => {
    const new_name = `你是一位优秀的的人${name}`;
    console.log(new_name);
  });

program
  .command("ask <question>")
  .option("-a, --ask", "让Dun回答你的问题")
  .description("告诉我要回答的内容")
  .action((q: string) => {
    if (q) {
      console.log(
        "你好呀，我是Dun,你也可以叫我T，我是你的终极助手，可以帮助你解决很多生活中的问题，\n 有什么问题尽管告诉我",
      );
    }
  });

// ── 挂载 Agent 命令 ──
program.addCommand(agentCommand);

// ── 在解析前处理根目录 ──
// hook: 所有命令执行前都会触发
program.hook("preAction", (thisCommand) => {
  const options = thisCommand.opts();
  const projectRoot = getProjectRoot(options.projectRoot);
  console.log(`📍 项目根目录: ${projectRoot}`);
  chdir(projectRoot); // 将进程工作目录切换到项目根目录
});

// 解析用户输入
program.parse();

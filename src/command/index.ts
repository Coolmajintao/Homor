// #!/usr/bin/env node
// import { Command } from "commander";
// import { agentCommand } from "../agent/main";
// import { getProjectRoot } from "../utils/projectRoot";
// import { chdir } from "process";

// const program = new Command();

// program
//   .name("my_cli")
//   .description("AI 编码助手 CLI")
//   .version("1.0.0")
//   .option("-d, --debug", "开启调试模式")
//   .option("-c, --config <path>", "指定配置文件路径")
//   .option("-r, --project-root <path>", "指定项目根目录（默认为自动检测）");

// // 挂载 Agent 命令
// program.addCommand(agentCommand);

// // 所有命令执行前，确定并切换到项目根目录
// program.hook("preAction", (thisCommand) => {
//   const options = thisCommand.opts();
//   const projectRoot = getProjectRoot(options.projectRoot);
//   console.log(`📍 项目根目录: ${projectRoot}`);
//   chdir(projectRoot);
// });

// // 解析用户输入
// program.parse();

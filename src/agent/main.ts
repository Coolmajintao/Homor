import { Command } from "commander";
import { securityHook, readFileHook, antiRepeatHook } from "../agent/hooks";
import { AgentService } from "../Service/agentService";

export const agentCommand = new Command("agent")
  .description("启动编程 Agent，自动分析并修改代码")
  .argument("<task>", "你要做什么")
  .action(async (task: string) => {
    const agent = new AgentService();

    // hook 钩子
    // 注册内置 Hook（加在这里）
    agent.registerHook(securityHook);
    agent.registerHook(readFileHook);
    agent.registerHook(antiRepeatHook);

    console.log(`🤖 Agent 正在工作...\n`);
    const result = await agent.execute(task);
    // console.log(result);
    console.log("\n✅ 完成");
  });

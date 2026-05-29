import { Command } from "commander";
import { securityHook, readFileHook, antiRepeatHook } from "../agent/hooks";
import { AgentService } from "../Service/agentService";

export const agentCommand = new Command("agent")
  .description("启动编程 Agent，自动分析并修改代码")
  .argument("<task...>", "你要做什么（支持空格，不用加引号）")
  .action(async (task: string[]) => {
    const agent = new AgentService();

    agent.registerHook(securityHook);
    agent.registerHook(readFileHook);
    agent.registerHook(antiRepeatHook);

    console.log(`🤖 Agent 正在工作...\n`);

    // 把所有参数拼成一句话
    const fullTask = task.join(" ");

    const result = await agent.execute(fullTask);

    console.log("\n✅ 完成");
  });

// src/utils/projectRoot.ts
import { existsSync, statSync } from "fs";
import { resolve, dirname, join, parse } from "path";

/**
 * 向上遍历目录树，查找 .git 目录或文件
 * 找到则返回该目录的绝对路径，找不到返回 null
 */
function findGitRoot(startPath: string): string | null {
  let current = resolve(startPath);
  const systemRoot = parse(current).root; // Windows: C:\  Linux/Mac: /

  while (true) {
    const gitPath = join(current, ".git");
    try {
      const stat = statSync(gitPath);
      // .git 可以是目录（常规仓库）或文件（worktree / 子模块）
      if (stat.isDirectory() || stat.isFile()) {
        return current;
      }
    } catch {
      // .git 不存在，继续向上
    }

    // 到达文件系统根目录，停止
    if (current === systemRoot) break;

    const parent = dirname(current);
    // 防止死循环（处理挂载点等情况）
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * 获取项目根目录
 * 优先级：Git 根目录 > 当前工作目录
 * 如果提供了 explicitRoot，直接使用
 */
export function getProjectRoot(explicitRoot?: string): string {
  // 1. 用户显式指定，最高优先级
  if (explicitRoot) {
    const resolved = resolve(explicitRoot);
    if (existsSync(resolved)) {
      return resolved;
    }
    console.warn(`指定的项目根目录不存在: ${explicitRoot}，将使用默认策略`);
  }

  // 2. 向上找 Git 根目录
  const gitRoot = findGitRoot(process.cwd());
  if (gitRoot) {
    return gitRoot;
  }

  // 3. 兜底：当前工作目录
  return process.cwd();
}

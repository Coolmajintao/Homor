import { readdir, readFile, writeFile, mkdir, unlink } from "fs/promises";
import { dirname } from "path";
import { ToolResult } from "../interface/toolResult";

export class ToolService {
  // List files in a directory
  // 读取文件列表，传入一个目录路径，返回该目录下的所有文件和子目录
  async listFiles(dirPath: string): Promise<ToolResult> {
    try {
      const files = await readdir(dirPath, { recursive: true });
      return { success: true, data: files.join("\n") };
    } catch (err) {
      return { success: false, data: String(err) };
    }
  }

  // 读文件
  async readFileContent(filePath: string): Promise<ToolResult> {
    try {
      const content = await readFile(filePath, "utf-8");
      return { success: true, data: content };
    } catch (err) {
      return { success: false, data: String(err) };
    }
  }

  // 写文件
  async writeFileContent(
    filePath: string,
    content: string,
  ): Promise<ToolResult> {
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      return { success: true, data: `File written to ${filePath}` };
    } catch (err) {
      return { success: false, data: String(err) };
    }
  }

  // 删除文件
  async deleteFile(filePath: string): Promise<ToolResult> {
    try {
      await unlink(filePath);
      return { success: true, data: `File deleted: ${filePath}` };
    } catch (err) {
      return { success: false, data: String(err) };
    }
  }
}

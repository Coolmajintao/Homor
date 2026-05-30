import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ============================================================
// Types
// ============================================================

export enum RiskLevel {
  SAFE = "SAFE",
  MODIFY = "MODIFY",
  DESTRUCTIVE = "DESTRUCTIVE",
  BLOCKED = "BLOCKED",
}

export interface ParsedCommand {
  raw: string;
  base: string; // e.g., "npm"
  subCmd: string; // e.g., "install"
  args: string[]; // e.g., ["lodash"]
  fullCmd: string; // e.g., "npm install"
  hasPipes: boolean;
  hasChains: boolean;
}

export interface ConfirmResult {
  allowed: boolean;
  rememberSession: boolean; // allow similar commands this session
  savePermanently: boolean; // save to config file
}

export interface PermissionConfig {
  permissions: {
    allow: string[];
    deny: string[];
  };
}

// ============================================================
// Risk classification data
// ============================================================

const SAFE_BASE_COMMANDS = new Set([
  "ls", "dir", "cat", "head", "tail", "more", "less",
  "find", "grep", "egrep", "fgrep", "rg",
  "wc", "sort", "uniq", "cut", "tr", "tee",
  "echo", "printf", "pwd", "which", "where", "type", "whereis",
  "date", "whoami", "uname", "hostname", "uptime",
  "df", "du", "file", "stat", "basename", "dirname", "realpath",
  "ps", "top", "htop", "pgrep", "pidof", "tasklist",
  "man", "help", "info", "whatis", "apropos",
  "node", "python", "python3", "ruby", "perl", "php", "go", "rustc", "cargo", "java", "javac",
  "calc", "bc", "expr",
  "env", "printenv", "set",
  "history", "fc",
  "diff", "comm", "cmp",
  "xxd", "hexdump", "od",
  "tree", "dir",
  "get-childitem", "get-content", "select-string",
]);

const SAFE_SUBCOMMANDS = new Map<string, Set<string>>([
  ["git", new Set([
    "status", "log", "diff", "branch", "show", "blame",
    "remote", "stash", "tag", "config", "ls-files",
    "rev-parse", "rev-list", "describe", "name-rev",
    "shortlog", "whatchanged", "reflog", "grep",
  ])],
  ["npm", new Set(["list", "view", "ls", "outdated", "audit", "info", "search", "config", "prefix", "root", "bin"])],
  ["yarn", new Set(["list", "info", "outdated", "audit", "why", "config"])],
  ["pip", new Set(["list", "show", "freeze", "search", "config"])],
  ["docker", new Set(["ps", "images", "inspect", "logs", "stats", "info", "version", "network ls", "volume ls", "compose ps", "compose logs", "compose config"])],
  ["kubectl", new Set(["get", "describe", "logs", "top", "explain", "config view", "version", "api-resources", "api-versions"])],
  ["gh", new Set(["status", "view", "list", "browse", "search", "config"])],
  ["go", new Set(["version", "env", "list", "doc", "vet", "fmt"])],
  ["cargo", new Set(["search", "tree", "doc", "version", "fmt", "clippy"])],
  ["pnpm", new Set(["list", "view", "outdated", "audit", "info", "search"])],
]);

const MODIFY_BASE_COMMANDS = new Set([
  "mkdir", "touch", "cp", "copy", "mv", "move", "rename", "ren",
  "tar", "zip", "unzip", "gzip", "gunzip", "7z", "compress", "expand",
  "curl", "wget", "invoke-webrequest", "iwr",
  "make", "cmake", "ninja", "msbuild",
  "npx", "pnpx",
  "ln", "link", "mklink",
  "tee",
]);

const MODIFY_SUBCOMMANDS = new Map<string, Set<string>>([
  ["npm", new Set(["install", "uninstall", "update", "run", "exec", "init", "publish", "link", "unlink", "adduser", "login", "logout", "deprecate", "access", "owner", "version", "dist-tag", "shrinkwrap", "pack"])],
  ["yarn", new Set(["add", "remove", "install", "upgrade", "run", "init", "publish", "link", "unlink", "version"])],
  ["pnpm", new Set(["add", "remove", "install", "update", "run", "exec", "init", "publish", "link", "unlink"])],
  ["pip", new Set(["install", "uninstall", "download", "wheel"])],
  ["pip3", new Set(["install", "uninstall", "download", "wheel"])],
  ["go", new Set(["get", "install", "build", "run", "test", "mod", "generate", "tool"])],
  ["cargo", new Set(["build", "run", "test", "install", "uninstall", "update", "add", "remove", "publish", "bench"])],
  ["git", new Set(["add", "commit", "push", "pull", "fetch", "merge", "rebase", "checkout", "switch", "stash", "tag", "remote", "clone", "init", "cherry-pick", "revert", "bisect", "worktree", "submodule", "mv", "rm", "notes"])],
  ["docker", new Set(["build", "run", "start", "stop", "restart", "pull", "push", "tag", "login", "logout", "compose up", "compose down", "compose build", "compose pull", "compose start", "compose stop", "compose restart", "exec", "cp", "save", "load", "import", "export"])],
  ["kubectl", new Set(["apply", "create", "delete", "edit", "patch", "replace", "scale", "expose", "run", "rollout", "set", "annotate", "label", "taint", "cordon", "drain", "uncordon", "port-forward", "proxy", "cp", "exec", "attach"])],
  ["gh", new Set(["create", "edit", "delete", "release", "pr", "issue", "repo", "run", "workflow", "secret", "variable", "auth", "codespace", "gist", "alias", "attestation", "cache", "label", "milestone", "project"])],
  ["dotnet", new Set(["build", "run", "test", "publish", "restore", "pack", "new", "add", "remove", "watch", "dev-certs", "tool"])],
  ["npx", new Set([])], // all npx commands are MODIFY
]);

const DESTRUCTIVE_BASE_COMMANDS = new Set([
  "rm", "rmdir", "del", "erase", "rd",
  "remove-item", "remove-itemproperty",
  "chmod", "chown", "chgrp", "icacls", "cacls", "attrib",
  "kill", "killall", "pkill", "taskkill", "stop-process",
  "diskpart", "format", "fdisk", "parted",
  "shutdown", "reboot", "halt", "poweroff", "init",
  "mkfs", "mkswap", "fsck",
  "dd",
  "reg", "regedit",
  "schtasks", "at",
  "crontab",
  "systemctl", "service",
  "sc", "net",
  "mount", "umount", "mountvol",
  "set-itemproperty", "clear-content",
  "out-file", "export-csv",
]);

const DESTRUCTIVE_SUBCOMMANDS = new Map<string, Set<string>>([
  ["git", new Set(["reset", "clean", "gc", "prune", "reflog"])],
  ["docker", new Set(["rm", "rmi", "prune", "volume rm", "volume prune", "network prune", "builder prune", "system prune", "container prune", "image prune"])],
  ["npm", new Set(["cache clean", "unpublish", "prune"])],
  ["pip", new Set(["cache purge", "cache remove"])],
  ["kubectl", new Set(["delete", "drain", "cord", "uncord", "taint"])],
]);

// Patterns that are always blocked (checked against raw command)
const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+--no-preserve-root/,
  /sudo\s+rm\s+-rf\s+\//,
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:/,  // fork bomb
  />\s*\/dev\/sd[a-z]/,
  />\s*\/dev\/hd[a-z]/,
  />\s*\/dev\/nvme/,
  /dd\s+if=.*\s+of=\/dev\//,
  /mkfs/,
  /chmod\s+-R\s+777\s+\//,
  /chmod\s+777\s+\//,
  /format\s+[a-z]:/i,
  /diskpart/,
];

// Commands that look dangerous when combined with pipe to shell
const DANGEROUS_PIPE_RECEIVERS = new Set([
  "bash", "sh", "zsh", "dash", "ksh", "fish",
  "cmd", "powershell", "pwsh",
  "eval", "exec",
  "source", ".",
]);

// ============================================================
// Command Parser
// ============================================================

function splitShellTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      current += ch;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = "";
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === " " || ch === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

export function parseCommand(raw: string): ParsedCommand {
  const trimmed = raw.trim();
  const hasPipes = /\|/.test(trimmed);
  const hasChains = /&&|;/.test(trimmed);

  // Get the first segment (before pipe or chain)
  const firstSegment = trimmed.split(/[|&;]/)[0].trim();
  const tokens = splitShellTokens(firstSegment);

  let base = "";
  let subCmd = "";
  const args: string[] = [];

  if (tokens.length > 0) {
    // Handle paths like /usr/bin/git or .\node_modules\.bin\jest
    const rawBase = tokens[0].replace(/^.*[/\\]/, "");
    base = rawBase.toLowerCase();

    // Handle combined flags like "npm -v" -> this is still SAFE read
    // Second token might be a subcommand or a flag/arg
    if (tokens.length > 1 && !tokens[1].startsWith("-")) {
      subCmd = tokens[1].toLowerCase();
      args.push(...tokens.slice(2));
    } else if (tokens.length > 1) {
      // It's a flag like -v, --version
      args.push(...tokens.slice(1));
    }
  }

  const fullCmd = subCmd ? `${base} ${subCmd}` : base;

  return { raw: trimmed, base, subCmd, args, fullCmd, hasPipes, hasChains };
}

// ============================================================
// Risk Classifier
// ============================================================

function getRiskForSingleCommand(base: string, subCmd: string): RiskLevel {
  const fullCmd = subCmd ? `${base} ${subCmd}` : base;

  // Check subcommand-level matches first (more specific)
  if (subCmd) {
    for (const [cmd, subs] of SAFE_SUBCOMMANDS) {
      if (base === cmd) {
        for (const s of subs) {
          if (subCmd === s || subCmd.startsWith(s + " ")) {
            return RiskLevel.SAFE;
          }
        }
      }
    }
    for (const [cmd, subs] of DESTRUCTIVE_SUBCOMMANDS) {
      if (base === cmd) {
        for (const s of subs) {
          if (subCmd === s || subCmd.startsWith(s + " ")) {
            return RiskLevel.DESTRUCTIVE;
          }
        }
      }
    }
    for (const [cmd, subs] of MODIFY_SUBCOMMANDS) {
      if (base === cmd) {
        for (const s of subs) {
          if (subCmd === s || subCmd.startsWith(s + " ") || s === "") {
            return RiskLevel.MODIFY;
          }
        }
      }
    }
  }

  // Check base command level
  if (SAFE_BASE_COMMANDS.has(base)) return RiskLevel.SAFE;
  if (DESTRUCTIVE_BASE_COMMANDS.has(base)) return RiskLevel.DESTRUCTIVE;
  if (MODIFY_BASE_COMMANDS.has(base)) return RiskLevel.MODIFY;

  // Check if base command has any modify subcommands defined (like docker, kubectl, gh)
  // If so, the base command itself is at least MODIFY
  if (MODIFY_SUBCOMMANDS.has(base)) return RiskLevel.MODIFY;
  if (DESTRUCTIVE_SUBCOMMANDS.has(base)) return RiskLevel.MODIFY;
  if (SAFE_SUBCOMMANDS.has(base)) return RiskLevel.MODIFY;

  // Unknown command that starts with a known safe base
  // e.g., "git-credential-manager" shouldn't be treated as "git"
  // Unknown commands default to MODIFY (conservative)
  return RiskLevel.MODIFY;
}

export function classifyCommand(parsed: ParsedCommand): RiskLevel {
  // Check blocked patterns against raw command first
  const rawLower = parsed.raw.toLowerCase();
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(rawLower)) {
      return RiskLevel.BLOCKED;
    }
  }

  // Check for dangerous pipe: "curl url | bash"
  if (parsed.hasPipes) {
    const segments = parsed.raw.split("|");
    for (const seg of segments) {
      const p = parseCommand(seg.trim());
      if (DANGEROUS_PIPE_RECEIVERS.has(p.base)) {
        return RiskLevel.BLOCKED;
      }
    }
  }

  // If chained, get the highest risk among all parts
  if (parsed.hasChains) {
    const segments = parsed.raw.split(/[;&]+/);
    let maxRisk = RiskLevel.SAFE;
    for (const seg of segments) {
      const p = parseCommand(seg.trim());
      const risk = getRiskForSingleCommand(p.base, p.subCmd);
      if (risk > maxRisk) maxRisk = risk;
    }
    return maxRisk;
  }

  return getRiskForSingleCommand(parsed.base, parsed.subCmd);
}

// ============================================================
// Permission Manager
// ============================================================

export class PermissionManager {
  private sessionAllowPatterns = new Set<string>();
  private configPath: string;
  private config: PermissionConfig;

  constructor(projectRoot: string) {
    this.configPath = path.join(projectRoot, "reports.json");
    this.config = this.loadConfig();
  }

  private loadConfig(): PermissionConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          permissions: {
            allow: parsed.permissions?.allow || [],
            deny: parsed.permissions?.deny || [],
          },
        };
      }
    } catch {
      // Config file corrupted or unreadable, use defaults
    }
    return { permissions: { allow: [], deny: [] } };
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        "utf-8",
      );
    } catch (e) {
      console.error(`[PermissionManager] 无法保存配置到 ${this.configPath}:`, e);
    }
  }

  /** Check if a command pattern is in the permanent allow list */
  private isPermanentlyAllowed(parsed: ParsedCommand): boolean {
    const patterns = this.config.permissions.allow;
    for (const pattern of patterns) {
      if (this.matchPattern(pattern, parsed)) return true;
    }
    return false;
  }

  /** Check if a command pattern is in the permanent deny list */
  private isPermanentlyDenied(parsed: ParsedCommand): boolean {
    const patterns = this.config.permissions.deny;
    for (const pattern of patterns) {
      if (this.matchPattern(pattern, parsed)) return true;
    }
    return false;
  }

  /** Check if a command pattern is in the session allow list */
  private isSessionAllowed(parsed: ParsedCommand): boolean {
    for (const pattern of this.sessionAllowPatterns) {
      if (this.matchPattern(pattern, parsed)) return true;
    }
    return false;
  }

  /** Match a command against a pattern string like "npm install" or "git *" */
  private matchPattern(pattern: string, parsed: ParsedCommand): boolean {
    const p = pattern.toLowerCase().trim();
    const cmd = parsed.fullCmd.toLowerCase();
    const raw = parsed.raw.toLowerCase();

    // Exact match on full command
    if (cmd === p) return true;
    // Exact match on raw command
    if (raw === p) return true;
    // Wildcard: "npm *" matches "npm install", "npm run build"
    if (p.endsWith("*") && cmd.startsWith(p.slice(0, -1).trim())) return true;
    // Wildcard: "npm install *" matches "npm install lodash"
    if (p.endsWith("*") && raw.startsWith(p.slice(0, -1).trim())) return true;

    return false;
  }

  /** Save a pattern to the permanent config */
  addPermanentAllow(pattern: string): void {
    if (!this.config.permissions.allow.includes(pattern)) {
      this.config.permissions.allow.push(pattern);
      this.saveConfig();
    }
  }

  /** Remember a pattern for this session */
  addSessionAllow(pattern: string): void {
    this.sessionAllowPatterns.add(pattern);
  }

  /** Get the risk level for a command */
  assessCommand(rawCommand: string): {
    parsed: ParsedCommand;
    risk: RiskLevel;
    needsApproval: boolean;
    blockReason?: string;
  } {
    const parsed = parseCommand(rawCommand);
    const risk = classifyCommand(parsed);

    // 1. Permanent deny always wins
    if (this.isPermanentlyDenied(parsed)) {
      return {
        parsed,
        risk,
        needsApproval: true,
        blockReason: `命令 "${parsed.fullCmd}" 在永久拒绝列表中。`,
      };
    }

    // 2. Permanent allow bypasses everything
    if (this.isPermanentlyAllowed(parsed)) {
      return { parsed, risk, needsApproval: false };
    }

    // 3. Session allow bypasses for MODIFY level
    if (risk === RiskLevel.MODIFY && this.isSessionAllowed(parsed)) {
      return { parsed, risk, needsApproval: false };
    }

    // 4. BLOCKED always needs approval (and will usually be denied)
    if (risk === RiskLevel.BLOCKED) {
      return {
        parsed,
        risk,
        needsApproval: true,
        blockReason: `命令 "${parsed.raw}" 被识别为高危操作，默认拒绝执行。`,
      };
    }

    // 5. SAFE always passes
    if (risk === RiskLevel.SAFE) {
      return { parsed, risk, needsApproval: false };
    }

    // 6. Only DESTRUCTIVE needs approval; MODIFY passes
    if (risk === RiskLevel.DESTRUCTIVE) {
      return { parsed, risk, needsApproval: true };
    }
    return { parsed, risk, needsApproval: false };
  }

  /** Show confirmation prompt and return result */
  async confirmCommand(
    command: string,
    risk: RiskLevel,
  ): Promise<ConfirmResult> {
    const riskLabel =
      risk === RiskLevel.MODIFY
        ? "修改操作"
        : risk === RiskLevel.DESTRUCTIVE
          ? "危险操作"
          : "高危操作";

    const prompt =
      `\n⚠️  命令: ${command}\n` +
      `   风险级别: ${riskLabel}\n` +
      `   [y] 允许本次  [n] 拒绝  [a] 本次会话允许同类命令  [s] 永久保存\n` +
      `   请选择 (y/n/a/s): `;

    const rl = readline.createInterface(process.stdin, process.stdout);
    const answer = await new Promise<string>((resolve) => {
      rl.question(prompt, resolve);
    });
    rl.close();

    const choice = answer.toLowerCase().trim();

    if (choice === "a") {
      return { allowed: true, rememberSession: true, savePermanently: false };
    }
    if (choice === "s") {
      return { allowed: true, rememberSession: false, savePermanently: true };
    }
    if (choice === "y" || choice === "yes") {
      return { allowed: true, rememberSession: false, savePermanently: false };
    }
    return { allowed: false, rememberSession: false, savePermanently: false };
  }

  /** Handle the confirmation result — save to session or config as needed */
  handleConfirmResult(parsed: ParsedCommand, result: ConfirmResult): void {
    if (result.rememberSession) {
      // Remember at the fullCmd level: "npm install"
      this.addSessionAllow(parsed.fullCmd);
    }
    if (result.savePermanently) {
      // Save raw command pattern to config
      this.addPermanentAllow(parsed.fullCmd);
    }
  }
}

export interface SlashCommand {
  name: string
  label: string
  description: string
  type: "command" | "action"
  command?: string
  action?: SlashAction
}

export type SlashAction = "help" | "models" | "sessions" | "new-session"

export const slashCommands: SlashCommand[] = [
  { name: "/init", label: "初始化规则", description: "执行 MiMo init 命令", type: "command", command: "init" },
  { name: "/review", label: "代码审查", description: "执行 MiMo review 命令", type: "command", command: "review" },
  { name: "/dream", label: "整理记忆", description: "执行 MiMo dream 命令", type: "command", command: "dream" },
  { name: "/distill", label: "提炼能力", description: "执行 MiMo distill 命令", type: "command", command: "distill" },
  { name: "/goal", label: "设置目标", description: "执行 MiMo goal 命令", type: "command", command: "goal" },
  { name: "/deep-research", label: "深度研究", description: "执行 MiMo deep-research 命令", type: "command", command: "deep-research" },
  { name: "/loops", label: "定时任务", description: "执行 MiMo loops 命令", type: "command", command: "loops" },
  { name: "/help", label: "命令帮助", description: "显示可用斜杠命令", type: "action", action: "help" },
  { name: "/models", label: "模型列表", description: "打开模型选择/设置", type: "action", action: "models" },
  { name: "/sessions", label: "会话列表", description: "打开会话侧栏", type: "action", action: "sessions" },
  { name: "/resume", label: "恢复会话", description: "Alias of /sessions", type: "action", action: "sessions" },
  { name: "/continue", label: "继续会话", description: "Alias of /sessions", type: "action", action: "sessions" },
  { name: "/new", label: "新建会话", description: "打开新建工作区会话", type: "action", action: "new-session" },
  { name: "/clear", label: "新建会话", description: "Alias of /new", type: "action", action: "new-session" },
]

export function getSlashCommandMatches(input: string) {
  const query = input.trimStart()
  if (!query.startsWith("/")) return []
  const token = query.split(/\s+/, 1)[0].toLowerCase()
  return slashCommands.filter((command) => command.name.startsWith(token))
}

export type SlashCommandResult =
  | { handled: false; error?: string }
  | { handled: true; type: "action"; action?: SlashAction }
  | { handled: true; type: "command"; command: string; arguments: string }

export function parseSlashCommand(input: string): SlashCommandResult {
  const trimmedStart = input.trimStart()
  if (!trimmedStart.startsWith("/")) return { handled: false }
  const match = trimmedStart.match(/^(\/\S+)(?:\s+([\s\S]*))?$/)
  if (!match) return { handled: false, error: "命令格式无效" }
  const token = match[1].toLowerCase()
  const item = slashCommands.find((command) => command.name === token)
  if (!item) return { handled: false, error: `不支持的命令：${token}` }
  if (item.type === "action") return { handled: true, type: "action", action: item.action }
  return { handled: true, type: "command", command: item.command ?? token.slice(1), arguments: (match[2] ?? "").trim() }
}

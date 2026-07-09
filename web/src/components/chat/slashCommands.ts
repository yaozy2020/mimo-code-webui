import type { PromptMode } from "./InputBar"

export interface SlashCommand {
  name: string
  label: string
  description: string
  type: "prompt" | "action"
  mode?: PromptMode
  action?: SlashAction
  template?: (input: string) => string
}

export type SlashAction = "help" | "models" | "sessions" | "new-session"

export const slashCommands: SlashCommand[] = [
  {
    name: "/fix",
    label: "修复问题",
    description: "定位并修复一个具体 bug",
    type: "prompt",
    mode: "build",
    template: (input) => `修复这个问题：${input || "请根据当前上下文定位并修复问题。"}`,
  },
  {
    name: "/review",
    label: "代码审查",
    description: "检查风险、回归和缺失测试",
    type: "prompt",
    mode: "plan",
    template: (input) => `请做代码审查，优先指出 bug、行为回归和缺失测试。${input ? `重点关注：${input}` : ""}`.trim(),
  },
  {
    name: "/explain",
    label: "解释代码",
    description: "解释文件、模块或实现思路",
    type: "prompt",
    mode: "plan",
    template: (input) => `解释这部分代码或项目逻辑：${input || "请根据当前上下文说明关键实现。"}`,
  },
  {
    name: "/test",
    label: "测试补齐",
    description: "添加或修复测试覆盖",
    type: "prompt",
    mode: "build",
    template: (input) => `添加或修复测试：${input || "请根据当前改动补齐必要测试。"}`,
  },
  {
    name: "/refactor",
    label: "安全重构",
    description: "保持行为不变地整理实现",
    type: "prompt",
    mode: "build",
    template: (input) => `在保持行为不变的前提下重构：${input || "请选择当前最需要整理的实现点。"}`,
  },
  {
    name: "/docs",
    label: "更新文档",
    description: "补充 README、说明或使用文档",
    type: "prompt",
    mode: "build",
    template: (input) => `更新文档：${input || "请根据当前项目状态补充必要文档。"}`,
  },
  {
    name: "/init",
    label: "初始化规则",
    description: "创建或更新 AGENTS.md",
    type: "prompt",
    mode: "build",
    template: (input) => `创建或更新项目 AGENTS.md，记录项目结构、常用命令、运行约束和协作规则。${input ? `补充要求：${input}` : ""}`.trim(),
  },
  {
    name: "/compact",
    label: "压缩上下文",
    description: "总结当前会话上下文",
    type: "prompt",
    mode: "plan",
    template: (input) => `总结并压缩当前会话上下文，保留目标、决策、未完成任务、关键文件和验证结果。${input ? `额外要求：${input}` : ""}`.trim(),
  },
  {
    name: "/summarize",
    label: "压缩上下文",
    description: "Alias of /compact",
    type: "prompt",
    mode: "plan",
    template: (input) => slashCommands.find((command) => command.name === "/compact")?.template?.(input) ?? input,
  },
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

export function expandSlashCommand(input: string): { handled: boolean; type?: "prompt" | "action"; mode?: PromptMode; action?: SlashAction; text: string } {
  const trimmedStart = input.trimStart()
  if (!trimmedStart.startsWith("/")) return { handled: false, mode: undefined, text: input }
  const match = trimmedStart.match(/^(\/\S+)(?:\s+([\s\S]*))?$/)
  if (!match) return { handled: false, mode: undefined, text: input }
  const command = slashCommands.find((item) => item.name === match[1].toLowerCase())
  if (!command) return { handled: false, mode: undefined, text: input }
  if (command.type === "action") return { handled: true, type: "action", action: command.action, text: "" }
  return { handled: true, type: "prompt", mode: command.mode, text: command.template?.((match[2] ?? "").trim()) ?? "" }
}

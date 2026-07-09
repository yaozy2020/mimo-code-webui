import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Copy, FileText, Pencil, Terminal, ListTodo, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { nextStreamingDisplay } from "@/lib/streamingDisplay"
import { formatMessageTime } from "@/lib/time"
import type { Message } from "@/types"

interface MessageBubbleProps {
  message: Message
  onCopy?: () => void
}

function preview(value: unknown) {
  if (value === undefined || value === null || value === "") return ""
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return text.length > 600 ? `${text.slice(0, 600)}...` : text
}

function toolIcon(toolName?: string) {
  const name = (toolName ?? "").toLowerCase()
  if (name.includes("read") || name.includes("glob") || name.includes("grep")) return FileText
  if (name.includes("edit") || name.includes("write") || name.includes("apply")) return Pencil
  if (name.includes("bash") || name.includes("shell") || name.includes("run")) return Terminal
  if (name.includes("task") || name.includes("todo")) return ListTodo
  return FileText
}

function toolActionLabel(toolName?: string): string {
  const name = (toolName ?? "").toLowerCase()
  if (name.includes("read") || name.includes("glob") || name.includes("grep")) return "读取"
  if (name.includes("edit") || name.includes("write") || name.includes("apply")) return "编辑"
  if (name.includes("bash") || name.includes("shell") || name.includes("run")) return "运行"
  if (name.includes("task") || name.includes("todo")) return "待办"
  return "操作"
}

function toolTargetPath(part: NonNullable<Message["parts"]>[number]): string {
  const input = part.state?.input
  if (!input || typeof input !== "object") return ""
  const rec = input as Record<string, unknown>
  const path = rec.file_path ?? rec.path ?? rec.filePath ?? rec.file ?? rec.command ?? rec.cmd
  if (typeof path === "string" && path) {
    const parts = path.split("/")
    return parts.length > 3 ? `.../${parts.slice(-2).join("/")}` : path
  }
  return ""
}

function toolDetailSummary(part: NonNullable<Message["parts"]>[number]): string {
  const name = (part.tool ?? "").toLowerCase()
  if (name.includes("edit") || name.includes("write") || name.includes("apply")) {
    const input = part.state?.input as Record<string, unknown> | undefined
    if (input?.additions != null || input?.deletions != null) {
      return `+${input.additions ?? 0} -${input.deletions ?? 0}`
    }
    if (part.state?.output != null) {
      const out = String(part.state.output)
      const addMatch = out.match(/(\d+)\s*insertion/)
      const delMatch = out.match(/(\d+)\s*deletion/)
      if (addMatch || delMatch) {
        return `+${addMatch?.[1] ?? 0} -${delMatch?.[1] ?? 0}`
      }
    }
  }
  if (name.includes("read") || name.includes("glob") || name.includes("grep")) {
    if (part.state?.output != null) {
      const out = String(part.state.output)
      const lineMatch = out.match(/^(\d+)\s*lines?/i) ?? out.match(/(\d+)\s*行/)
      if (lineMatch) return `${lineMatch[1]} 行`
    }
  }
  if (name.includes("task") || name.includes("todo")) {
    if (part.state?.output != null) {
      const out = String(part.state.output)
      const countMatch = out.match(/(\d+)\s*(?:items?|tasks?|条|项)/i)
      if (countMatch) return `${countMatch[1]} 项`
    }
  }
  return ""
}

function CollapsibleTool({ part }: { part: NonNullable<Message["parts"]>[number] }) {
  const [open, setOpen] = useState(false)
  const status = part.state?.status ?? "pending"
  const prevStatusRef = useRef(status)

  useEffect(() => {
    const wasRunning = ["pending", "running"].includes(prevStatusRef.current)
    const isNowDone = status === "completed" || status === "success" || status === "done"
    prevStatusRef.current = status
    if (wasRunning && isNowDone) {
      setOpen(false)
    }
  }, [status])

  const hasDetail = Boolean(part.state?.input || part.state?.output || part.state?.error)
  const Icon = toolIcon(part.tool)
  const action = toolActionLabel(part.tool)
  const target = toolTargetPath(part)
  const detail = toolDetailSummary(part)
  const isDone = status === "completed" || status === "success" || status === "done"

  return (
    <div className="min-w-0 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-x-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
        onClick={() => setOpen(!open)}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{action}</span>
        {target && (
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
            {target}
          </span>
        )}
        {detail && <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>}
        <span className="shrink-0 text-xs">
          {isDone ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : status === "pending" || status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </span>
        {hasDetail && (
          open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" /> :
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        )}
      </button>
      {open && (
        <div className="ml-[1.15rem] space-y-2 border-l border-border/70 pl-3 pt-1">
          {part.state?.input != null && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-xs [overflow-wrap:anywhere]">
              {preview(part.state.input)}
            </pre>
          )}
          {part.state?.error && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-destructive/10 p-2 font-mono text-xs text-destructive [overflow-wrap:anywhere]">
              {String(part.state.error)}
            </pre>
          )}
          {part.state?.output != null && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-xs [overflow-wrap:anywhere]">
              {preview(part.state.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function MessageBubble({ message, onCopy }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const toolParts = message.parts?.filter((part) => part.type === "tool") ?? []
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const prevOptimisticRef = useRef(message.optimistic)

  useEffect(() => {
    const wasOptimistic = prevOptimisticRef.current
    const isNowComplete = wasOptimistic && !message.optimistic
    prevOptimisticRef.current = message.optimistic
    if (isNowComplete) {
      setThinkingOpen(false)
    }
  }, [message.optimistic, message.id])

  const displayContent = message.content || message.parts
    ?.filter((p) => p.type === "text")
    .map((p) => p.text ?? p.content ?? "")
    .join("") || ""
  const [assistantDisplayContent, setAssistantDisplayContent] = useState(displayContent)
  const messageTime = formatMessageTime(message.time?.created)
  const renderedContent = isUser ? displayContent : assistantDisplayContent

  useEffect(() => {
    if (isUser) {
      setAssistantDisplayContent(displayContent)
      return
    }
    if (!displayContent.startsWith(assistantDisplayContent) || assistantDisplayContent.length > displayContent.length) {
      setAssistantDisplayContent(displayContent)
      return
    }
    if (assistantDisplayContent === displayContent) return

    const timeout = window.setTimeout(() => {
      setAssistantDisplayContent((current) => nextStreamingDisplay(current, displayContent))
    }, 20)
    return () => window.clearTimeout(timeout)
  }, [assistantDisplayContent, displayContent, isUser])

  if (isUser) {
    return (
      <div className="group flex justify-end py-2">
        <div className="flex max-w-[85%] items-start gap-2">
          <div className="min-w-0">
            <div className="whitespace-pre-wrap break-words rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium leading-relaxed text-primary-foreground shadow-sm [overflow-wrap:anywhere]">
              {renderedContent || "..."}
            </div>
            {messageTime && <div className="mt-1 text-right text-[11px] text-muted-foreground">{messageTime}</div>}
          </div>
          {onCopy && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={onCopy}
              title="复制"
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col gap-1.5 py-2">
      {messageTime && <div className="text-[11px] text-muted-foreground">{messageTime}</div>}
      {message.thinking && (
        <div className="text-xs text-muted-foreground/70">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
            onClick={() => setThinkingOpen(!thinkingOpen)}
          >
            {thinkingOpen
              ? <ChevronDown className="h-3 w-3 shrink-0" />
              : <ChevronRight className="h-3 w-3 shrink-0" />}
            <span>Thinking</span>
          </button>
          {thinkingOpen && (
            <div className="ml-5 mt-1 whitespace-pre-wrap leading-relaxed">{message.thinking}</div>
          )}
        </div>
      )}
      {toolParts.map((part) => (
        <CollapsibleTool key={part.id} part={part} />
      ))}
      {renderedContent && (
        <div className="relative whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
          {renderedContent}
          {onCopy && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute -right-8 top-0 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={onCopy}
              title="复制回复"
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {!renderedContent && !toolParts.length && (
        <div className="text-sm text-muted-foreground italic">...</div>
      )}
    </div>
  )
}

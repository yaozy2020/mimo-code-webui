import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { ChevronDown, ChevronRight, Copy, FileText, Pencil, Terminal, ListTodo, Check, Loader2, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { nextStreamingDisplay } from "@/lib/streamingDisplay"
import { formatMessageTime } from "@/lib/time"
import type { Message } from "@/types"
import { codeBlockClassName, codeBlockText, inlineCodeClassName } from "./codeDisplay"
import { getSafeExternalHref } from "./linkSafety"
import { attachmentFileClassName, attachmentPreviewClassName, getVisibleAttachments } from "./messageAttachments"
import { isToolDone, isToolRunning, toolTaskTitle } from "./toolDisplay"

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
  if (name.includes("task") || name.includes("todo")) return "任务"
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

function languageFromClassName(className?: string) {
  return className?.match(/language-(\w+)/)?.[1]
}

function isImagePart(part: NonNullable<Message["parts"]>[number]) {
  return part.type === "image" || (part.type === "file" && part.mime?.startsWith("image/"))
}

function partSource(part: NonNullable<Message["parts"]>[number]) {
  return part.url || part.content || part.text || ""
}

function AttachmentPreview({ part, role }: { part: NonNullable<Message["parts"]>[number], role: Message["role"] }) {
  const source = partSource(part)
  const name = part.filename || part.mime || "附件"

  if (isImagePart(part) && source) {
    return (
      <div className={attachmentPreviewClassName(role)}>
        <img src={source} alt={name} className="max-h-64 max-w-full object-contain" />
      </div>
    )
  }

  return (
    <div className={attachmentFileClassName(role)}>
      {isImagePart(part) ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{name}</span>
    </div>
  )
}

function AssistantMarkdown({ content }: { content: string }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  function copyCodeBlock(text: string) {
    void navigator.clipboard.writeText(text)
    setCopiedCode(text)
    window.setTimeout(() => setCopiedCode((current) => (current === text ? null : current)), 1200)
  }

  return (
    <div className="assistant-markdown min-w-0 text-[15px] leading-8 text-foreground/90 [overflow-wrap:anywhere]">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          a: ({ children, href }) => {
            const safeHref = getSafeExternalHref(href)
            if (!safeHref) {
              return <span className="font-mono text-[0.95em] font-medium text-foreground decoration-transparent">{children}</span>
            }
            return (
              <a className="font-medium text-blue-600 underline decoration-blue-500/30 underline-offset-4 hover:decoration-blue-600 dark:text-blue-400" href={safeHref} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          },
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-muted-foreground/70">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6 marker:text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="pl-1 leading-8">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-border pl-4 text-muted-foreground">{children}</blockquote>
          ),
          pre: ({ children }) => {
            const text = codeBlockText(children)
            return (
              <div className="group relative my-4 min-w-0 rounded-lg border border-border/70 bg-slate-950/95 text-[13px] leading-6 text-slate-100 shadow-sm dark:bg-slate-950">
                <button
                  type="button"
                  className="absolute right-2 top-2 z-10 flex h-9 min-w-9 items-center justify-center rounded-md border border-white/10 bg-slate-900/90 px-2 text-xs font-medium text-slate-100 shadow-sm backdrop-blur transition-colors hover:bg-slate-800 active:bg-slate-700"
                  aria-label="复制代码块"
                  title="复制代码块"
                  onClick={() => copyCodeBlock(text)}
                >
                  {copiedCode === text ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
                <pre className="overflow-x-auto overscroll-x-contain p-4 pr-14 [-webkit-overflow-scrolling:touch]">{children}</pre>
              </div>
            )
          },
          code: ({ className, children, ...props }) => {
            const language = languageFromClassName(className)
            if (!className) {
              return <code className={inlineCodeClassName(children)} {...props}>{children}</code>
            }
            return (
              <code className={codeBlockClassName()} data-language={language} {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function CollapsibleTool({ part }: { part: NonNullable<Message["parts"]>[number] }) {
  const [open, setOpen] = useState(false)
  const status = part.state?.status ?? "pending"
  const prevStatusRef = useRef(status)

  useEffect(() => {
    const wasRunning = isToolRunning(prevStatusRef.current)
    const isNowDone = isToolDone(status)
    prevStatusRef.current = status
    if (wasRunning && isNowDone) {
      setOpen(false)
    }
  }, [status])

  const hasDetail = Boolean(part.state?.input || part.state?.output || part.state?.error)
  const Icon = toolIcon(part.tool)
  const action = toolActionLabel(part.tool)
  const target = toolTargetPath(part)
  const taskTitle = toolTaskTitle(part)
  const detail = toolDetailSummary(part)
  const isDone = isToolDone(status)

  return (
    <div className="min-w-0 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-x-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
        onClick={() => setOpen(!open)}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{action}</span>
        {(taskTitle || target) && (
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
            {taskTitle || target}
          </span>
        )}
        {detail && <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>}
        <span className="shrink-0 text-xs">
          {isDone ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : isToolRunning(status) ? (
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
  const attachmentParts = getVisibleAttachments(message)
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
            <div className="flex flex-col items-end gap-2">
              {attachmentParts.length > 0 && (
                <div className="flex max-w-full flex-col items-end gap-2">
                  {attachmentParts.map((part) => <AttachmentPreview key={part.id} part={part} role={message.role} />)}
                </div>
              )}
              {(renderedContent || attachmentParts.length === 0) && (
                <div className="whitespace-pre-wrap break-words rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium leading-relaxed text-primary-foreground shadow-sm [overflow-wrap:anywhere]">
                  {renderedContent || "..."}
                </div>
              )}
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
      {attachmentParts.length > 0 && (
        <div className="flex max-w-full flex-col items-start gap-2">
          {attachmentParts.map((part) => <AttachmentPreview key={part.id} part={part} role={message.role} />)}
        </div>
      )}
      {renderedContent && (
        <div className="relative min-w-0">
          <AssistantMarkdown content={renderedContent} />
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

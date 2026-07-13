import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import { Code2, FileText, FileSearch, ImagePlus, Layers, Paperclip, Send, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { getSlashCommandMatches, parseSlashCommand, slashCommands, type SlashAction, type SlashCommand } from "./slashCommands"
import type { PromptPart } from "@/api/message"

export type PromptMode = "build" | "plan" | "compose"

export interface PendingAttachment extends PromptPart {
  type: "file"
  mime: string
  filename: string
  url?: string
  content?: string
  size: number
}

const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

const modeConfig: Record<PromptMode, { icon: typeof Code2; label: string; title: string }> = {
  build: { icon: Code2, label: "构建", title: "读写文件、执行命令" },
  plan: { icon: FileSearch, label: "规划", title: "只读规划、设计方案" },
  compose: { icon: Layers, label: "编排", title: "编排多代理工作流" },
}

interface InputBarProps {
  onSend: (text: string, mode: PromptMode, attachments: PendingAttachment[]) => Promise<void>
  onCommand: (command: string, args: string) => Promise<void>
  onAbort: () => void
  onSlashAction?: (action: SlashAction) => void
  busy: boolean
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

async function readAsDataUrl(file: File) {
  const mime = file.type || "application/octet-stream"
  const base64 = arrayBufferToBase64(await file.arrayBuffer())
  return `data:${mime};base64,${base64}`
}

function readAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"))
    reader.readAsText(file)
  })
}

function isTextAttachment(file: File) {
  return file.type.startsWith("text/") || /\.(md|txt|json|csv|log|xml|ya?ml|ts|tsx|js|jsx|css|html|py|sh)$/i.test(file.name)
}

export function InputBar({ onSend, onCommand, onAbort, onSlashAction, busy }: InputBarProps) {
  const [text, setText] = useState("")
  const [mode, setMode] = useState<PromptMode>("build")
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendLockedRef = useRef(false)
  const slashMatches = getSlashCommandMatches(text)
  const showSlashMenu = slashMatches.length > 0

  useEffect(() => {
    if (!busy) sendLockedRef.current = false
  }, [busy])

  useEffect(() => {
    if (!busy) return

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onAbort()
    }

    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [busy, onAbort])

  const handleSend = async () => {
    if (sendLockedRef.current) return
    if (!text.trim() && attachments.length === 0) return
    const input = text.trim()
    if (input.startsWith("/")) {
      const parsed = parseSlashCommand(input)
      if (!parsed.handled) {
        setCommandError(parsed.error ?? "无法执行命令")
        return
      }
      if (parsed.type === "action") {
        runSlashAction(parsed.action)
        setText("")
        setCommandError(null)
        textareaRef.current?.focus()
        return
      }
      sendLockedRef.current = true
      setCommandError(null)
      try {
        await onCommand(parsed.command, parsed.arguments)
        setText("")
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error))
      } finally {
        sendLockedRef.current = false
        textareaRef.current?.focus()
      }
      return
    }
    sendLockedRef.current = true
    try {
      await onSend(input, mode, attachments)
      setText("")
      setAttachments([])
      setAttachmentError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    } finally {
      sendLockedRef.current = false
      textareaRef.current?.focus()
    }
  }

  const showSlashHelp = () => {
    setText(`可用斜杠命令：\n${slashCommands.map((command) => `${command.name} - ${command.label}`).join("\n")}`)
  }

  const runSlashAction = (action?: SlashAction) => {
    if (!action) return
    if (action === "help") {
      showSlashHelp()
      return
    }
    onSlashAction?.(action)
  }

  const applySlashCommand = (command: SlashCommand) => {
    const trimmedStart = text.trimStart()
    const rest = trimmedStart.replace(/^\/\S+\s*/, "").trim()
    if (command.type === "action") {
      runSlashAction(command.action)
      setText("")
      window.requestAnimationFrame(() => textareaRef.current?.focus())
      return
    }
    setText(`${command.name}${rest ? ` ${rest}` : ""}`)
    setCommandError(null)
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ""
    if (files.length === 0) return

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setAttachmentError(`最多添加 ${MAX_ATTACHMENTS} 个附件`)
      return
    }

    const oversized = files.find((file) => file.size > MAX_ATTACHMENT_BYTES)
    if (oversized) {
      setAttachmentError(`附件不能超过 5MB：${oversized.name}`)
      return
    }

    try {
      const nextAttachments = await Promise.all(
        files.map(async (file) => {
          const mime = file.type || (isTextAttachment(file) ? "text/plain" : "application/octet-stream")
          return {
            id: `prt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
            type: "file" as const,
            mime,
            filename: file.name,
            url: await readAsDataUrl(file),
            content: isTextAttachment(file) ? await readAsText(file) : undefined,
            size: file.size,
          }
        }),
      )
      setAttachments((current) => [...current, ...nextAttachments])
      setAttachmentError(null)
      textareaRef.current?.focus()
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && showSlashMenu && !text.trimStart().includes(" ")) {
      e.preventDefault()
      applySlashCommand(slashMatches[0])
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const placeholder =
    mode === "plan"
      ? "先分析和规划，暂不直接改代码..."
      : mode === "compose"
        ? "编排多代理工作流..."
        : "输入指令，让 MiMo 编写、修复或执行任务..."

  return (
    <div className="border-t bg-background/80 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:border-t-0 sm:bg-transparent sm:p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-1.5 rounded-2xl border bg-background p-2 shadow-lg shadow-black/5 sm:gap-2 sm:border sm:p-3">
        {showSlashMenu && (
          <div className="max-h-48 overflow-auto rounded-xl border bg-popover p-1 shadow-sm">
            {slashMatches.map((command) => {
              const Icon = FileText
              return (
                <button
                  key={command.name}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applySlashCommand(command)}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 font-mono text-xs text-primary">{command.name}</span>
                  <span className="shrink-0 font-medium">{command.label}</span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{command.description}</span>
                </button>
              )
            })}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto px-1">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
                {attachment.mime.startsWith("image/") ? <ImagePlus className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                <span className="max-w-[40vw] truncate sm:max-w-xs">{attachment.filename}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                  className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-background/80"
                  title="移除"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {(attachmentError || commandError) && <p className="px-1 text-xs text-destructive">{attachmentError ?? commandError}</p>}
        <div className="flex items-end gap-1.5 sm:gap-2">
          <div className="flex shrink-0 items-center gap-0.5 pb-0.5 pl-0.5 sm:pl-0">
            {(["build", "plan", "compose"] as const).map((m) => {
              const cfg = modeConfig[m]
              const Icon = cfg.icon
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  title={cfg.title}
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-full px-1.5 text-xs transition-all sm:h-8 sm:px-2.5",
                    mode === m ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{cfg.label}</span>
                </button>
              )
            })}
            <button
              type="button"
              title="添加附件"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-7 items-center rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-muted sm:h-8 sm:px-2"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
          </div>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[56px] max-h-[40vh] flex-1 resize-none border-0 bg-transparent py-1 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 sm:min-h-[72px]"
          />
          <div className="shrink-0 pb-0.5 sm:pb-1">
            {busy ? (
              <Button aria-label="停止生成" title="停止生成（Esc）" size="icon" variant="destructive" onClick={onAbort} className="h-8 w-8 rounded-full sm:h-9 sm:w-9">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                aria-label="发送消息"
                title="发送消息"
                size="icon"
                onClick={() => void handleSend()}
                disabled={!text.trim() && attachments.length === 0}
                className="h-8 w-8 rounded-full sm:h-9 sm:w-9"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react"
import { Code2, FileText, Globe, ImagePlus, Paperclip, Search, Send, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { PromptPart } from "@/api/message"

export type PromptMode = "build" | "plan" | "web-search" | "multimodal"

export interface PendingAttachment extends PromptPart {
  type: "file"
  mime: string
  filename: string
  url?: string
  content?: string
  size: number
}

const slashCommands = ["/plan", "/review", "/explain", "/fix", "/summarize"]
const referenceHints = ["@workspace", "@file", "@selection", "@terminal"]
const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

interface InputBarProps {
  onSend: (text: string, mode: PromptMode, attachments: PendingAttachment[]) => void
  onAbort: () => void
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

export function InputBar({ onSend, onAbort, busy }: InputBarProps) {
  const [text, setText] = useState("")
  const [mode, setMode] = useState<PromptMode>("build")
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const trimmed = text.trim()
  const suggestions = trimmed.startsWith("/") ? slashCommands : trimmed.startsWith("@") ? referenceHints : []

  const handleSend = () => {
    if (!text.trim() && attachments.length === 0) return
    onSend(text.trim(), mode, attachments)
    setText("")
    setAttachments([])
    setAttachmentError(null)
    textareaRef.current?.focus()
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t bg-background p-2 sm:p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 rounded-xl border bg-muted/30 p-2 shadow-sm">
        {suggestions.length > 0 && (
          <div className="grid gap-1 rounded-lg border bg-background p-2 text-xs shadow-sm sm:grid-cols-2">
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-md px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  setText(`${item} `)
                  textareaRef.current?.focus()
                }}
              >
                {item}
              </button>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-lg border bg-background p-2 text-xs">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="flex max-w-full items-center gap-2 rounded-md border bg-muted/50 px-2 py-1">
                {attachment.mime.startsWith("image/") ? <ImagePlus className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                <span className="truncate">{attachment.filename}</span>
                <span className="text-muted-foreground">{Math.max(1, Math.round(attachment.size / 1024))}KB</span>
                <button
                  type="button"
                  onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                  className="rounded hover:bg-background"
                  title="移除附件"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {attachmentError && <p className="px-1 text-xs text-destructive">附件读取失败：{attachmentError}</p>}
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "web-search"
              ? "联网搜索并总结..."
              : mode === "plan"
                ? "先分析和规划，暂不直接改代码..."
              : mode === "multimodal"
                  ? "描述图片、视频或多模态问题..."
                  : "让 MiMo Code 编写、修复或执行任务。输入 / 使用命令，输入 @ 引用上下文..."
          }
          className="min-h-[88px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={busy}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "build" ? "secondary" : "ghost"}
              onClick={() => setMode("build")}
              className="h-8 gap-1 text-xs"
            >
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">构建</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "plan" ? "secondary" : "ghost"}
              onClick={() => setMode("plan")}
              className="h-8 gap-1 text-xs"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">规划</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "web-search" ? "secondary" : "ghost"}
              onClick={() => setMode("web-search")}
              className="h-8 gap-1 text-xs"
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">联网</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "multimodal" ? "secondary" : "ghost"}
              onClick={() => setMode("multimodal")}
              className="h-8 gap-1 text-xs"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">多模态</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="添加附件"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
          </div>
          {busy ? (
            <Button size="icon" variant="destructive" onClick={onAbort} className="h-8 w-8 rounded-full">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!text.trim() && attachments.length === 0}
              className={cn("h-8 w-8 rounded-full", mode === "web-search" && "bg-blue-600 hover:bg-blue-700")}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

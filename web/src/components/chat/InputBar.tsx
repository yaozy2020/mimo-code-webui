import { type KeyboardEvent, useRef, useState } from "react"
import { Code2, Globe, ImagePlus, Paperclip, Search, Send, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type PromptMode = "build" | "plan" | "web-search" | "multimodal"

const slashCommands = ["/plan", "/review", "/explain", "/fix", "/summarize"]
const referenceHints = ["@workspace", "@file", "@selection", "@terminal"]

interface InputBarProps {
  onSend: (text: string, mode: PromptMode) => void
  onAbort: () => void
  busy: boolean
}

export function InputBar({ onSend, onAbort, busy }: InputBarProps) {
  const [text, setText] = useState("")
  const [mode, setMode] = useState<PromptMode>("build")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const trimmed = text.trim()
  const suggestions = trimmed.startsWith("/") ? slashCommands : trimmed.startsWith("@") ? referenceHints : []

  const handleSend = () => {
    if (!text.trim()) return
    onSend(text.trim(), mode)
    setText("")
    textareaRef.current?.focus()
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
              title="文件上传需要后端支持"
              disabled
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>
          {busy ? (
            <Button size="icon" variant="destructive" onClick={onAbort} className="h-8 w-8 rounded-full">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!text.trim()}
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

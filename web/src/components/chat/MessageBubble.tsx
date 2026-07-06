import { Copy, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Message } from "@/types"
import { cn } from "@/lib/utils"

interface MessageBubbleProps {
  message: Message
  onCopy?: () => void
}

function preview(value: unknown) {
  if (value === undefined || value === null || value === "") return ""
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return text.length > 600 ? `${text.slice(0, 600)}...` : text
}

export function MessageBubble({ message, onCopy }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const toolParts = message.parts?.filter((part) => part.type === "tool") ?? []
  const fileParts = message.parts?.filter((part) => part.type === "file") ?? []

  return (
    <div className={cn("group flex gap-3 py-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <span className="text-xs font-bold">AI</span>}
      </div>
      <div className={cn("flex max-w-[85%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "relative rounded-2xl px-4 py-2.5",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {!isUser && onCopy && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute -right-9 top-0 h-7 w-7 opacity-0 group-hover:opacity-100"
              onClick={onCopy}
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content || (isUser ? "" : "...")}</div>
          {fileParts.length > 0 && (
            <div className="mt-3 grid gap-2">
              {fileParts.map((part) => (
                <div key={part.id} className="rounded-md border bg-background/70 p-2 text-xs">
                  <div className="font-medium">{part.filename ?? "附件"}</div>
                  <div className="text-muted-foreground">{part.mime ?? "unknown"}</div>
                  {part.mime?.startsWith("image/") && part.url && (
                    <img src={part.url} alt={part.filename ?? "附件图片"} className="mt-2 max-h-48 rounded border object-contain" />
                  )}
                  {part.content && !part.mime?.startsWith("image/") && (
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                      {preview(part.content)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
          {toolParts.length > 0 && (
            <div className="mt-3 space-y-2">
              {toolParts.map((part) => (
                <div key={part.id} className="rounded-md border bg-background/70 p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    <span>工具：{part.tool ?? "unknown"}</span>
                    {part.state?.status && <span className="text-muted-foreground">状态：{part.state.status}</span>}
                  </div>
                  {preview(part.state?.input) && (
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                      {preview(part.state?.input)}
                    </pre>
                  )}
                  {part.state?.error && (
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 text-destructive">
                      {part.state.error}
                    </pre>
                  )}
                  {preview(part.state?.output) && (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                      {preview(part.state?.output)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {message.thinking && (
          <div className="max-w-full rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            <strong>Thinking:</strong> {message.thinking}
          </div>
        )}
      </div>
    </div>
  )
}

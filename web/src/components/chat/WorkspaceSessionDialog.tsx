import { type FormEvent, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useNewChat } from "@/hooks/useNewChat"
import { useAppState } from "@/stores/appStore"

interface WorkspaceSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultWorkspace?: string | null
}

function normalizeDirectory(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "") || "/"
}

function isWithinDirectory(directory: string, root: string) {
  const normalizedDirectory = normalizeDirectory(directory)
  const normalizedRoot = normalizeDirectory(root)
  if (!normalizedDirectory || !normalizedRoot) return true
  return normalizedDirectory === normalizedRoot || normalizedDirectory.startsWith(`${normalizedRoot}/`)
}

export function WorkspaceSessionDialog({ open, onOpenChange, defaultWorkspace }: WorkspaceSessionDialogProps) {
  const newChat = useNewChat()
  const { status } = useAppState()
  const serveDirectory = status.directory ?? status.workspaceRoot
  const [workspace, setWorkspace] = useState(defaultWorkspace ?? "")
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setWorkspace(defaultWorkspace ?? "")
      setTitle("")
      setError(null)
    }
  }, [defaultWorkspace, open])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const directory = workspace.trim()
    if (!directory) {
      setError("请输入工作区路径")
      return
    }
    if (serveDirectory && !isWithinDirectory(directory, serveDirectory)) {
      setError(`当前 mimo serve 只允许选择 ${serveDirectory} 以内的目录。请改选该目录下的项目，或用更高层目录重启 WebUI/mimo serve。`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await newChat({ directory, title: title.trim() || undefined })
      onOpenChange(false)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError)
      setError(
        message.includes("directory must be within the server's working directory")
          ? `当前 mimo serve 只允许选择 ${serveDirectory ?? "其启动目录"} 以内的目录。请改选该目录下的项目，或用更高层目录重启 WebUI/mimo serve。`
          : message,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>新建工作区会话</DialogTitle>
          <DialogDescription>选择代码所在目录后再创建会话，后续工具调用会在这个工作区执行。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="workspace-path">工作区路径</Label>
          <Input
            id="workspace-path"
            value={workspace}
            onChange={(event) => setWorkspace(event.target.value)}
            placeholder="/vol2/1000/下载/mimo/mimo-code-webui"
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">当前可选范围：{serveDirectory ?? "未知"}</span>
            {serveDirectory && (
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={() => setWorkspace(serveDirectory)}>
                使用当前目录
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="session-title">会话标题（可选）</Label>
          <Input id="session-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：修复登录流程" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button type="submit" disabled={submitting}>
            创建
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

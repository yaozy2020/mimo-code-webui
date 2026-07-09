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
  onSuccess?: () => void
}

export function WorkspaceSessionDialog({ open, onOpenChange, defaultWorkspace, onSuccess }: WorkspaceSessionDialogProps) {
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
    setSubmitting(true)
    setError(null)
    try {
      await newChat({ directory, title: title.trim() || undefined })
      onSuccess?.()
      onOpenChange(false)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError)
      setError(
        message.includes("directory must be within the server's working directory")
          ? "该目录被 MiMo 拒绝访问。请确认路径存在，或重启 WebUI 后再试。"
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
          <DialogDescription>
            选择代码所在目录后再创建会话，WebUI 会为该目录启动或复用独立的 mimo serve。
          </DialogDescription>
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="truncate">默认实例目录：{serveDirectory ?? "未知"}；其他目录会走独立项目实例</span>
              {serveDirectory && (
                <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-2" onClick={() => setWorkspace(serveDirectory)}>
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

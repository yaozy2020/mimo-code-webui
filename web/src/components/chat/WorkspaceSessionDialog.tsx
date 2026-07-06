import { type FormEvent, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useNewChat } from "@/hooks/useNewChat"

interface WorkspaceSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultWorkspace?: string | null
}

export function WorkspaceSessionDialog({ open, onOpenChange, defaultWorkspace }: WorkspaceSessionDialogProps) {
  const newChat = useNewChat()
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
      onOpenChange(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
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

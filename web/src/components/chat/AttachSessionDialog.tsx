import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { discoverSessions, getSession } from "@/api/session"
import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import type { Session } from "@/types"

interface AttachSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function sessionTitle(session: Session) {
  return session.title && !session.title.startsWith("New session - ") ? session.title : "空会话"
}

export function AttachSessionDialog({ open, onOpenChange }: AttachSessionDialogProps) {
  const dispatch = useAppDispatch()
  const { attachedSessionIDs, currentWorkspace, ownedSessionIDs } = useAppState()
  const visibleIDs = new Set([...attachedSessionIDs, ...ownedSessionIDs])
  const [sessionID, setSessionID] = useState("")
  const [workspace, setWorkspace] = useState(currentWorkspace ?? "")
  const [discovered, setDiscovered] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setWorkspace(currentWorkspace ?? "")
      setError(null)
    }
  }, [currentWorkspace, open])

  const attach = (session: Session) => {
    dispatch({ type: "ADD_SESSION", session, owned: false })
    dispatch({ type: "ATTACH_SESSION", sessionID: session.id })
    dispatch({ type: "SET_CURRENT_WORKSPACE", workspace: (session.directory ?? workspace.trim()) || null })
    dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
    onOpenChange(false)
  }

  const handleFind = async () => {
    const id = sessionID.trim()
    if (!id) {
      setError("请输入会话 ID")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const knownSessions = discovered.length > 0 ? discovered : await discoverSessions()
      const known = knownSessions.find((session) => session.id === id)
      if (known) {
        attach(known)
        return
      }
      attach(await getSession(id, workspace.trim() || undefined))
    } catch (findError) {
      const message = findError instanceof Error ? findError.message : String(findError)
      setError(
        message.includes("directory must be within the server's working directory")
          ? "这个会话属于当前 mimo serve 不允许访问的工作区。请用更高层 MIMO_WORKSPACE_ROOT 重启 WebUI 托管的 mimo serve，或连接一个以该目录启动的 mimo serve。"
          : message,
      )
    } finally {
      setLoading(false)
    }
  }

  const handleBrowse = async () => {
    setLoading(true)
    setError(null)
    try {
      setDiscovered(await discoverSessions())
    } catch (browseError) {
      setError(browseError instanceof Error ? browseError.message : String(browseError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>接入已有会话</DialogTitle>
          <DialogDescription>只有明确接入的 MiMo 会话才会出现在 WebUI 侧边栏；跨工作区会话需要当前 mimo serve 有权限访问原目录。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="attach-session-id">会话 ID</Label>
            <div className="flex gap-2">
              <Input id="attach-session-id" value={sessionID} onChange={(event) => setSessionID(event.target.value)} placeholder="输入 ses_... 会话 ID" />
              <Button type="button" onClick={handleFind} disabled={loading} className="gap-1">
                <Search className="h-4 w-4" />
                查找
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="attach-workspace">工作区路径（可选）</Label>
            <Input
              id="attach-workspace"
              value={workspace}
              onChange={(event) => setWorkspace(event.target.value)}
              placeholder="跨工作区会话建议填写原工作区路径"
            />
          </div>
        </div>
        <Button type="button" variant="outline" onClick={handleBrowse} disabled={loading}>
          浏览现有 MiMo 会话
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {discovered.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-lg border p-2">
            {discovered.map((session) => {
              const visible = visibleIDs.has(session.id)
              return (
                <div key={session.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{sessionTitle(session)}</div>
                    <div className="truncate text-xs text-muted-foreground">{session.id}</div>
                    <div className="truncate text-xs text-muted-foreground">{session.directory ?? "未绑定工作区"}</div>
                  </div>
                  <Button type="button" size="sm" variant={visible ? "secondary" : "default"} disabled={visible} onClick={() => attach(session)}>
                    {visible ? "已接入" : "接入"}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            关闭
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  )
}

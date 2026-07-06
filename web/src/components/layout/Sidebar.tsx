import { useState } from "react"
import { Clock3, Link, MessageSquarePlus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AttachSessionDialog } from "@/components/chat/AttachSessionDialog"
import { WorkspaceSessionDialog } from "@/components/chat/WorkspaceSessionDialog"
import { useSessions } from "@/hooks/useSessions"
import { useAppState } from "@/stores/appStore"
import { cn } from "@/lib/utils"

function formatSessionTime(updated?: number) {
  if (!updated) return "暂无活动"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(updated)
}

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function SessionList({ onSelect }: { onSelect?: () => void }) {
  const { sessions, activeSessionID, setActive, remove } = useSessions()
  const { agentStatus, attachedSessionIDs, currentWorkspace, ownedSessionIDs, pendingPermissions, pendingQuestions, todos, sessionDiffs } = useAppState()
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [attachDialogOpen, setAttachDialogOpen] = useState(false)
  const activeSession = sessions.find((session) => session.id === activeSessionID)
  const defaultWorkspace = activeSession?.directory ?? currentWorkspace

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 p-4 backdrop-blur">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">工作区</h2>
          <p className="mt-1 text-lg font-semibold">会话</p>
          <p className="mt-1 max-w-44 truncate text-xs text-muted-foreground" title={defaultWorkspace ?? undefined}>{defaultWorkspace ?? "未选择工作区"}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => setAttachDialogOpen(true)} title="接入已有会话">
            <Link className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setWorkspaceDialogOpen(true)} title="新建工作区会话">
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {sessions.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            暂无已接入会话。请先新建工作区会话，或接入已有 MiMo 会话。
          </div>
        )}
        {sessions.map((session) => {
          const active = activeSessionID === session.id
          const owned = ownedSessionIDs.includes(session.id)
          const attached = attachedSessionIDs.includes(session.id)
          const status = agentStatus[session.id]?.state
          const permissionCount = pendingPermissions[session.id]?.length ?? 0
          const questionCount = pendingQuestions[session.id]?.length ?? 0
          const todoCount = todos[session.id]?.length ?? 0
          const diffCount = sessionDiffs[session.id]?.length ?? 0
          return (
            <div
              key={session.id}
              className={cn(
                "group flex items-start gap-2 rounded-xl border border-transparent p-2.5 transition-colors hover:bg-muted/80",
                active && "border-border bg-background shadow-sm ring-1 ring-primary/15",
              )}
            >
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setActive(session.id)
                  onSelect?.()
                }}
              >
                <div className={cn("truncate text-sm", active && "font-medium")}>
                  <span title={session.title}>{session.title && !session.title.startsWith("New session - ") ? session.title : "空会话"}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3 w-3" />
                  <span className="truncate">{formatSessionTime(session.time?.updated ?? session.time?.created)}</span>
                </div>
                {session.directory && <div className="mt-1 truncate text-xs text-muted-foreground" title={session.directory}>{session.directory}</div>}
                {(status || permissionCount > 0 || questionCount > 0 || todoCount > 0 || diffCount > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {status === "busy" && <Badge variant="secondary">运行中</Badge>}
                    {status === "waiting_for_permission" && <Badge variant="destructive">等待授权</Badge>}
                    {status === "waiting_for_question" && <Badge variant="destructive">等待回答</Badge>}
                    {permissionCount > 0 && <Badge variant="outline">授权 {permissionCount}</Badge>}
                    {questionCount > 0 && <Badge variant="outline">提问 {questionCount}</Badge>}
                    {todoCount > 0 && <Badge variant="outline">任务 {todoCount}</Badge>}
                    {diffCount > 0 && <Badge variant="outline">变更 {diffCount}</Badge>}
                  </div>
                )}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 opacity-100 sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                onClick={() => remove(session.id, { deleteRemote: owned || !attached })}
                title={owned || !attached ? "删除会话" : "从 WebUI 移除"}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )
        })}
      </div>
      <WorkspaceSessionDialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen} defaultWorkspace={defaultWorkspace} />
      <AttachSessionDialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen} />
    </>
  )
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      <aside className="hidden h-full w-72 shrink-0 flex-col border-r bg-background/70 shadow-sm backdrop-blur md:flex">
        <SessionList />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col border-r bg-background shadow-2xl">
            <SessionList onSelect={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}

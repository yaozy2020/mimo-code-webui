import { useState } from "react"
import { Clock3, GitFork, Link, MessageSquarePlus, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AttachSessionDialog } from "@/components/chat/AttachSessionDialog"
import { WorkspaceSessionDialog } from "@/components/chat/WorkspaceSessionDialog"
import { getSessionSource } from "@/components/chat/sessionSource"
import { useSessions } from "@/hooks/useSessions"
import { useAppState } from "@/stores/appStore"
import { cn } from "@/lib/utils"
import { formatActivityTime } from "@/lib/time"
import type { Message } from "@/types"

function latestUserMessageID(messages: Message[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.id
}

interface SidebarProps {
  open: boolean
  onClose: () => void
  desktopOpen?: boolean
}

function SessionList({ isMobile = false, onSelect, onClose }: { isMobile?: boolean; onSelect?: () => void; onClose?: () => void }) {
  const { sessions, activeSessionID, setActive, remove, rename, fork } = useSessions()
  const { agentStatus, attachedSessionIDs, currentWorkspace, ownedSessionIDs, pendingPermissions, pendingQuestions, todos, sessionDiffs, messages } = useAppState()
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [attachDialogOpen, setAttachDialogOpen] = useState(false)
  const activeSession = sessions.find((session) => session.id === activeSessionID)
  const defaultWorkspace = activeSession?.directory ?? currentWorkspace

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-3 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xs font-medium text-muted-foreground">工作区</h2>
            <p className="mt-0.5 truncate text-sm font-semibold" title={defaultWorkspace ?? undefined}>{defaultWorkspace ?? "未选择工作区"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">会话 {sessions.length}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-md" onClick={() => setAttachDialogOpen(true)} title="接入已有会话">
              <Link className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-md" onClick={() => setWorkspaceDialogOpen(true)} title="新建工作区会话">
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 overflow-auto p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {sessions.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
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
          const source = getSessionSource(session.id, ownedSessionIDs, attachedSessionIDs, session.directory, currentWorkspace)
          const latestMessageID = latestUserMessageID(messages[session.id] || [])
          const removeTitle = owned || !attached ? "删除会话" : "移除接入"
          return (
            <div
              key={session.id}
              className={cn(
                "group flex items-start gap-2 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:bg-muted/70",
                active && "border-border/80 bg-muted/50 shadow-sm",
              )}
            >
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setActive(session.id)
                  onSelect?.()
                }}
              >
                <div className={cn("truncate text-sm leading-5", active && "font-medium")}>
                  <span title={session.title}>{session.title && !session.title.startsWith("New session - ") ? session.title : "空会话"}</span>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{formatActivityTime(session.time?.updated ?? session.time?.created)}</span>
                </div>
                {session.directory && <div className="mt-0.5 truncate text-xs text-muted-foreground" title={session.directory}>{session.directory}</div>}
                {(source.external || status || permissionCount > 0 || questionCount > 0 || todoCount > 0 || diffCount > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {source.external && <Badge variant="secondary">{source.label}</Badge>}
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
              <div
                className={cn(
                  "flex shrink-0 gap-0.5 transition-opacity",
                  isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                )}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-md"
                  onClick={() => {
                    const nextTitle = window.prompt("重命名会话", session.title && !session.title.startsWith("New session - ") ? session.title : "")
                    if (nextTitle?.trim()) void rename(session.id, nextTitle.trim())
                  }}
                  title="重命名会话"
                  aria-label="重命名会话"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                {latestMessageID && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-md"
                    onClick={() => void fork(session.id, latestMessageID)}
                    title="从最新用户消息分叉"
                    aria-label="从最新用户消息分叉"
                  >
                    <GitFork className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive"
                  onClick={() => remove(session.id, { deleteRemote: owned || !attached })}
                  title={removeTitle}
                  aria-label={removeTitle}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      <WorkspaceSessionDialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen} defaultWorkspace={defaultWorkspace} onSuccess={onClose} />
      <AttachSessionDialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen} onSuccess={onClose} />
    </>
  )
}

export function Sidebar({ open, onClose, desktopOpen = true }: SidebarProps) {
  return (
    <>
      {desktopOpen && (
        <aside className="hidden h-full w-[300px] shrink-0 flex-col border-r border-border/60 bg-background/95 md:flex">
          <SessionList />
        </aside>
      )}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col border-r border-border/60 bg-background shadow-2xl">
            <SessionList isMobile onSelect={onClose} onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}

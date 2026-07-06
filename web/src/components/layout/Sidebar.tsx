import { Clock3, MessageSquarePlus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  const { sessions, activeSessionID, create, setActive, remove } = useSessions()
  const { agentStatus, pendingPermissions, pendingQuestions, todos, sessionDiffs } = useAppState()

  return (
    <>
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">工作区</h2>
          <p className="mt-1 text-lg font-semibold">会话</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => create()} title="新建会话">
          <MessageSquarePlus className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {sessions.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            暂无会话。可以从输入框开始一次新的 MiMo Code 任务。
          </div>
        )}
        {sessions.map((session) => {
          const active = activeSessionID === session.id
          const status = agentStatus[session.id]?.state
          const permissionCount = pendingPermissions[session.id]?.length ?? 0
          const questionCount = pendingQuestions[session.id]?.length ?? 0
          const todoCount = todos[session.id]?.length ?? 0
          const diffCount = sessionDiffs[session.id]?.length ?? 0
          return (
            <div
              key={session.id}
              className={cn(
                "group flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-muted",
                active && "bg-muted ring-1 ring-border",
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
                  {session.title && !session.title.startsWith("New session - ") ? session.title : "空会话"}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3 w-3" />
                  <span className="truncate">{formatSessionTime(session.time?.updated ?? session.time?.created)}</span>
                </div>
                {session.directory && <div className="mt-1 truncate text-xs text-muted-foreground">{session.directory}</div>}
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
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                onClick={() => remove(session.id)}
                title="删除会话"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )
        })}
      </div>
    </>
  )
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      <aside className="hidden h-full w-72 shrink-0 flex-col border-r bg-muted/30 md:flex">
        <SessionList />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r bg-background shadow-xl">
            <SessionList onSelect={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}

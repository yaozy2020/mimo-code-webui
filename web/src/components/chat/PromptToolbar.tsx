import { CheckCircle2, Circle, GitBranch, Loader2, ScrollText, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAppState } from "@/stores/appStore"

const statusLabels = {
  idle: "空闲",
  busy: "运行中",
  waiting_for_permission: "等待授权",
  waiting_for_question: "等待回答",
}

interface PromptToolbarProps {
  sessionID: string
  onOpenFileChanges?: () => void
}

export function PromptToolbar({ sessionID, onOpenFileChanges }: PromptToolbarProps) {
  const { agentStatus, contextUsage, gitStatus, todos } = useAppState()
  const { sessionDiffs } = useAppState()
  const status = agentStatus[sessionID]
  const statusState = status?.state ?? "idle"
  const usage = contextUsage[sessionID]
  const todoList = todos[sessionID] || []
  const diffList = sessionDiffs[sessionID] || []
  const completedTodos = todoList.filter((todo) => todo.completed || todo.status === "completed").length
  const additions = diffList.reduce((sum, diff) => sum + diff.additions, 0)
  const deletions = diffList.reduce((sum, diff) => sum + diff.deletions, 0)
  const contextPercent =
    usage?.usedTokens !== undefined && usage.totalTokens ? Math.round((usage.usedTokens / usage.totalTokens) * 100) : undefined

  return (
    <div className="border-b bg-background/95 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusState === "busy" ? "default" : "secondary"} className="gap-1 capitalize">
            {statusState === "busy" && <Loader2 className="h-3 w-3 animate-spin" />}
            {(statusState === "waiting_for_permission" || statusState === "waiting_for_question") && (
              <Shield className="h-3 w-3" />
            )}
          {statusLabels[statusState]}
        </Badge>
        {contextPercent !== undefined && (
          <Badge variant="outline" className="gap-1">
            <ScrollText className="h-3 w-3" />
            上下文 {contextPercent}%
          </Badge>
        )}
        {(gitStatus.added > 0 || gitStatus.modified > 0 || gitStatus.deleted > 0) && (
          <Badge variant="outline" className="gap-1">
            <GitBranch className="h-3 w-3" />
            +{gitStatus.added} ~{gitStatus.modified} -{gitStatus.deleted}
          </Badge>
        )}
        {todoList.length > 0 && <Badge variant="outline">任务 {completedTodos}/{todoList.length}</Badge>}
        {diffList.length > 0 && (
          <button type="button" onClick={onOpenFileChanges} disabled={!onOpenFileChanges}>
            <Badge variant="outline" className="gap-1 hover:bg-muted">
            <GitBranch className="h-3 w-3" />
            变更 {diffList.length} 文件 +{additions} -{deletions}
            </Badge>
          </button>
        )}
      </div>
      {todoList.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 text-xs text-muted-foreground">
          {todoList.slice(0, 5).map((todo, index) => (
            <div
              key={todo.id ?? `${todo.content}-${index}`}
              className="flex max-w-64 shrink-0 items-center gap-1 rounded-md border bg-muted/40 px-2 py-1"
            >
              {todo.completed || todo.status === "completed" ? (
                <CheckCircle2 className="h-3 w-3 text-green-600" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
              <span className="truncate">{todo.content}</span>
            </div>
          ))}
        </div>
      )}
      {diffList.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 text-xs text-muted-foreground">
          {diffList.slice(0, 5).map((diff) => (
            <button
              key={diff.file}
              type="button"
              onClick={onOpenFileChanges}
              className="max-w-72 shrink-0 truncate rounded-md border bg-muted/40 px-2 py-1 text-left hover:bg-muted"
            >
              {diff.status ?? "modified"} {diff.file} (+{diff.additions} -{diff.deletions})
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

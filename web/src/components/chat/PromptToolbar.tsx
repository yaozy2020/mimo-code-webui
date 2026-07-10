import { useState } from "react"
import { CheckCircle2, Circle, ChevronDown, ChevronRight, GitBranch, Loader2, ScrollText, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAppState } from "@/stores/appStore"
import { promptToolbarDiffRowClassName, promptToolbarRowClassName } from "./promptToolbarDisplay"
import { getSessionSource } from "./sessionSource"
import { isTodoDone, isTodoRunning, todoDisplayText } from "./todoDisplay"

const statusLabels = {
  idle: "空闲",
  busy: "运行中",
  waiting_for_permission: "等待授权",
  waiting_for_question: "等待回答",
}

function formatTokenCount(tokens: number) {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens >= 10000 ? 1 : 0)}K`
  return String(tokens)
}

interface PromptToolbarProps {
  sessionID: string
  onOpenFileChanges?: () => void
}

export function PromptToolbar({ sessionID, onOpenFileChanges }: PromptToolbarProps) {
  const { agentStatus, attachedSessionIDs, contextUsage, currentWorkspace, gitStatus, ownedSessionIDs, sessionDiffs, sessions, todos } = useAppState()
  const [todoExpanded, setTodoExpanded] = useState(false)
  const status = agentStatus[sessionID]
  const statusState = status?.state ?? "idle"
  const usage = contextUsage[sessionID]
  const todoList = todos[sessionID] || []
  const diffList = sessionDiffs[sessionID] || []
  const completedTodos = todoList.filter(isTodoDone).length
  const additions = diffList.reduce((sum, diff) => sum + diff.additions, 0)
  const deletions = diffList.reduce((sum, diff) => sum + diff.deletions, 0)
  const contextLabel = usage?.usedTokens !== undefined ? `上下文 ${formatTokenCount(usage.usedTokens)}` : undefined
  const session = sessions.find((item) => item.id === sessionID)
  const source = getSessionSource(sessionID, ownedSessionIDs, attachedSessionIDs, session?.directory, currentWorkspace)

  return (
    <div className="border-b border-border/60 bg-background/85 px-2 py-1.5 backdrop-blur sm:px-4">
      <div className={promptToolbarRowClassName}>
        <Badge variant={statusState === "busy" ? "default" : "secondary"} className="shrink-0 gap-1 capitalize text-[10px]">
            {statusState === "busy" && <Loader2 className="h-3 w-3 animate-spin" />}
            {(statusState === "waiting_for_permission" || statusState === "waiting_for_question") && (
              <Shield className="h-3 w-3" />
            )}
          {statusLabels[statusState]}
        </Badge>
        {contextLabel && (
          <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
            <ScrollText className="h-3 w-3" />
            {contextLabel}
          </Badge>
        )}
        {source.external && (
          <Badge variant="secondary" className="shrink-0 text-[10px]" title={source.description}>
            {source.label}
          </Badge>
        )}
        {(gitStatus.added > 0 || gitStatus.modified > 0 || gitStatus.deleted > 0) && (
          <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
            <GitBranch className="h-3 w-3" />
            +{gitStatus.added} ~{gitStatus.modified} -{gitStatus.deleted}
          </Badge>
        )}
        {todoList.length > 0 && (
          <button type="button" onClick={() => setTodoExpanded(!todoExpanded)}>
            <Badge variant={todoExpanded ? "default" : "outline"} className="shrink-0 gap-1 hover:bg-muted text-[10px]">
              {todoExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              任务 {completedTodos}/{todoList.length}
            </Badge>
          </button>
        )}
        {diffList.length > 0 && (
          <button type="button" onClick={onOpenFileChanges} disabled={!onOpenFileChanges}>
            <Badge variant="outline" className="shrink-0 gap-1 hover:bg-muted text-[10px]">
            <GitBranch className="h-3 w-3" />
            变更 {diffList.length} 文件 +{additions} -{deletions}
            </Badge>
          </button>
        )}
      </div>
      {todoExpanded && todoList.length > 0 && (
        <div className="mt-2 max-h-[30vh] space-y-1 overflow-y-auto text-xs">
          {todoList.map((todo, index) => (
            <div
              key={todo.id ?? `${todo.content}-${index}`}
              className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5"
            >
              {isTodoDone(todo) ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
              ) : isTodoRunning(todo) ? (
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 break-words leading-relaxed text-foreground/90">{todoDisplayText(todo)}</span>
            </div>
          ))}
        </div>
      )}
      {diffList.length > 0 && (
        <div className={promptToolbarDiffRowClassName}>
          {diffList.slice(0, 5).map((diff) => (
            <button
              key={diff.file}
              type="button"
              onClick={onOpenFileChanges}
              className="max-w-[78vw] shrink-0 truncate rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-left hover:bg-muted sm:max-w-72"
            >
              {diff.status ?? "modified"} {diff.file} (+{diff.additions} -{diff.deletions})
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

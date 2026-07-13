import { useState } from "react"
import { Link, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FileChangesPanel } from "@/components/files/FileChangesPanel"
import { useAppState } from "@/stores/appStore"
import { AttachSessionDialog } from "./AttachSessionDialog"
import { InputBar } from "./InputBar"
import { MessageList } from "./MessageList"
import { PermissionDialog } from "./PermissionDialog"
import { PromptToolbar } from "./PromptToolbar"
import { QuestionDialog } from "./QuestionDialog"
import { WorkspaceSessionDialog } from "./WorkspaceSessionDialog"
import type { SlashAction } from "./slashCommands"
import { useActiveSessionData } from "./useActiveSessionData"
import { usePromptController } from "./usePromptController"

interface ChatAreaProps {
  onSlashAction?: (action: SlashAction) => void
}

export function ChatArea({ onSlashAction }: ChatAreaProps) {
  const { activeSessionID, currentWorkspace, messages, sessionDiffs, sessions } = useAppState()
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [attachDialogOpen, setAttachDialogOpen] = useState(false)
  const [showFileChanges, setShowFileChanges] = useState(false)
  const activeSession = activeSessionID ? sessions.find((session) => session.id === activeSessionID) : undefined
  const activeDirectory = activeSession?.directory

  useActiveSessionData({ activeSessionID, activeDirectory })
  const { busy, handleSend, handleCommand, handleAbort } = usePromptController({ activeSessionID, activeDirectory })

  const sessionMessages = activeSessionID ? messages[activeSessionID] || [] : []

  const handleSlashAction = (action: SlashAction) => {
    if (action === "new-session") {
      setWorkspaceDialogOpen(true)
      return
    }
    onSlashAction?.(action)
  }

  if (!activeSessionID) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 overflow-auto px-4 py-8 text-center text-muted-foreground">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">选择工作区开始</h2>
          <p className="mt-2 max-w-xl text-sm">
            新建会话前先选择代码目录，或明确接入已有 MiMo 会话；WebUI 不再自动打开当前 CLI 会话。
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => setWorkspaceDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            新建工作区会话
          </Button>
          <Button variant="outline" onClick={() => setAttachDialogOpen(true)} className="gap-2">
            <Link className="h-4 w-4" />
            接入已有会话
          </Button>
        </div>
        <WorkspaceSessionDialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen} defaultWorkspace={currentWorkspace} />
        <AttachSessionDialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen} />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {activeSessionID && (
          <PromptToolbar sessionID={activeSessionID} onAbort={handleAbort} onOpenFileChanges={() => setShowFileChanges(true)} />
        )}
        {sessionMessages.length === 0 && !busy && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-auto px-4 py-8 text-center text-muted-foreground">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">MiMo Code</h2>
              <p className="mt-1 text-sm">用于编码、规划、搜索和审批的 MiMo 代理工作台。</p>
            </div>
            <div className="grid w-full max-w-2xl gap-2 md:grid-cols-3">
              {["解释这个项目", "规划一次安全重构", "查找高风险代码路径"].map((label) => (
                <Button key={label} variant="outline" onClick={() => handleSend(label, "plan")}>
                  {label}
                </Button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setWorkspaceDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              新建工作区会话
            </Button>
          </div>
        )}
        {(sessionMessages.length > 0 || busy) && <MessageList />}
        <PermissionDialog />
        <QuestionDialog />
        <InputBar onSend={handleSend} onCommand={handleCommand} onAbort={handleAbort} onSlashAction={handleSlashAction} busy={busy} />
        <WorkspaceSessionDialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen} defaultWorkspace={activeDirectory} />
      </div>
      {activeSessionID && showFileChanges && (sessionDiffs[activeSessionID]?.length ?? 0) > 0 && (
        <FileChangesPanel key={activeSessionID} diffs={sessionDiffs[activeSessionID]} directory={activeDirectory} onClose={() => setShowFileChanges(false)} />
      )}
    </div>
  )
}

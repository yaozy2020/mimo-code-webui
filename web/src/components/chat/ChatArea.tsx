import { useCallback, useEffect, useState } from "react"
import { Link, Plus } from "lucide-react"
import { fetchRuntimeModels, runLocalPrompt, runLocalPromptStream } from "@/api/client"
import { abortSession, modelSelectionToPayload, sendPrompt } from "@/api/message"
import { getMessages, getSessionDiff, getTodos } from "@/api/session"
import { Button } from "@/components/ui/button"
import { FileChangesPanel } from "@/components/files/FileChangesPanel"
import { createClientID } from "@/lib/utils"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import type { Message } from "@/types"
import { AttachSessionDialog } from "./AttachSessionDialog"
import { InputBar, type PendingAttachment, type PromptMode } from "./InputBar"
import { MessageList } from "./MessageList"
import { PermissionDialog } from "./PermissionDialog"
import { PromptToolbar } from "./PromptToolbar"
import { QuestionDialog } from "./QuestionDialog"
import { WorkspaceSessionDialog } from "./WorkspaceSessionDialog"
import { chooseModelRoute } from "./modelRouting"
import type { SlashAction } from "./slashCommands"

const MESSAGE_REFRESH_INTERVAL_MS = 3000
function latestUserMessageID(messages: Message[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.id
}

interface ChatAreaProps {
  onSlashAction?: (action: SlashAction) => void
}

export function ChatArea({ onSlashAction }: ChatAreaProps) {
  const dispatch = useAppDispatch()
  const { activeSessionID, agentStatus, currentWorkspace, messages, sessionDiffs, sessions, settings } = useAppState()
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [attachDialogOpen, setAttachDialogOpen] = useState(false)
  const [showFileChanges, setShowFileChanges] = useState(false)
  const activeSession = activeSessionID ? sessions.find((session) => session.id === activeSessionID) : undefined
  const activeDirectory = activeSession?.directory

  const busy = activeSessionID ? agentStatus[activeSessionID]?.state === "busy" : false

  // Load historical messages whenever the active session changes
  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false

    const load = async () => {
      try {
        const msgs = await getMessages(activeSessionID, 50, undefined, activeDirectory)
        if (cancelled) return
        dispatch({ type: "SET_MESSAGES", sessionID: activeSessionID, messages: msgs })
        const messageID = latestUserMessageID(msgs)
        if (messageID) {
          const diff = await getSessionDiff(activeSessionID, messageID, activeDirectory)
          if (!cancelled) dispatch({ type: "SET_SESSION_DIFF", sessionID: activeSessionID, diff })
        }
      } catch (error) {
        console.error("[ChatArea] failed to load messages:", error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [activeDirectory, activeSessionID, dispatch])

  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false

    const load = async () => {
      try {
        const todos = await getTodos(activeSessionID, activeDirectory)
        if (cancelled) return
        dispatch({ type: "SET_TODOS", sessionID: activeSessionID, todos })
      } catch (error) {
        console.error("[ChatArea] failed to load todos:", error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [activeDirectory, activeSessionID, dispatch])

  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false
    const refresh = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const [todos] = await Promise.all([
          getTodos(activeSessionID, activeDirectory),
        ])
        if (!cancelled) {
          dispatch({ type: "SET_TODOS", sessionID: activeSessionID, todos })
        }
        const msgs = await getMessages(activeSessionID, 50, undefined, activeDirectory)
        if (!cancelled) {
          const messageID = latestUserMessageID(msgs)
          if (messageID) {
            const diff = await getSessionDiff(activeSessionID, messageID, activeDirectory)
            if (!cancelled) dispatch({ type: "SET_SESSION_DIFF", sessionID: activeSessionID, diff })
          }
        }
      } catch (error) {
        console.error("[ChatArea] failed to refresh:", error)
      }
    }

    const interval = window.setInterval(refresh, MESSAGE_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeDirectory, activeSessionID, dispatch])

  const handleSend = useCallback(
    async (text: string, mode: PromptMode, attachments: PendingAttachment[] = []) => {
      if (!activeSessionID) return
      dispatch({
        type: "SET_AGENT_STATUS",
        sessionID: activeSessionID,
        status: { sessionID: activeSessionID, state: "busy" },
      })

      const promptText = text
      const attachmentText = attachments
        .filter((attachment) => typeof attachment.content === "string")
        .map((attachment) => `附件 ${attachment.filename}:\n${attachment.content}`)
        .join("\n\n")
      const promptParts = [
        ...(promptText ? [{ type: "text" as const, content: promptText }] : []),
        ...(attachmentText ? [{ type: "text" as const, content: attachmentText }] : []),
        ...attachments,
      ]

      const userMessage: Message = {
        id: createClientID("msg"),
        sessionID: activeSessionID,
        role: "user",
        content: text || attachments.map((attachment) => `附件：${attachment.filename}`).join("\n"),
        optimistic: true,
        parts: [
          ...(text ? [{ id: createClientID("part"), type: "text" as const, content: text }] : []),
          ...attachments.map((attachment) => ({
            id: attachment.id ?? createClientID("part"),
            type: "file" as const,
            mime: attachment.mime,
            filename: attachment.filename,
            url: attachment.url,
            content: attachment.content,
          })),
        ],
        time: { created: Date.now() },
      }
      dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: userMessage })

      try {
        const selectedModel = modelSelectionToPayload(settings.model)
        const runtimeModels = await fetchRuntimeModels()
        // Only models known by the running mimo serve should use the native route.
        // Backend/manual models that are not yet in mimo serve's runtime config are
        // routed through local-run (direct OpenAI-compatible API) so they still work.
        const nativeKeys = new Set(runtimeModels.map((m) => `${m.provider}/${m.id}`))
        const route = chooseModelRoute({ selectedModel, nativeModelKeys: nativeKeys })

        if (route === "local-run") {
          const assistantMessageID = createClientID("msg")
          dispatch({
            type: "ADD_MESSAGE",
            sessionID: activeSessionID,
            message: {
              id: assistantMessageID,
              sessionID: activeSessionID,
              role: "assistant",
              content: "",
              time: { created: Date.now() },
            },
          })

          let receivedDelta = false
          try {
            await runLocalPromptStream(
              { model: settings.model, prompt: text || promptParts.map((p) => p.content).join("\n") },
              {
                onDelta: (delta) => {
                  receivedDelta = true
                  dispatch({ type: "APPEND_MESSAGE_CONTENT", sessionID: activeSessionID, messageID: assistantMessageID, content: delta })
                },
              },
            )
          } catch (streamError) {
            if (!receivedDelta) {
              const result = await runLocalPrompt({ model: settings.model, prompt: text || promptParts.map((p) => p.content).join("\n") })
              dispatch({
                type: "SET_MESSAGE_CONTENT",
                sessionID: activeSessionID,
                messageID: assistantMessageID,
                content: result.text || "（模型没有返回文本）",
              })
            } else {
              throw streamError
            }
          }

          dispatch({
            type: "SET_AGENT_STATUS",
            sessionID: activeSessionID,
            status: { sessionID: activeSessionID, state: "idle" },
          })
          return
        }

        await sendPrompt(activeSessionID, {
          agent: mode,
          model: settings.model,
          parts: promptParts,
          directory: activeDirectory,
        })
      } catch (error) {
        console.error("[ChatArea] failed to send prompt:", error)
        dispatch({
          type: "SET_AGENT_STATUS",
          sessionID: activeSessionID,
          status: { sessionID: activeSessionID, state: "idle" },
        })
        const errorMessage: Message = {
          id: createClientID("msg"),
          sessionID: activeSessionID,
          role: "assistant",
          content: `[Error: ${(error as Error).message}]`,
          time: { created: Date.now() },
        }
        dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: errorMessage })
      }
    },
    [activeDirectory, activeSessionID, busy, dispatch, settings.model, currentWorkspace],
  )

  const handleAbort = useCallback(async () => {
    if (!activeSessionID) return
    await abortSession(activeSessionID, activeDirectory)
  }, [activeDirectory, activeSessionID])

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
          <PromptToolbar sessionID={activeSessionID} onOpenFileChanges={() => setShowFileChanges(true)} />
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
        <InputBar onSend={handleSend} onAbort={handleAbort} onSlashAction={handleSlashAction} busy={busy} />
        <WorkspaceSessionDialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen} defaultWorkspace={activeDirectory} />
      </div>
      {activeSessionID && showFileChanges && (sessionDiffs[activeSessionID]?.length ?? 0) > 0 && (
        <FileChangesPanel diffs={sessionDiffs[activeSessionID]} onClose={() => setShowFileChanges(false)} />
      )}
    </div>
  )
}

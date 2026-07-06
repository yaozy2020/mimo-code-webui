import { useCallback, useEffect, useState } from "react"
import { Link, Plus } from "lucide-react"
import { fetchRuntimeModels, runLocalPrompt } from "@/api/client"
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

const ASSISTANT_SYNC_ATTEMPTS = 30
const ASSISTANT_SYNC_INTERVAL_MS = 1500
const MESSAGE_REFRESH_INTERVAL_MS = 3000

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForAssistantMessages(sessionID: string, knownAssistantIDs: Set<string>, directory?: string) {
  for (let attempt = 0; attempt < ASSISTANT_SYNC_ATTEMPTS; attempt += 1) {
    await sleep(ASSISTANT_SYNC_INTERVAL_MS)
    const msgs = await getMessages(sessionID, 50, undefined, directory)
    const assistantMessages = msgs.filter(
      (message) => message.role === "assistant" && !knownAssistantIDs.has(message.id) && Boolean(message.content?.trim()),
    )
    if (assistantMessages.length > 0) {
      return assistantMessages
    }
  }
  return null
}

function latestUserMessageID(messages: Message[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.id
}

export function ChatArea() {
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
        const [msgs, todos] = await Promise.all([
          getMessages(activeSessionID, 50, undefined, activeDirectory),
          getTodos(activeSessionID, activeDirectory),
        ])
        if (!cancelled) {
          dispatch({ type: "SET_MESSAGES", sessionID: activeSessionID, messages: msgs })
          dispatch({ type: "SET_TODOS", sessionID: activeSessionID, todos })
        }
        const messageID = latestUserMessageID(msgs)
        if (messageID) {
          const diff = await getSessionDiff(activeSessionID, messageID, activeDirectory)
          if (!cancelled) dispatch({ type: "SET_SESSION_DIFF", sessionID: activeSessionID, diff })
        }
      } catch (error) {
        console.error("[ChatArea] failed to refresh messages:", error)
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

      const promptText =
        mode === "plan" ? `请先规划。先检查上下文并提出最安全的实现方案，不要直接修改代码。\n\n${text}` : text
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
      const knownAssistantIDs = new Set(
        (messages[activeSessionID] || []).filter((message) => message.role === "assistant").map((message) => message.id),
      )
      dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: userMessage })

      try {
        const selectedModel = modelSelectionToPayload(settings.model)
        if (selectedModel) {
          const isDefaultModel = selectedModel.providerID === "mimo" && selectedModel.modelID === "mimo-auto"
          if (!isDefaultModel) {
            const model = `${selectedModel.providerID}/${selectedModel.modelID}`
            const runtimeModels = await fetchRuntimeModels()
            const isRuntimeModel = runtimeModels.some(
              (runtimeModel) => runtimeModel.provider === selectedModel.providerID && runtimeModel.id === selectedModel.modelID,
            )
            if (isRuntimeModel) {
              await sendPrompt(activeSessionID, {
                agent: mode === "web-search" ? "explore" : "build",
                model: settings.model,
                parts: promptParts,
                variant: mode === "multimodal" ? "multimodal" : undefined,
                directory: activeDirectory,
              })
              void waitForAssistantMessages(activeSessionID, knownAssistantIDs, activeDirectory)
                .then((assistantMessages) => {
                  assistantMessages?.forEach((message) => {
                    dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message })
                  })
                })
                .catch((error) => console.error("[ChatArea] failed to sync assistant messages:", error))
              return
            }

            if (attachments.length > 0) {
              throw new Error("附件上传仅支持当前运行中的原生模型链路，请选择已加载的 runtime 模型或默认模型。")
            }

            const result = await runLocalPrompt({ model, prompt: promptText })
            const assistantMessage: Message = {
              id: createClientID("msg"),
              sessionID: activeSessionID,
              role: "assistant",
              content: result.text || "（模型没有返回文本）",
              time: { created: Date.now() },
            }
            dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: assistantMessage })
            return
          }
        }
        await sendPrompt(activeSessionID, {
          agent: mode === "web-search" ? "explore" : "build",
          model: settings.model,
          parts: promptParts,
          variant: mode === "multimodal" ? "multimodal" : undefined,
          directory: activeDirectory,
        })
        void waitForAssistantMessages(activeSessionID, knownAssistantIDs, activeDirectory)
          .then((assistantMessages) => {
            assistantMessages?.forEach((message) => {
              dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message })
            })
          })
          .catch((error) => console.error("[ChatArea] failed to sync assistant messages:", error))
      } catch (error) {
        console.error("[ChatArea] failed to send prompt:", error)
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
    [activeDirectory, activeSessionID, dispatch, messages, settings.model],
  )

  const handleAbort = useCallback(async () => {
    if (!activeSessionID) return
    await abortSession(activeSessionID, activeDirectory)
  }, [activeDirectory, activeSessionID])

  const sessionMessages = activeSessionID ? messages[activeSessionID] || [] : []

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
      <div className="flex min-w-0 flex-1 flex-col bg-background/55">
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
        <InputBar onSend={handleSend} onAbort={handleAbort} busy={busy} />
        <WorkspaceSessionDialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen} defaultWorkspace={activeDirectory} />
      </div>
      {activeSessionID && showFileChanges && (sessionDiffs[activeSessionID]?.length ?? 0) > 0 && (
        <FileChangesPanel diffs={sessionDiffs[activeSessionID]} onClose={() => setShowFileChanges(false)} />
      )}
    </div>
  )
}

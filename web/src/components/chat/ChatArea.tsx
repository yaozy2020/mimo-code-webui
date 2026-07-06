import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { fetchRuntimeModels, runLocalPrompt } from "@/api/client"
import { abortSession, modelSelectionToPayload, sendPrompt } from "@/api/message"
import { createSession, getMessages, getTodos } from "@/api/session"
import { Button } from "@/components/ui/button"
import { useNewChat } from "@/hooks/useNewChat"
import { createClientID } from "@/lib/utils"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import type { Message } from "@/types"
import { InputBar, type PromptMode } from "./InputBar"
import { MessageList } from "./MessageList"
import { PermissionDialog } from "./PermissionDialog"
import { PromptToolbar } from "./PromptToolbar"
import { QuestionDialog } from "./QuestionDialog"

const ASSISTANT_SYNC_ATTEMPTS = 30
const ASSISTANT_SYNC_INTERVAL_MS = 1500
const MESSAGE_REFRESH_INTERVAL_MS = 3000

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForAssistantMessages(sessionID: string, knownAssistantIDs: Set<string>) {
  for (let attempt = 0; attempt < ASSISTANT_SYNC_ATTEMPTS; attempt += 1) {
    await sleep(ASSISTANT_SYNC_INTERVAL_MS)
    const msgs = await getMessages(sessionID)
    const assistantMessages = msgs.filter(
      (message) => message.role === "assistant" && !knownAssistantIDs.has(message.id) && Boolean(message.content?.trim()),
    )
    if (assistantMessages.length > 0) {
      return assistantMessages
    }
  }
  return null
}

export function ChatArea() {
  const dispatch = useAppDispatch()
  const { activeSessionID, agentStatus, messages, settings } = useAppState()
  const [loading, setLoading] = useState(true)
  const newChat = useNewChat()

  const busy = activeSessionID ? agentStatus[activeSessionID]?.state === "busy" : false

  // On mount: restore the WebUI-owned session, or create a new one.
  // Do not auto-pick the latest global session; it may be the user's active CLI conversation.
  useEffect(() => {
    if (activeSessionID) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)

    const init = async () => {
      try {
        if (cancelled) return
        const session = await createSession()
        if (cancelled) return
        dispatch({ type: "ADD_SESSION", session })
        dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
      } catch (error) {
        console.error("[ChatArea] failed to init session:", error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [activeSessionID, dispatch])

  // Load historical messages whenever the active session changes
  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false

    const load = async () => {
      try {
        const msgs = await getMessages(activeSessionID)
        if (cancelled) return
        dispatch({ type: "SET_MESSAGES", sessionID: activeSessionID, messages: msgs })
      } catch (error) {
        console.error("[ChatArea] failed to load messages:", error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [activeSessionID, dispatch])

  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false

    const load = async () => {
      try {
        const todos = await getTodos(activeSessionID)
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
  }, [activeSessionID, dispatch])

  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false
    const refresh = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const [msgs, todos] = await Promise.all([getMessages(activeSessionID), getTodos(activeSessionID)])
        if (!cancelled) {
          dispatch({ type: "SET_MESSAGES", sessionID: activeSessionID, messages: msgs })
          dispatch({ type: "SET_TODOS", sessionID: activeSessionID, todos })
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
  }, [activeSessionID, dispatch])

  const handleSend = useCallback(
    async (text: string, mode: PromptMode) => {
      if (!activeSessionID) return

      const promptText =
        mode === "plan" ? `请先规划。先检查上下文并提出最安全的实现方案，不要直接修改代码。\n\n${text}` : text

      const userMessage: Message = {
        id: createClientID("msg"),
        sessionID: activeSessionID,
        role: "user",
        content: text,
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
              const parts: { type: "text"; content: string }[] = [{ type: "text", content: promptText }]
              await sendPrompt(activeSessionID, {
                agent: mode === "web-search" ? "explore" : "build",
                model: settings.model,
                parts,
                variant: mode === "multimodal" ? "multimodal" : undefined,
              })
              void waitForAssistantMessages(activeSessionID, knownAssistantIDs)
                .then((assistantMessages) => {
                  assistantMessages?.forEach((message) => {
                    dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message })
                  })
                })
                .catch((error) => console.error("[ChatArea] failed to sync assistant messages:", error))
              return
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
        const parts: { type: "text"; content: string }[] = [{ type: "text", content: promptText }]
        await sendPrompt(activeSessionID, {
          agent: mode === "web-search" ? "explore" : "build",
          model: settings.model,
          parts,
          variant: mode === "multimodal" ? "multimodal" : undefined,
        })
        void waitForAssistantMessages(activeSessionID, knownAssistantIDs)
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
    [activeSessionID, dispatch, messages, settings.model],
  )

  const handleAbort = useCallback(async () => {
    if (!activeSessionID) return
    await abortSession(activeSessionID)
  }, [activeSessionID])

  const sessionMessages = activeSessionID ? messages[activeSessionID] || [] : []

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
        正在加载会话...
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {activeSessionID && <PromptToolbar sessionID={activeSessionID} />}
      {sessionMessages.length === 0 && !busy && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 text-center text-muted-foreground">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">MiMo Code</h2>
            <p className="mt-1 text-sm">用于编码、规划、搜索和审批的 MiMo 代理工作台。</p>
          </div>
          <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
            {["解释这个项目", "规划一次安全重构", "查找高风险代码路径"].map((label) => (
              <Button key={label} variant="outline" onClick={() => handleSend(label, "plan")}>
                {label}
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={() => newChat()} className="gap-2">
            <Plus className="h-4 w-4" />
            新建会话
          </Button>
        </div>
      )}
      {(sessionMessages.length > 0 || busy) && <MessageList />}
      <PermissionDialog />
      <QuestionDialog />
      <InputBar onSend={handleSend} onAbort={handleAbort} busy={busy} />
    </div>
  )
}

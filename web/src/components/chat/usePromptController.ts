import { useCallback } from "react"
import { fetchRuntimeModels, runLocalPrompt, runLocalPromptStream } from "@/api/client"
import { abortSession, modelSelectionToPayload, sendPrompt } from "@/api/message"
import { createClientID } from "@/lib/utils"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import type { Message } from "@/types"
import type { PendingAttachment, PromptMode } from "./InputBar"
import { chooseModelRoute } from "./modelRouting"

export function usePromptController(input: { activeSessionID: string | null; activeDirectory?: string }) {
  const dispatch = useAppDispatch()
  const { agentStatus, settings } = useAppState()
  const { activeSessionID, activeDirectory } = input
  const busy = activeSessionID ? agentStatus[activeSessionID]?.state === "busy" : false

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
    [activeDirectory, activeSessionID, dispatch, settings.model],
  )

  const handleAbort = useCallback(async () => {
    if (!activeSessionID) return
    await abortSession(activeSessionID, activeDirectory)
  }, [activeDirectory, activeSessionID])

  return { busy, handleSend, handleAbort }
}

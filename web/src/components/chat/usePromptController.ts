import { useCallback, useRef } from "react"
import { fetchRuntimeModels, runLocalPrompt, runLocalPromptStream } from "@/api/client"
import { abortSession, modelSelectionToPayload, sendCommand, sendPrompt } from "@/api/message"
import { createClientID } from "@/lib/utils"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import type { Message } from "@/types"
import type { PendingAttachment, PromptMode } from "./InputBar"
import { chooseModelRoute } from "./modelRouting"

export function usePromptController(input: { activeSessionID: string | null; activeDirectory?: string }) {
  const dispatch = useAppDispatch()
  const { agentStatus, settings } = useAppState()
  const { activeSessionID, activeDirectory } = input
  const localAbortRef = useRef(new Map<string, AbortController>())
  const busy = activeSessionID ? agentStatus[activeSessionID]?.state === "busy" : false

  const handleSend = useCallback(
    async (text: string, mode: PromptMode, attachments: PendingAttachment[] = []) => {
      if (!activeSessionID) return
      let localRunSelected = false
      const requestKey = `${activeDirectory ?? ""}\n${activeSessionID}`
      let localAbort: AbortController | null = null
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
      try {
        const selectedModel = modelSelectionToPayload(settings.model)
        const runtimeModels = await fetchRuntimeModels()
        const nativeKeys = new Set(runtimeModels.map((m) => `${m.provider}/${m.id}`))
        const route = chooseModelRoute({ selectedModel, nativeModelKeys: nativeKeys })

        if (route === "local-run") {
          localRunSelected = true
          const unsupportedAttachment = attachments.find((attachment) => typeof attachment.content !== "string")
          if (unsupportedAttachment) {
            throw new Error(`当前模型不支持图片或二进制附件：${unsupportedAttachment.filename}`)
          }
          dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: { ...userMessage, optimistic: false, localOnly: true } })
          localAbort = new AbortController()
          localAbortRef.current.set(requestKey, localAbort)
          const assistantMessageID = createClientID("msg")
          dispatch({
            type: "ADD_MESSAGE",
            sessionID: activeSessionID,
            message: {
              id: assistantMessageID,
              sessionID: activeSessionID,
              role: "assistant",
              content: "",
              localOnly: true,
              time: { created: Date.now() },
            },
          })

          let receivedDelta = false
          try {
            await runLocalPromptStream(
              { model: settings.model, prompt: text || promptParts.map((p) => p.content).join("\n"), signal: localAbort.signal },
              {
                onDelta: (delta) => {
                  receivedDelta = true
                  dispatch({ type: "APPEND_MESSAGE_CONTENT", sessionID: activeSessionID, messageID: assistantMessageID, content: delta })
                },
              },
            )
          } catch (streamError) {
            if (streamError instanceof DOMException && streamError.name === "AbortError") throw streamError
            if (!receivedDelta) {
              const result = await runLocalPrompt({ model: settings.model, prompt: text || promptParts.map((p) => p.content).join("\n"), signal: localAbort.signal })
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
          if (localAbortRef.current.get(requestKey) === localAbort) localAbortRef.current.delete(requestKey)
          return
        }

        dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: userMessage })
        await sendPrompt(activeSessionID, {
          agent: mode,
          model: settings.model,
          parts: promptParts,
          directory: activeDirectory,
        })
      } catch (error) {
        if (localAbortRef.current.get(requestKey) === localAbort) localAbortRef.current.delete(requestKey)
        if (error instanceof DOMException && error.name === "AbortError") {
          dispatch({ type: "SET_AGENT_STATUS", sessionID: activeSessionID, status: { sessionID: activeSessionID, state: "idle" } })
          return
        }
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
          localOnly: localRunSelected,
          time: { created: Date.now() },
        }
        dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: errorMessage })
      }
    },
    [activeDirectory, activeSessionID, dispatch, settings.model],
  )

  const handleAbort = useCallback(async () => {
    if (!activeSessionID) return
    const requestKey = `${activeDirectory ?? ""}\n${activeSessionID}`
    const localRequest = localAbortRef.current.get(requestKey)
    if (localRequest) {
      localRequest.abort()
      localAbortRef.current.delete(requestKey)
      return
    }
    await abortSession(activeSessionID, activeDirectory)
  }, [activeDirectory, activeSessionID])

  const handleCommand = useCallback(
    async (command: string, args: string) => {
      if (!activeSessionID) throw new Error("请先选择会话")
      await sendCommand(activeSessionID, command, args, activeDirectory)
    },
    [activeDirectory, activeSessionID],
  )

  return { busy, handleSend, handleCommand, handleAbort }
}

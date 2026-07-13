import { useCallback, useRef } from "react"
import { fetchRuntimeModels, runLocalPrompt, runLocalPromptStream } from "@/api/client"
import { abortSession, modelSelectionToPayload, sendCommand, sendPrompt } from "@/api/message"
import { createClientID } from "@/lib/utils"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import type { Message } from "@/types"
import type { PendingAttachment, PromptMode } from "./InputBar"
import { probePromptRoute } from "./promptRouteProbe"
import { claimRequest, releaseRequest } from "./requestOwnership"

type AttachmentInput = Pick<PendingAttachment, "filename" | "content">

export function buildLocalRunPrompt(text: string, attachments: AttachmentInput[]) {
  return [
    text.trim(),
    ...attachments.map((attachment) => `[Attachment: ${attachment.filename}]\n${attachment.content}`),
  ].filter(Boolean).join("\n\n")
}

export function shouldFallbackLocalRun(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "STREAM_UNSUPPORTED"
}

export function usePromptController(input: { activeSessionID: string | null; activeDirectory?: string }) {
  const dispatch = useAppDispatch()
  const { agentStatus, settings } = useAppState()
  const { activeSessionID, activeDirectory } = input
  const localAbortRef = useRef(new Map<string, AbortController>())
  const requestOwnerRef = useRef(new Map<string, AbortController>())
  const busy = activeSessionID ? agentStatus[activeSessionID]?.state === "busy" : false

  const handleSend = useCallback(
    async (text: string, mode: PromptMode, attachments: PendingAttachment[] = []) => {
      if (!activeSessionID) return
      let localRunSelected = false
      const requestKey = `${activeDirectory ?? ""}\n${activeSessionID}`
      const localAbort = new AbortController()
      localAbortRef.current.set(requestKey, localAbort)
      claimRequest(requestOwnerRef.current, requestKey, localAbort)
      let nativePromptPending = false
      let nativePromptAccepted = false
      let nativePromptUncertain = false
      let assistantMessageID: string | null = null
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
        const route = await probePromptRoute(selectedModel, localAbort.signal, fetchRuntimeModels, activeDirectory)

        if (route === "local-run") {
          if (busy) throw new Error("当前模型正在生成，请等待完成后再发送")
          localRunSelected = true
          const unsupportedAttachment = attachments.find((attachment) => typeof attachment.content !== "string")
          if (unsupportedAttachment) {
            throw new Error(`当前模型不支持图片或二进制附件：${unsupportedAttachment.filename}`)
          }
          dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: { ...userMessage, optimistic: false, localOnly: true } })
          const localAssistantMessageID = createClientID("msg")
          assistantMessageID = localAssistantMessageID
          const localPrompt = buildLocalRunPrompt(text, attachments)
          dispatch({
            type: "ADD_MESSAGE",
            sessionID: activeSessionID,
            message: {
              id: localAssistantMessageID,
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
              { model: settings.model, prompt: localPrompt, signal: localAbort.signal },
              {
                onDelta: (delta) => {
                  receivedDelta = true
                  dispatch({ type: "APPEND_MESSAGE_CONTENT", sessionID: activeSessionID, messageID: localAssistantMessageID, content: delta })
                },
              },
            )
          } catch (streamError) {
            if (streamError instanceof DOMException && streamError.name === "AbortError") throw streamError
            if (!receivedDelta && shouldFallbackLocalRun(streamError)) {
              const result = await runLocalPrompt({ model: settings.model, prompt: localPrompt, signal: localAbort.signal })
              dispatch({
                type: "SET_MESSAGE_CONTENT",
                sessionID: activeSessionID,
                messageID: localAssistantMessageID,
                content: result.text || "（模型没有返回文本）",
              })
            } else {
              throw streamError
            }
          }

          return
        }

        dispatch({
          type: "SET_AGENT_STATUS",
          sessionID: activeSessionID,
          status: { sessionID: activeSessionID, state: "busy" },
        })
        if (localAbortRef.current.get(requestKey) === localAbort) localAbortRef.current.delete(requestKey)
        dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: userMessage })
        nativePromptPending = true
        await sendPrompt(activeSessionID, {
          agent: mode,
          model: settings.model,
          parts: promptParts,
          directory: activeDirectory,
        })
        nativePromptPending = false
        nativePromptAccepted = true
      } catch (error) {
        if (assistantMessageID) {
          dispatch({ type: "REMOVE_EMPTY_ASSISTANT", sessionID: activeSessionID, messageID: assistantMessageID })
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        // A network failure after dispatching prompt_async does not prove the
        // server rejected it. Keep the optimistic message and wait for sync.
        nativePromptUncertain = nativePromptPending
        if (nativePromptPending) return
        console.error("[ChatArea] failed to send prompt:", error)
        const errorMessage: Message = {
          id: createClientID("msg"),
          sessionID: activeSessionID,
          role: "assistant",
          content: `[Error: ${(error as Error).message}]`,
          localOnly: localRunSelected,
          time: { created: Date.now() },
        }
        dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: errorMessage })
      } finally {
        if (localAbortRef.current.get(requestKey) === localAbort) localAbortRef.current.delete(requestKey)
        if (releaseRequest(requestOwnerRef.current, requestKey, localAbort)) {
          if (localRunSelected || (!nativePromptAccepted && !nativePromptUncertain)) {
            dispatch({ type: "SET_AGENT_STATUS", sessionID: activeSessionID, status: { sessionID: activeSessionID, state: "idle" } })
          }
        }
      }
    },
    [activeDirectory, activeSessionID, busy, dispatch, settings.model],
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

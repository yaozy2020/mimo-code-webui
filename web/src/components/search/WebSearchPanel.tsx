import { Search } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendPrompt } from "@/api/message"
import { createClientID } from "@/lib/utils"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import type { Message } from "@/types"

export function WebSearchPanel() {
  const dispatch = useAppDispatch()
  const { activeSessionID, sessions } = useAppState()
  const activeSession = activeSessionID ? sessions.find((session) => session.id === activeSessionID) : undefined
  const activeDirectory = activeSession?.directory
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)

  const handleSearch = async () => {
    if (!activeSessionID || !query.trim()) return
    setBusy(true)

    const prompt = `Please search the web for current information and answer: ${query.trim()}\n\nIf you need to search, use the web_search tool. Always cite your sources.`

    const userMessage: Message = {
      id: createClientID("msg"),
      sessionID: activeSessionID,
      role: "user",
      content: prompt,
      time: { created: Date.now() },
    }
    dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: userMessage })

    const assistantMessage: Message = {
      id: createClientID("msg"),
      sessionID: activeSessionID,
      role: "assistant",
      content: "",
      time: { created: Date.now() },
    }
    dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: assistantMessage })

    try {
      await sendPrompt(activeSessionID, {
        agent: "explore",
        parts: [{ type: "text", content: prompt }],
        directory: activeDirectory,
      })
      setQuery("")
    } catch (error) {
      dispatch({
        type: "APPEND_MESSAGE_CONTENT",
        sessionID: activeSessionID,
        messageID: assistantMessage.id,
        content: `\n\n[Error: ${(error as Error).message}]`,
      })
    } finally {
      setBusy(false)
    }
  }

  if (!activeSessionID) {
    return <div className="p-4 text-muted-foreground">请先选择或新建会话</div>
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入需要联网搜索的问题..."
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={busy || !query.trim()}>
          <Search className="mr-1 h-4 w-4" />
          搜索
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        模型会根据问题决定是否调用联网搜索工具。
      </p>
    </div>
  )
}

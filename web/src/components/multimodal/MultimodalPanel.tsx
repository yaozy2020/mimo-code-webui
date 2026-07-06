import { Image, Mic, Video } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { sendPrompt } from "@/api/message"
import { createClientID } from "@/lib/utils"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import type { Message } from "@/types"

export function MultimodalPanel() {
  const dispatch = useAppDispatch()
  const { activeSessionID, sessions } = useAppState()
  const activeSession = activeSessionID ? sessions.find((session) => session.id === activeSessionID) : undefined
  const activeDirectory = activeSession?.directory
  const [kind, setKind] = useState<"image" | "audio" | "video">("image")
  const [source, setSource] = useState("")
  const [prompt, setPrompt] = useState("")
  const [busy, setBusy] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setSource(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSend = async () => {
    if (!activeSessionID || !source) return
    setBusy(true)

    const userMessage: Message = {
      id: createClientID("msg"),
      sessionID: activeSessionID,
      role: "user",
      content: prompt,
      parts: [{ id: createClientID("part"), type: kind, url: source, mime: `${kind}/${kind === "image" ? "png" : kind === "audio" ? "wav" : "mp4"}` }],
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
        variant: "multimodal",
        parts: [
          { type: kind, url: source },
          { type: "text", content: prompt },
        ],
        directory: activeDirectory,
      })
      setSource("")
      setPrompt("")
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
      <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <TabsList>
          <TabsTrigger value="image">
            <Image className="mr-1 h-4 w-4" /> 图片
          </TabsTrigger>
          <TabsTrigger value="audio">
            <Mic className="mr-1 h-4 w-4" /> 音频
          </TabsTrigger>
          <TabsTrigger value="video">
            <Video className="mr-1 h-4 w-4" /> 视频
          </TabsTrigger>
        </TabsList>
        <TabsContent value={kind}>
          <div className="space-y-3">
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="粘贴媒体 URL 或上传文件"
            />
            <Input type="file" accept={`${kind}/*`} onChange={handleFileChange} />
            {source && kind === "image" && (
              <img src={source} alt="preview" className="max-h-48 rounded border" />
            )}
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想让模型分析的内容..."
            />
            <Button onClick={handleSend} disabled={busy || !source}>
              发送
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

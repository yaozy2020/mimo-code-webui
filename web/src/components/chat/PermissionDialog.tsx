import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { respondPermission } from "@/api/message"
import { useAppDispatch, useAppState } from "@/stores/appStore"

export function PermissionDialog() {
  const dispatch = useAppDispatch()
  const { pendingPermission, sessions } = useAppState()
  const [feedback, setFeedback] = useState("")
  const [mode, setMode] = useState<"normal" | "feedback">("normal")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setFeedback("")
    setMode("normal")
    setSubmitting(false)
    setError(null)
  }, [pendingPermission?.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!pendingPermission) return
      if (mode === "feedback") {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleRespond("reject", feedback)
        }
        return
      }
      switch (e.key) {
        case "1":
          handleRespond("once")
          break
        case "2":
          handleRespond("always")
          break
        case "3":
          handleRespond("reject")
          break
        case "4":
          e.preventDefault()
          setMode("feedback")
          setTimeout(() => inputRef.current?.focus(), 0)
          break
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [pendingPermission, mode, feedback])

  if (!pendingPermission) return null

  const directory = sessions.find((session) => session.id === pendingPermission.sessionID)?.directory
  const permissionName = pendingPermission.toolName ?? pendingPermission.permission ?? "权限请求"
  const permissionDetails =
    pendingPermission.input ?? {
      patterns: pendingPermission.patterns,
      metadata: pendingPermission.metadata,
      always: pendingPermission.always,
      tool: pendingPermission.tool,
    }

  const handleRespond = async (response: "once" | "always" | "reject", message?: string) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await respondPermission(pendingPermission.id, response, {
        sessionID: pendingPermission.sessionID,
        directory,
        message,
      })
      dispatch({ type: "CLEAR_PENDING_PERMISSION", permissionID: pendingPermission.id })
      dispatch({
        type: "SET_AGENT_STATUS",
        sessionID: pendingPermission.sessionID,
        status: { sessionID: pendingPermission.sessionID, state: "busy" },
      })
      setFeedback("")
      setMode("normal")
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => handleRespond("reject")}>
      <DialogHeader>
        <DialogTitle>代理权限请求</DialogTitle>
        <DialogDescription>允许 MiMo Code 继续前，请先确认这次工具调用。</DialogDescription>
      </DialogHeader>

      <div className="text-sm text-foreground">
        {pendingPermission.agent && (
          <span className="mb-2 inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            代理：{pendingPermission.agent}
          </span>
        )}
        <div>
          <strong>{permissionName}</strong>
          {pendingPermission.description && (
            <p className="mt-1 text-sm text-muted-foreground">{pendingPermission.description}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">快捷键：1 允许一次，2 本会话允许，3 拒绝，4 反馈原因。</p>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(permissionDetails, null, 2)}
          </pre>
          {error && <p className="mt-2 text-xs text-destructive">授权提交失败：{error}</p>}
        </div>
      </div>

      {mode === "feedback" && (
        <div className="py-2">
          <Textarea
            ref={inputRef}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="拒绝原因（Enter 提交，Esc 取消）"
          />
        </div>
      )}

      <DialogFooter className="gap-2">
        <Button variant="default" onClick={() => handleRespond("once")} disabled={submitting}>
          {submitting ? "提交中..." : "1. 允许一次"}
        </Button>
        <Button variant="secondary" onClick={() => handleRespond("always")} disabled={submitting}>
          2. 本会话允许
        </Button>
        <Button variant="outline" onClick={() => handleRespond("reject")} disabled={submitting}>
          3. 拒绝
        </Button>
        <Button
          variant="outline"
          disabled={submitting}
          onClick={() => {
            if (mode === "feedback") {
              handleRespond("reject", feedback)
            } else {
              setMode("feedback")
              setTimeout(() => inputRef.current?.focus(), 0)
            }
          }}
        >
          {mode === "feedback" ? "提交反馈" : "4. 反馈"}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import { loginWithToken } from "@/api/client"

export function AuthDialog() {
  const dispatch = useAppDispatch()
  const { authDialogOpen, settings } = useAppState()
  const [token, setToken] = useState(settings.authToken)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    try {
      await loginWithToken(token)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      return
    }
    localStorage.removeItem("mimo-webui-auth-token")
    dispatch({ type: "UPDATE_SETTINGS", settings: { authToken: "" } })
    dispatch({ type: "SET_AUTH_DIALOG_OPEN", open: false })
    window.location.reload()
  }

  return (
    <Dialog open={authDialogOpen} onOpenChange={(open) => dispatch({ type: "SET_AUTH_DIALOG_OPEN", open })}>
      <DialogHeader>
        <DialogTitle>需要认证</DialogTitle>
        <DialogDescription>
          当前 MiMo Code WebUI 服务需要 Bearer token。请输入服务端配置的令牌。
        </DialogDescription>
      </DialogHeader>
      <div className="py-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="请输入 Bearer token..."
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit}>提交</Button>
      </DialogFooter>
    </Dialog>
  )
}

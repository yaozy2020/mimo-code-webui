import { useMimoStatus } from "@/hooks/useMimoStatus"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface DiagnosticsPanelProps {
  onClose: () => void
}

export function DiagnosticsPanel({ onClose }: DiagnosticsPanelProps) {
  const { data, error, loading } = useMimoStatus(2000)

  const mimo = data?.mimo as Record<string, unknown> | undefined
  const config = data?.config as Record<string, unknown> | undefined

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogHeader>
        <DialogTitle>诊断</DialogTitle>
      </DialogHeader>

      {loading && <p className="text-sm text-muted-foreground">正在检查...</p>}
      {error && <p className="text-sm text-destructive">错误：{error.message}</p>}

      {data && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">MiMo Server</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>健康状态：{mimo?.healthy ? "正常" : "异常"}</p>
              <p>地址：{String(mimo?.url || "-")}</p>
              <p>版本：{String(mimo?.version || "-")}</p>
              <p>由 WebUI 托管：{mimo?.managed ? "是" : "否"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">配置</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <pre className="max-h-40 overflow-auto break-words rounded bg-muted p-2 text-xs [overflow-wrap:anywhere]">
                {JSON.stringify(config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>关闭</Button>
      </DialogFooter>
    </Dialog>
  )
}

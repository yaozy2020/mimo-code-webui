import { X } from "lucide-react"
import { useMimoStatus } from "@/hooks/useMimoStatus"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface DiagnosticsPanelProps {
  onClose: () => void
}

export function DiagnosticsPanel({ onClose }: DiagnosticsPanelProps) {
  const { data, error, loading } = useMimoStatus(2000)

  const mimo = data?.mimo as Record<string, unknown> | undefined
  const config = data?.config as Record<string, unknown> | undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Diagnostics</h2>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Checking...</p>}
        {error && <p className="text-sm text-destructive">Error: {error.message}</p>}

        {data && (
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">MiMo Server</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>Healthy: {mimo?.healthy ? "Yes" : "No"}</p>
                <p>URL: {String(mimo?.url || "-")}</p>
                <p>Version: {String(mimo?.version || "-")}</p>
                <p>Managed by WebUI: {mimo?.managed ? "Yes" : "No"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Config</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

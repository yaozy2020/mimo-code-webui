import { useEffect, useState } from "react"
import { fetchLocalStatus, runReadonlyCliCommand, type LocalCliCommandResult } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface DiagnosticsPanelProps {
  onClose: () => void
}

const cliCommands = [
  { id: "debug-paths", label: "路径" },
  { id: "debug-config", label: "配置" },
  { id: "mcp", label: "MCP" },
  { id: "agents", label: "Agents" },
  { id: "sessions", label: "Sessions" },
  { id: "stats", label: "Stats" },
]

type CliState = Record<string, { data: LocalCliCommandResult | null; error: string | null; loading: boolean }>

export function DiagnosticsPanel({ onClose }: DiagnosticsPanelProps) {
  const [state, setState] = useState<{ data: Record<string, unknown> | null; error: Error | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  })
  const [cliState, setCliState] = useState<CliState>({})

  useEffect(() => {
    let cancelled = false
    fetchLocalStatus()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, error: error as Error, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { data, error, loading } = state

  const mimo = data?.mimo as Record<string, unknown> | undefined
  const config = data?.config as Record<string, unknown> | undefined

  const loadCliCommand = (id: string) => {
    setCliState((current) => ({ ...current, [id]: { data: current[id]?.data ?? null, error: null, loading: true } }))
    runReadonlyCliCommand(id)
      .then((result) => setCliState((current) => ({ ...current, [id]: { data: result, error: null, loading: false } })))
      .catch((error) => setCliState((current) => ({ ...current, [id]: { data: null, error: error instanceof Error ? error.message : String(error), loading: false } })))
  }

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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">MiMo CLI 只读命令</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {cliCommands.map((command) => (
                  <Button key={command.id} size="sm" variant="outline" onClick={() => loadCliCommand(command.id)}>
                    刷新{command.label}
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                {cliCommands.map((command) => {
                  const result = cliState[command.id]
                  if (!result?.loading && !result?.error && !result?.data) return null
                  return (
                    <div key={command.id} className="rounded-md border border-border/70 p-2">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium">
                        <span>{command.label}</span>
                        {result.loading && <span className="text-muted-foreground">运行中...</span>}
                      </div>
                      {result.error && <p className="text-xs text-destructive">{result.error}</p>}
                      {result.data && (
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs [overflow-wrap:anywhere]">
                          {[`$ ${result.data.command} ${result.data.args.join(" ")}`, result.data.stdout, result.data.stderr].filter(Boolean).join("\n")}
                        </pre>
                      )}
                    </div>
                  )
                })}
              </div>
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

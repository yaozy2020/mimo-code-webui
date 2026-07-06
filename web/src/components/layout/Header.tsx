import { useEffect, useState } from "react"
import { Activity, Bot, Menu, Plus, Settings } from "lucide-react"
import { fetchAvailableModels, type RuntimeModel } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { useNewChat } from "@/hooks/useNewChat"
import { useAppDispatch, useAppState } from "@/stores/appStore"

interface HeaderProps {
  onOpenSidebar: () => void
  onOpenSettings: () => void
  onOpenDiagnostics: () => void
}

export function Header({ onOpenSidebar, onOpenSettings, onOpenDiagnostics }: HeaderProps) {
  const dispatch = useAppDispatch()
  const { activeSessionID, agentStatus, settings, status } = useAppState()
  const [runtimeModels, setRuntimeModels] = useState<RuntimeModel[]>([])
  const newChat = useNewChat()
  const sessionState = activeSessionID ? agentStatus[activeSessionID]?.state ?? "idle" : "idle"

  useEffect(() => {
    let cancelled = false
    fetchAvailableModels()
      .then((models) => {
        if (!cancelled) setRuntimeModels(models)
      })
      .catch(() => {
        if (!cancelled) setRuntimeModels([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const modelOptions = runtimeModels.length > 0 ? runtimeModels : [{ id: settings.model || "mimo-auto", name: settings.model || "mimo-auto", provider: "当前" }]
  const selectedModel = runtimeModels.find((model) => model.id === settings.model || `${model.provider}/${model.id}` === settings.model)
  const selectedModelValue = selectedModel ? `${selectedModel.provider}/${selectedModel.id}` : settings.model || "mimo-auto"
  const handleModelChange = (value: string) => {
    if (value === "__add_model__") {
      onOpenSettings()
      return
    }
    dispatch({ type: "UPDATE_SETTINGS", settings: { model: value } })
  }

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button size="icon" variant="ghost" onClick={onOpenSidebar} className="h-9 w-9 shrink-0 md:hidden" title="会话">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">MiMo Code</h1>
            <span
              className={`h-2 w-2 rounded-full ${status.mimoHealthy ? "bg-emerald-500" : "bg-red-500"}`}
              title={status.mimoHealthy ? "mimo serve 已连接" : "mimo serve 未连接"}
            />
          </div>
          <Select
            aria-label="切换模型"
            className="mt-0.5 h-6 max-w-40 border-0 bg-transparent px-0 py-0 text-xs text-muted-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:max-w-64"
            value={selectedModelValue}
            onChange={(event) => handleModelChange(event.target.value)}
          >
            {modelOptions.map((model) => (
              <option key={`${model.provider}:${model.id}`} value={`${model.provider}/${model.id}`}>
                {model.name === model.id ? `${model.provider}/${model.id}` : `${model.provider}/${model.id} - ${model.name}`}
              </option>
            ))}
            <option value="__add_model__">新增模型...</option>
          </Select>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Badge variant={sessionState === "busy" ? "default" : "secondary"}>{sessionState}</Badge>
        <Button size="sm" variant="ghost" onClick={() => newChat()} className="hidden gap-1 sm:inline-flex">
          <Plus className="h-4 w-4" />
          新建
        </Button>
        <Button size="icon" variant="ghost" onClick={onOpenDiagnostics} title="诊断">
          <Activity className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onOpenSettings} title="设置">
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}

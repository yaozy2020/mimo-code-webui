import { useEffect, useState } from "react"
import { Activity, Bot, Menu, PanelLeft, Plus, Settings } from "lucide-react"
import { fetchAvailableModels, fetchRuntimeModels, type RuntimeModel } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { WorkspaceSessionDialog } from "@/components/chat/WorkspaceSessionDialog"
import { supportsNativeWorkspace } from "@/components/chat/modelRouting"
import { useAppDispatch, useAppState } from "@/stores/appStore"

interface HeaderProps {
  onOpenSidebar: () => void
  onToggleSidebar: () => void
  sidebarOpen: boolean
  onOpenSettings: () => void
  onOpenDiagnostics: () => void
}

export function Header({ onOpenSidebar, onToggleSidebar, sidebarOpen, onOpenSettings, onOpenDiagnostics }: HeaderProps) {
  const dispatch = useAppDispatch()
  const { activeSessionID, agentStatus, currentWorkspace, sessions, settings, status } = useAppState()
  const [runtimeModels, setRuntimeModels] = useState<RuntimeModel[]>([])
  const [nativeModelKeys, setNativeModelKeys] = useState<Set<string>>(new Set())
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const sessionState = activeSessionID ? agentStatus[activeSessionID]?.state ?? "idle" : "idle"
  const activeSession = activeSessionID ? sessions.find((session) => session.id === activeSessionID) : undefined
  const defaultWorkspace = activeSession?.directory ?? currentWorkspace

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAvailableModels(), fetchRuntimeModels()])
      .then(([models, nativeModels]) => {
        if (cancelled) return
        setRuntimeModels(models)
        setNativeModelKeys(new Set(nativeModels.map((model) => `${model.provider}/${model.id}`)))
        const limits: Record<string, number> = {}
        for (const model of models) {
          if (model.contextLimit) limits[`${model.provider}/${model.id}`] = model.contextLimit
        }
        dispatch({ type: "SET_MODEL_LIMITS", limits })
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeModels([])
          setNativeModelKeys(new Set())
        }
      })
    return () => {
      cancelled = true
    }
  }, [dispatch])

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
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-3 shadow-sm backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button size="icon" variant="ghost" onClick={onOpenSidebar} className="h-9 w-9 shrink-0 md:hidden" title="会话">
          <Menu className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onToggleSidebar} className="h-9 w-9 shrink-0 hidden md:flex" title={sidebarOpen ? "隐藏会话栏" : "显示会话栏"}>
          <PanelLeft className="h-5 w-5" />
        </Button>
        <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm sm:flex">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 max-w-[46vw] sm:max-w-none">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold tracking-tight">MiMo Code</h1>
            <span
              className={`h-2 w-2 rounded-full ${status.mimoHealthy ? "bg-emerald-500" : "bg-red-500"}`}
              title={status.mimoHealthy ? "mimo serve 已连接" : "mimo serve 未连接"}
            />
          </div>
          <Select
            aria-label="切换模型"
            className="mt-0.5 h-6 max-w-[42vw] truncate border-0 bg-transparent px-0 py-0 text-xs text-muted-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:max-w-64"
            value={selectedModelValue}
            onChange={(event) => handleModelChange(event.target.value)}
          >
            {modelOptions.map((model) => (
              <option key={`${model.provider}:${model.id}`} value={`${model.provider}/${model.id}`}>
                {model.name === model.id ? `${model.provider}/${model.id}` : `${model.provider}/${model.id} - ${model.name}`}
                {supportsNativeWorkspace(model, nativeModelKeys) ? " (支持工作区)" : " (仅对话)"}
              </option>
            ))}
            <option value="__add_model__">新增模型...</option>
          </Select>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Badge variant={sessionState === "busy" ? "default" : "secondary"} className="max-w-20 truncate px-2 text-[10px] sm:max-w-none sm:text-xs">
          {sessionState}
        </Badge>
        <Button size="sm" variant="ghost" onClick={() => setWorkspaceDialogOpen(true)} className="hidden gap-1 sm:inline-flex">
          <Plus className="h-4 w-4" />
          新建
        </Button>
        <Button size="icon" variant="ghost" onClick={onOpenDiagnostics} title="诊断" className="hidden sm:inline-flex">
          <Activity className="h-5 w-5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenSettings} className="gap-1 text-xs sm:text-sm" title="设置">
          <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline">设置</span>
        </Button>
      </div>
      <WorkspaceSessionDialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen} defaultWorkspace={defaultWorkspace} />
    </header>
  )
}

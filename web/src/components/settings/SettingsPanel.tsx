import { useEffect, useState } from "react"
import { LogOut, Trash2 } from "lucide-react"
import { fetchAvailableModels, fetchRuntimeModels, logout, restartMimoServer, saveManualModel, type RuntimeModel } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { supportsNativeWorkspace } from "@/components/chat/modelRouting"
import { useAppState, useAppDispatch } from "@/stores/appStore"

interface SettingsPanelProps {
  onClose: () => void
}

const FALLBACK_MODELS: RuntimeModel[] = [{ id: "mimo-auto", name: "mimo-auto", provider: "mimo" }]

const PRESET_BASE_URLS = [
  "https://token-plan-sgp.xiaomimimo.com/anthropic",
  "https://api.xiaomimimo.com/v1",
]

function toggleRowClassName(checked: boolean) {
  return [
    "flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
    checked ? "border-primary/40 bg-primary/10 text-foreground" : "border-transparent bg-muted/40 text-muted-foreground",
  ].join(" ")
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const dispatch = useAppDispatch()
  const { settings } = useAppState()
  const [runtimeModels, setRuntimeModels] = useState<RuntimeModel[]>([])
  const [nativeModelKeys, setNativeModelKeys] = useState<Set<string>>(new Set())
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [manualModel, setManualModel] = useState({
    providerID: "",
    modelID: "",
    name: "",
    baseUrl: "",
    apiKey: "",
    tool_call: true,
    attachment: true,
    image_input: true,
    reasoning: true,
    writeBackend: true,
  })
  const [manualStatus, setManualStatus] = useState<string | null>(null)

  const loadModels = () => {
    let cancelled = false
    Promise.all([fetchAvailableModels(), fetchRuntimeModels()])
      .then(([models, runtime]) => {
        if (!cancelled) {
          setRuntimeModels(models)
          setNativeModelKeys(new Set(runtime.map((m) => `${m.provider}/${m.id}`)))
        }
      })
      .catch((error) => {
        if (!cancelled) setModelsError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    return loadModels()
  }, [])

  const modelOptions = runtimeModels.length > 0 ? runtimeModels : FALLBACK_MODELS
  const selectedModel = runtimeModels.find((model) => model.id === settings.model || `${model.provider}/${model.id}` === settings.model)
  const selectedModelValue = selectedModel ? `${selectedModel.provider}/${selectedModel.id}` : settings.model

  const saveManual = async () => {
    setManualStatus(null)
    try {
      const saved = await saveManualModel(manualModel, manualModel.writeBackend)
      const value = `${saved.provider}/${saved.id}`
      dispatch({ type: "UPDATE_SETTINGS", settings: { model: value } })
      setManualModel((current) => ({ ...current, modelID: "", name: "", apiKey: "" }))
      setManualStatus(manualModel.writeBackend ? "已保存到浏览器和后端配置；新后端配置需要重启 MiMo 实例后完全生效。" : "已保存到当前浏览器。")
      loadModels()
    } catch (error) {
      setManualStatus(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleRestartMimo = async () => {
    setManualStatus(null)
    try {
      const result = await restartMimoServer()
      setManualStatus(`MiMo 后端已重启：${result.url ?? "未知地址"}`)
      loadModels()
    } catch (error) {
      setManualStatus(`重启失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleClearAll = () => {
    if (!window.confirm("确定清除所有 WebUI 本地数据？这将删除所有会话记录和设置。")) return
    localStorage.clear()
    window.location.reload()
  }

  const handleLogout = async () => {
    await logout().catch(() => undefined)
    dispatch({ type: "UPDATE_SETTINGS", settings: { authToken: "" } })
    onClose()
    window.location.reload()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }} contentClassName="md:max-w-3xl">
      <DialogHeader className="border-b border-border/60 pb-3">
        <DialogTitle>设置</DialogTitle>
        <p className="text-sm text-muted-foreground">管理模型、连接、界面偏好和本地数据。</p>
      </DialogHeader>

      <div className="space-y-4">
        <section className="rounded-lg border border-border/70 p-3 sm:p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">模型与连接</h3>
            <p className="mt-1 text-xs text-muted-foreground">选择默认模型，配置自定义 API 入口和 WebUI 访问令牌。</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="model">当前模型</Label>
              <Input id="model" value={settings.model} onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", settings: { model: e.target.value } })} placeholder="mimo-auto" />
              <Select value={selectedModelValue} onChange={(e) => { if (e.target.value) dispatch({ type: "UPDATE_SETTINGS", settings: { model: e.target.value } }) }}>
                {!selectedModelValue && <option value="">选择模型...</option>}
                {modelOptions.map((model) => {
                  const supportsWorkspace = supportsNativeWorkspace(model, nativeModelKeys)
                  const label = model.name === model.id ? `${model.provider}/${model.id}` : `${model.provider}/${model.id} - ${model.name}`
                  return <option key={`${model.provider}:${model.id}`} value={`${model.provider}/${model.id}`}>{label}{supportsWorkspace ? " (支持工作区)" : " (仅对话)"}</option>
                })}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base-url">基础 URL</Label>
              <Input id="base-url" value={settings.baseUrl} onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", settings: { baseUrl: e.target.value } })} placeholder="https://..." />
              <Select value="" onChange={(e) => { if (e.target.value) dispatch({ type: "UPDATE_SETTINGS", settings: { baseUrl: e.target.value } }) }}>
                <option value="">选择预设...</option>
                {PRESET_BASE_URLS.map((url) => <option key={url} value={url}>{url}</option>)}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key">API 密钥</Label>
              <Input id="api-key" type="password" value={settings.apiKey} onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", settings: { apiKey: e.target.value } })} placeholder="sk-..." />
            </div>

          </div>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>{runtimeModels.length > 0 ? "模型列表来自 MiMo TUI 内置模板，另合并当前运行配置和手动新增项。" : modelsError ? `无法读取 TUI 模型模板，使用兜底列表：${modelsError}` : "正在读取 MiMo TUI 模型模板..."}</p>
            {selectedModel && !supportsNativeWorkspace(selectedModel, nativeModelKeys) && <p className="text-amber-600">当前模型未声明工作区/工具能力，或未被当前 MiMo serve 作为原生模型加载，发送消息后会按仅对话模式处理。</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border/70 p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">手动模型</h3>
              <p className="mt-1 text-xs text-muted-foreground">补充未内置的新 provider/model；写入后端配置后通常需要重启 MiMo 实例。</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleRestartMimo} className="shrink-0">重启 MiMo 后端</Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={manualModel.providerID} onChange={(e) => setManualModel({ ...manualModel, providerID: e.target.value })} placeholder="providerID，如 openai" />
            <Input value={manualModel.modelID} onChange={(e) => setManualModel({ ...manualModel, modelID: e.target.value })} placeholder="modelID，如 gpt-4o-mini" />
            <Input value={manualModel.name} onChange={(e) => setManualModel({ ...manualModel, name: e.target.value })} placeholder="显示名称（可选）" />
            <Input value={manualModel.baseUrl} onChange={(e) => setManualModel({ ...manualModel, baseUrl: e.target.value })} placeholder="基础 URL，如 https://api.openai.com/v1" />
            <Input type="password" value={manualModel.apiKey} onChange={(e) => setManualModel({ ...manualModel, apiKey: e.target.value })} placeholder="API Key（写入后端配置时可选）" className="md:col-span-2" />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className={toggleRowClassName(manualModel.tool_call)}>
              <span>工具/工作区</span>
              <Switch checked={manualModel.tool_call} onChange={(e) => setManualModel({ ...manualModel, tool_call: e.target.checked })} />
            </label>
            <label className={toggleRowClassName(manualModel.attachment)}>
              <span>文件附件</span>
              <Switch checked={manualModel.attachment} onChange={(e) => setManualModel({ ...manualModel, attachment: e.target.checked })} />
            </label>
            <label className={toggleRowClassName(manualModel.image_input)}>
              <span>图片输入</span>
              <Switch checked={manualModel.image_input} onChange={(e) => setManualModel({ ...manualModel, image_input: e.target.checked })} />
            </label>
            <label className={toggleRowClassName(manualModel.reasoning)}>
              <span>多步推理</span>
              <Switch checked={manualModel.reasoning} onChange={(e) => setManualModel({ ...manualModel, reasoning: e.target.checked })} />
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center justify-between gap-3 text-sm sm:justify-start">
              <span className={manualModel.writeBackend ? "font-medium text-foreground" : "text-muted-foreground"}>同时写入后端 MiMo 配置</span>
              <Switch checked={manualModel.writeBackend} onChange={(e) => setManualModel({ ...manualModel, writeBackend: e.target.checked })} />
            </label>
            <Button size="sm" onClick={saveManual} disabled={!manualModel.providerID.trim() || !manualModel.modelID.trim()}>添加并选中</Button>
          </div>
          {manualStatus && <p className="mt-2 text-xs text-muted-foreground">{manualStatus}</p>}
        </section>

        <section className="rounded-lg border border-border/70 p-3 sm:p-4">
          <h3 className="text-sm font-semibold">界面与安全</h3>
          <div className={toggleRowClassName(settings.theme === "dark") + " mt-3"}>
            <div>
              <Label htmlFor="theme">深色模式</Label>
              <p className="text-xs text-muted-foreground">切换当前浏览器的显示主题。</p>
            </div>
            <Switch id="theme" checked={settings.theme === "dark"} onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", settings: { theme: e.target.checked ? "dark" : "light" } })} />
          </div>
        </section>

        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-destructive">危险操作</h3>
          <p className="mt-1 text-xs text-muted-foreground">退出登录将清除认证令牌；清除本地数据将删除所有会话记录和设置，且不可恢复。</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="outline" onClick={handleLogout} className="gap-1"><LogOut className="h-3.5 w-3.5" />退出登录</Button>
            <Button size="sm" variant="outline" onClick={handleClearAll} className="gap-1 text-destructive"><Trash2 className="h-3.5 w-3.5" />清除本地数据</Button>
          </div>
        </section>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>关闭</Button>
      </DialogFooter>
    </Dialog>
  )
}

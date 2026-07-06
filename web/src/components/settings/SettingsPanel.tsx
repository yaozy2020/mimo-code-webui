import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { fetchAvailableModels, saveManualModel, type RuntimeModel } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useAppState, useAppDispatch } from "@/stores/appStore"

interface SettingsPanelProps {
  onClose: () => void
}

const FALLBACK_MODELS: RuntimeModel[] = [{ id: "mimo-auto", name: "mimo-auto", provider: "mimo" }]

const PRESET_BASE_URLS = [
  "https://token-plan-sgp.xiaomimimo.com/anthropic",
  "https://api.xiaomimimo.com/v1",
]

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const dispatch = useAppDispatch()
  const { settings } = useAppState()
  const [runtimeModels, setRuntimeModels] = useState<RuntimeModel[]>([])
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [manualModel, setManualModel] = useState({
    providerID: "",
    modelID: "",
    name: "",
    baseUrl: "",
    apiKey: "",
    writeBackend: true,
  })
  const [manualStatus, setManualStatus] = useState<string | null>(null)

  const loadModels = () => {
    let cancelled = false
    fetchAvailableModels()
      .then((models) => {
        if (!cancelled) setRuntimeModels(models)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">设置</h2>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API 密钥</Label>
            <Input
              id="api-key"
              type="password"
              value={settings.apiKey}
              onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", settings: { apiKey: e.target.value } })}
              placeholder="sk-..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-url">基础 URL</Label>
            <Input
              id="base-url"
              value={settings.baseUrl}
              onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", settings: { baseUrl: e.target.value } })}
              placeholder="https://..."
            />
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  dispatch({ type: "UPDATE_SETTINGS", settings: { baseUrl: e.target.value } })
                }
              }}
            >
              <option value="">选择预设...</option>
              {PRESET_BASE_URLS.map((url) => (
                <option key={url} value={url}>
                  {url}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">模型</Label>
            <Input
              id="model"
              value={settings.model}
              onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", settings: { model: e.target.value } })}
              placeholder="mimo-auto"
            />
            <p className="text-xs text-muted-foreground">
              {runtimeModels.length > 0
                ? "模型列表来自 MiMo TUI 内置模板，另合并当前运行配置和手动新增项。"
                : modelsError
                  ? `无法读取 TUI 模型模板，使用兜底列表：${modelsError}`
                  : "正在读取 MiMo TUI 模型模板..."}
            </p>
            <Select
              value={selectedModelValue}
              onChange={(e) => {
                if (e.target.value) {
                  dispatch({ type: "UPDATE_SETTINGS", settings: { model: e.target.value } })
                }
              }}
            >
              {!selectedModelValue && <option value="">选择模型...</option>}
              {modelOptions.map((model) => (
                <option key={`${model.provider}:${model.id}`} value={`${model.provider}/${model.id}`}>
                  {model.name === model.id ? `${model.provider}/${model.id}` : `${model.provider}/${model.id} - ${model.name}`}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth-token">WebUI 认证令牌</Label>
            <Input
              id="auth-token"
              type="password"
              value={settings.authToken}
              onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", settings: { authToken: e.target.value } })}
              placeholder="服务端要求的 Bearer token（可选）..."
            />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div>
              <h3 className="text-sm font-medium">手动添加模型</h3>
              <p className="text-xs text-muted-foreground">
                上方列表默认包含 TUI 可选模型；这里用于补充未内置的新 provider/model。写入后端配置后，通常需要重启 MiMo 实例才会进入运行配置。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={manualModel.providerID}
                onChange={(e) => setManualModel({ ...manualModel, providerID: e.target.value })}
                placeholder="providerID，如 openai"
              />
              <Input
                value={manualModel.modelID}
                onChange={(e) => setManualModel({ ...manualModel, modelID: e.target.value })}
                placeholder="modelID，如 gpt-4o-mini"
              />
            </div>
            <Input
              value={manualModel.name}
              onChange={(e) => setManualModel({ ...manualModel, name: e.target.value })}
              placeholder="显示名称（可选）"
            />
            <Input
              value={manualModel.baseUrl}
              onChange={(e) => setManualModel({ ...manualModel, baseUrl: e.target.value })}
              placeholder="基础 URL，如 https://api.openai.com/v1"
            />
            <Input
              type="password"
              value={manualModel.apiKey}
              onChange={(e) => setManualModel({ ...manualModel, apiKey: e.target.value })}
              placeholder="API Key（写入后端配置时可选）"
            />
            <label className="flex items-center justify-between text-sm">
              <span>同时写入后端 MiMo 配置</span>
              <Switch
                checked={manualModel.writeBackend}
                onChange={(e) => setManualModel({ ...manualModel, writeBackend: e.target.checked })}
              />
            </label>
            <Button size="sm" onClick={saveManual} disabled={!manualModel.providerID.trim() || !manualModel.modelID.trim()}>
              添加并选中
            </Button>
            {manualStatus && <p className="text-xs text-muted-foreground">{manualStatus}</p>}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="theme">深色模式</Label>
            <Switch
              id="theme"
              checked={settings.theme === "dark"}
              onChange={(e) =>
                dispatch({ type: "UPDATE_SETTINGS", settings: { theme: e.target.checked ? "dark" : "light" } })
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}

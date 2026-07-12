import type { RuntimeModel } from "@/api/client"
import type { SelectedModel } from "./modelRouting"
import { chooseModelRoute } from "./modelRouting"

export async function probePromptRoute(
  selectedModel: SelectedModel | undefined,
  signal: AbortSignal,
  fetchModels: (directory?: string, signal?: AbortSignal) => Promise<RuntimeModel[]>,
  directory?: string,
) {
  signal.throwIfAborted()
  const runtimeModels = await fetchModels(directory, signal)
  signal.throwIfAborted()
  return chooseModelRoute({
    selectedModel,
    nativeModelKeys: new Set(runtimeModels.map((model) => `${model.provider}/${model.id}`)),
  })
}

export interface SelectedModel {
  providerID: string
  modelID: string
}

export interface ModelCapability {
  provider: string
  id: string
  tool_call?: boolean
}

export type ModelRoute = "native" | "local-run"

export function chooseModelRoute(input: {
  selectedModel?: SelectedModel
  nativeModelKeys: Set<string>
}): ModelRoute {
  if (!input.selectedModel) return "native"
  const key = `${input.selectedModel.providerID}/${input.selectedModel.modelID}`
  return input.nativeModelKeys.has(key) ? "native" : "local-run"
}

export function supportsNativeWorkspace(model: ModelCapability, nativeModelKeys: Set<string>): boolean {
  return model.tool_call === true && nativeModelKeys.has(`${model.provider}/${model.id}`)
}

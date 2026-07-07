export interface SelectedModel {
  providerID: string
  modelID: string
}

export type ModelRoute = "native"

export function chooseModelRoute(_input: { selectedModel?: SelectedModel; runtimeModel: boolean }): ModelRoute {
  return "native"
}

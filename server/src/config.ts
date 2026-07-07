import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export interface MimoConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  provider?: Record<string, MimoProviderConfig>
  [key: string]: unknown
}

export interface MimoProviderConfig {
  name?: string
  npm?: string
  api?: string
  options?: Record<string, unknown>
  models?: Record<string, MimoModelConfig>
  [key: string]: unknown
}

export interface MimoModelConfig {
  name?: string
  attachment?: boolean
  reasoning?: boolean
  tool_call?: boolean
  temperature?: boolean
  modalities?: {
    input?: string[]
    output?: string[]
  }
  [key: string]: unknown
}

export interface ManualModelInput {
  providerID: string
  modelID: string
  name?: string
  baseUrl?: string
  apiKey?: string
}

export interface ManualModelSummary {
  providerID: string
  modelID: string
  name: string
  baseUrl?: string
}

export function getMimoConfigPath(): string {
  const home = os.homedir()
  return path.join(home, ".mimo", "mimo.config.json")
}

export function readMimoConfig(): MimoConfig {
  const configPath = getMimoConfigPath()
  try {
    if (!fs.existsSync(configPath)) {
      return {}
    }
    const content = fs.readFileSync(configPath, "utf-8")
    return JSON.parse(content) as MimoConfig
  } catch (error) {
    console.warn(`[config] failed to read ${configPath}:`, error)
    return {}
  }
}

function validateConfigID(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`${field} only supports letters, numbers, dot, underscore and hyphen`)
  }
  return trimmed
}

export function listManualModels(): ManualModelSummary[] {
  const config = readMimoConfig()
  return Object.entries(config.provider ?? {}).flatMap(([providerID, provider]) =>
    Object.entries(provider.models ?? {}).map(([modelID, model]) => ({
      providerID,
      modelID,
      name: model.name ?? modelID,
      baseUrl: provider.api,
    })),
  )
}

export function resolveOpenAICompatibleModel(model: string) {
  const [providerID, modelID] = model.split("/", 2)
  if (!providerID || !modelID) throw new Error("model must be provider/model")

  const config = readMimoConfig()
  const provider = config.provider?.[providerID]
  const modelConfig = provider?.models?.[modelID]
  const baseUrl =
    provider?.api ||
    (typeof provider?.options?.baseURL === "string" ? provider.options.baseURL : undefined) ||
    (typeof provider?.options?.baseUrl === "string" ? provider.options.baseUrl : undefined)
  const apiKey =
    (typeof provider?.options?.apiKey === "string" ? provider.options.apiKey : undefined) ||
    process.env[`${providerID.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`] ||
    process.env.OPENAI_API_KEY

  if (!provider || !modelConfig || !baseUrl) {
    throw new Error(`OpenAI-compatible stream config not found for ${model}`)
  }

  return { providerID, modelID, baseUrl, apiKey }
}

export function addMimoModelConfig(input: ManualModelInput): ManualModelSummary {
  const providerID = validateConfigID(input.providerID, "providerID")
  const modelID = validateConfigID(input.modelID, "modelID")
  const configPath = getMimoConfigPath()
  const config = readMimoConfig()
  const provider = config.provider?.[providerID] ?? {}
  const models = provider.models ?? {}
  const name = input.name?.trim() || modelID
  const baseUrl = input.baseUrl?.trim() || provider.api
  const apiKey = input.apiKey?.trim()

  if (!baseUrl) {
    throw new Error("baseUrl is required for a new provider")
  }

  const nextConfig: MimoConfig = {
    ...config,
    provider: {
      ...(config.provider ?? {}),
      [providerID]: {
        ...provider,
        name: provider.name ?? providerID,
        npm: provider.npm ?? "@ai-sdk/openai-compatible",
        api: baseUrl,
        options: apiKey ? { ...(provider.options ?? {}), apiKey } : provider.options,
        models: {
          ...models,
          [modelID]: {
            ...models[modelID],
            name,
            attachment: models[modelID]?.attachment ?? true,
            reasoning: models[modelID]?.reasoning ?? true,
            tool_call: models[modelID]?.tool_call ?? true,
            temperature: models[modelID]?.temperature ?? true,
            modalities: models[modelID]?.modalities ?? { input: ["text", "image"], output: ["text"] },
          },
        },
      },
    },
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf-8")
  return { providerID, modelID, name, baseUrl }
}

export function getProjectRoot(): string {
  return process.cwd()
}

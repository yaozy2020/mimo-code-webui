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
  tool_call?: boolean
  attachment?: boolean
  reasoning?: boolean
}

export interface ManualModelSummary {
  providerID: string
  modelID: string
  name: string
  baseUrl?: string
  tool_call?: boolean
  attachment?: boolean
  reasoning?: boolean
}

export function getMimoConfigPath(): string {
  if (process.env.MIMO_CONFIG_PATH) {
    return process.env.MIMO_CONFIG_PATH
  }
  const home = os.homedir()
  // MiMo serve loads config from ~/.config/mimocode/config.json (or mimocode.jsonc).
  // Keep the WebUI config in the same directory so model changes are visible to mimo serve.
  return path.join(home, ".config", "mimocode", "config.json")
}

export function getLegacyMimoConfigPath(): string {
  const home = os.homedir()
  return path.join(home, ".mimo", "mimo.config.json")
}

function tryReadConfigFile(configPath: string): MimoConfig | null {
  try {
    if (!fs.existsSync(configPath)) return null
    const content = fs.readFileSync(configPath, "utf-8")
    if (!content.trim()) return {}
    return JSON.parse(content) as MimoConfig
  } catch {
    return null
  }
}

/**
 * Copy a readable legacy ~/.mimo/mimo.config.json into the MiMo config path
 * when the target is missing/empty. This lets users who configured providers
 * in the legacy location keep using them after the path change.
 */
export function migrateLegacyMimoConfig(): void {
  const target = getMimoConfigPath()
  const targetDir = path.dirname(target)
  const existing = tryReadConfigFile(target)
  if (existing && Object.keys(existing).length > 0) return

  const legacy = tryReadConfigFile(getLegacyMimoConfigPath())
  if (!legacy) return

  try {
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(target, `${JSON.stringify(legacy, null, 2)}\n`, "utf-8")
    console.log(`[config] migrated legacy config to ${target}`)
  } catch (error) {
    console.warn(`[config] failed to migrate legacy config to ${target}:`, error)
  }
}

export function readMimoConfig(): MimoConfig {
  const configPath = getMimoConfigPath()
  const result = tryReadConfigFile(configPath)
  if (result !== null) return result

  // Fallback to legacy ~/.mimo/mimo.config.json so the WebUI can still show
  // manually configured models even when the new config path is not writable.
  const legacy = tryReadConfigFile(getLegacyMimoConfigPath())
  if (legacy !== null) return legacy

  return {}
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
      // Manual/backend models are presumed to support workspace tools unless explicitly disabled.
      tool_call: model.tool_call ?? true,
      attachment: model.attachment ?? true,
      reasoning: model.reasoning ?? true,
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
            attachment: input.attachment ?? models[modelID]?.attachment ?? true,
            reasoning: input.reasoning ?? models[modelID]?.reasoning ?? true,
            tool_call: input.tool_call ?? models[modelID]?.tool_call ?? true,
            temperature: models[modelID]?.temperature ?? true,
            modalities: models[modelID]?.modalities ?? { input: ["text", "image"], output: ["text"] },
          },
        },
      },
    },
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf-8")
  return {
    providerID,
    modelID,
    name,
    baseUrl,
    tool_call: input.tool_call ?? models[modelID]?.tool_call ?? true,
    attachment: input.attachment ?? models[modelID]?.attachment ?? true,
    reasoning: input.reasoning ?? models[modelID]?.reasoning ?? true,
  }
}

export function getProjectRoot(): string {
  return process.cwd()
}

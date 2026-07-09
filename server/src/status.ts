const SENSITIVE_KEY_PATTERN = /(api[-_]?key|token|secret|authorization|password|credential)/i

type PublicModelSummary = {
  name?: string
  tool_call?: boolean
  attachment?: boolean
  reasoning?: boolean
}

type PublicConfigSummary = {
  provider: Record<string, { name?: string; models: Record<string, PublicModelSummary> }>
  command: Record<string, { description?: string; agent?: string; model?: string; subtask?: boolean }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function copyBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

function copyString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

export function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSensitiveKey(item))
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, nested]) => SENSITIVE_KEY_PATTERN.test(key) || containsSensitiveKey(nested))
}

export function createPublicConfigSummary(config: unknown): PublicConfigSummary {
  const summary: PublicConfigSummary = { provider: {}, command: {} }
  if (!isRecord(config)) return summary

  const providers = config.provider
  if (isRecord(providers)) {
    for (const [providerID, provider] of Object.entries(providers)) {
      if (!isRecord(provider)) continue
      const models: Record<string, PublicModelSummary> = {}
      if (isRecord(provider.models)) {
        for (const [modelID, model] of Object.entries(provider.models)) {
          if (!isRecord(model)) continue
          models[modelID] = {
            name: copyString(model.name),
            tool_call: copyBoolean(model.tool_call),
            attachment: copyBoolean(model.attachment),
            reasoning: copyBoolean(model.reasoning),
          }
        }
      }
      summary.provider[providerID] = { name: copyString(provider.name), models }
    }
  }

  const commands = config.command
  if (isRecord(commands)) {
    for (const [commandID, command] of Object.entries(commands)) {
      if (!isRecord(command)) continue
      summary.command[commandID] = {
        description: copyString(command.description),
        agent: copyString(command.agent),
        model: copyString(command.model),
        subtask: copyBoolean(command.subtask),
      }
    }
  }

  return summary
}

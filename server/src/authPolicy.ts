interface AuthPolicyInput {
  host: string
  authToken?: string
  allowUnauthenticatedLan?: boolean
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1"
}

export function assertSafeAuthPolicy(input: AuthPolicyInput): void {
  if (!input.authToken && !input.allowUnauthenticatedLan && !isLoopbackHost(input.host)) {
    throw new Error(
      "AUTH_TOKEN is required when HOST is not loopback. Set AUTH_TOKEN or use HOST=127.0.0.1. For local trusted LAN testing only, set ALLOW_UNAUTHENTICATED_LAN=true.",
    )
  }
}

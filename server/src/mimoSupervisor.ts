import type { MimoServerInfo } from "./mimo.js"

interface SupervisorOptions {
  host: string
  preferredPort: number
  workspaceRoot: string
  findExistingPort: () => Promise<number | null>
  findAvailablePort: () => Promise<number>
  startServer: (host: string, port: number, workspaceRoot: string) => Promise<MimoServerInfo>
  stopServer: () => Promise<void>
  stopManagedServers: () => Promise<void>
  listManagedServers: () => unknown
}

export function createMimoSupervisor(options: SupervisorOptions) {
  let base: MimoServerInfo = { url: `http://${options.host}:${options.preferredPort}`, port: options.preferredPort, pid: 0 }
  let managed = false

  function setBase(next: MimoServerInfo) {
    base.url = next.url
    base.port = next.port
    base.pid = next.pid
  }

  async function ensureBase() {
    const existingPort = await options.findExistingPort()
    if (existingPort !== null) {
      setBase({ url: `http://${options.host}:${existingPort}`, port: existingPort, pid: 0 })
      managed = false
      return base
    }
    const port = await options.findAvailablePort()
    try {
      setBase(await options.startServer(options.host, port, options.workspaceRoot))
      managed = true
    } catch (error) {
      console.warn("[server] failed to start managed mimo serve:", error)
      managed = false
    }
    return base
  }

  async function restartBase() {
    if (!managed) return { ok: false, error: "MiMo serve is not managed by this WebUI process. Please restart the WebUI service manually." }
    await options.stopServer()
    const port = await options.findAvailablePort()
    try {
      setBase(await options.startServer(options.host, port, options.workspaceRoot))
      return { ok: true, url: base.url }
    } catch (error) {
      managed = false
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function stopAll() {
    if (managed) await options.stopServer()
    await options.stopManagedServers()
  }

  return {
    ensureBase,
    restartBase,
    stopAll,
    status: () => ({ base, managed, projectServers: options.listManagedServers() }),
  }
}

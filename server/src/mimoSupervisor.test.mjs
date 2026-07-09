import assert from "node:assert/strict"
import { createMimoSupervisor } from "./mimoSupervisor.ts"

let started = 0
let stopped = 0
const supervisor = createMimoSupervisor({
  host: "127.0.0.1",
  preferredPort: 4096,
  workspaceRoot: "/tmp/project",
  findExistingPort: async () => null,
  findAvailablePort: async () => 4096,
  startServer: async () => {
    started += 1
    return { url: "http://127.0.0.1:4096", port: 4096, pid: 123 }
  },
  stopServer: async () => {
    stopped += 1
  },
  stopManagedServers: async () => undefined,
  listManagedServers: () => [],
})

await supervisor.ensureBase()
assert.equal(started, 1)
assert.equal(supervisor.status().managed, true)
assert.equal(supervisor.status().base.url, "http://127.0.0.1:4096")
await supervisor.restartBase()
assert.equal(stopped, 1)
assert.equal(started, 2)
await supervisor.stopAll()
assert.equal(stopped, 2)

console.log("mimo supervisor tests passed")

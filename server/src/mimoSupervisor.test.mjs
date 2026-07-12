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
assert.equal(supervisor.status().restartCount, 1)
assert.equal(supervisor.status().consecutiveFailures, 0)
assert.equal(supervisor.status().lastRestartReason, "operator_request")
assert.equal(typeof supervisor.status().lastRestartAt, "string")
assert.equal(typeof supervisor.status().lastHealthyAt, "string")
assert.equal(typeof supervisor.status().startupDurationMs, "number")
await supervisor.stopAll()
assert.equal(stopped, 2)

let releaseStart
let concurrentStarts = 0
const concurrent = createMimoSupervisor({
  host: "127.0.0.1",
  preferredPort: 4096,
  workspaceRoot: "/tmp/project",
  findExistingPort: async () => null,
  findAvailablePort: async () => 4096,
  startServer: async () => {
    concurrentStarts += 1
    await new Promise((resolve) => { releaseStart = resolve })
    return { url: "http://127.0.0.1:4096", port: 4096, pid: 456 }
  },
  stopServer: async () => undefined,
  stopManagedServers: async () => undefined,
  listManagedServers: () => [],
})
const starts = Array.from({ length: 20 }, () => concurrent.ensureBase())
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(concurrentStarts, 1, "concurrent ensureBase calls must share one start")
assert.equal(concurrent.status().state, "starting")
releaseStart()
await Promise.all(starts)
assert.equal(concurrent.status().state, "running")

let restartStarts = 0
let restartStops = 0
const restarting = createMimoSupervisor({
  host: "127.0.0.1",
  preferredPort: 4096,
  workspaceRoot: "/tmp/project",
  findExistingPort: async () => null,
  findAvailablePort: async () => 4096,
  startServer: async () => ({ url: "http://127.0.0.1:4096", port: 4096, pid: ++restartStarts }),
  stopServer: async () => { restartStops += 1; await new Promise((resolve) => setTimeout(resolve, 5)) },
  stopManagedServers: async () => undefined,
  listManagedServers: () => [],
})
await restarting.ensureBase()
await Promise.all(Array.from({ length: 10 }, () => restarting.restartBase()))
assert.equal(restartStops, 1, "concurrent restarts must share one stop/start operation")
assert.equal(restartStarts, 2)
assert.equal(restarting.status().state, "running")
assert.equal(restarting.status().restartCount, 1)

let failures = 0
const failing = createMimoSupervisor({
  host: "127.0.0.1",
  preferredPort: 4096,
  workspaceRoot: "/tmp/project",
  findExistingPort: async () => null,
  findAvailablePort: async () => 4096,
  startServer: async () => {
    failures += 1
    if (failures > 1) throw new Error("restart failed")
    return { url: "http://127.0.0.1:4096", port: 4096, pid: 789 }
  },
  stopServer: async () => undefined,
  stopManagedServers: async () => undefined,
  listManagedServers: () => [],
})
await failing.ensureBase()
await failing.restartBase("health_check_failed")
assert.equal(failing.status().restartCount, 1)
assert.equal(failing.status().consecutiveFailures, 1)
assert.equal(failing.status().lastRestartReason, "health_check_failed")
assert.equal(failing.status().state, "degraded")

console.log("mimo supervisor tests passed")

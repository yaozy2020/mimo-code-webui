import assert from "node:assert/strict"
import fs from "node:fs"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { appendProcessLog, createMimoRunArgs, runMimoPromptProcess } from "./mimo.ts"

assert.deepEqual(
  createMimoRunArgs({ model: "openai/gpt-4o", prompt: "quote ' and ; rm -rf /" }),
  ["run", "--model", "openai/gpt-4o", "--format", "json", "quote ' and ; rm -rf /"],
  "mimo run arguments should preserve prompt as one argv item",
)

assert.equal(appendProcessLog("1234", "5678", 6), "345678", "process logs should retain only the bounded tail")

const source = fs.readFileSync(new URL("./mimo.ts", import.meta.url), "utf8")
assert.match(source, /XDG_CONFIG_HOME: configHome/, "builtin model discovery must not inherit a broken user provider config")
assert.match(source, /fs\.rmSync\(configHome/, "builtin model discovery should remove its temporary config directory")

function mockChild(onKill) {
  const child = new EventEmitter()
  child.pid = 4321
  child.exitCode = null
  child.signalCode = null
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = (signal) => onKill(signal, child)
  return child
}

{
  const signals = []
  const controller = new AbortController()
  const child = mockChild((signal, process) => {
    signals.push(signal)
    if (signal === "SIGTERM") setTimeout(() => {
      process.signalCode = "SIGTERM"
      process.emit("exit", null, "SIGTERM")
    }, 0)
    return true
  })
  const run = runMimoPromptProcess("mimo", { model: "test/model", prompt: "wait", signal: controller.signal }, {
    spawn: () => child,
    termGraceMs: 10,
    killProcessGroup: (pid, signal) => {
      signals.push(`group:${pid}:${signal}`)
      child.signalCode = signal
      child.emit("exit", null, signal)
    },
  })
  controller.abort(new Error("route timeout"))
  await assert.rejects(run, /route timeout/)
  assert.deepEqual(signals, ["group:-4321:SIGTERM"], "POSIX TERM must target the spawned process group")
}

{
  const signals = []
  const controller = new AbortController()
  const child = mockChild((signal) => {
    signals.push(signal)
    return true
  })
  const run = runMimoPromptProcess("mimo", { model: "test/model", prompt: "wait", signal: controller.signal }, {
    spawn: () => child,
    termGraceMs: 5,
    killProcessGroup: (pid, signal) => {
      signals.push(`group:${pid}:${signal}`)
      if (signal === "SIGKILL") {
        child.signalCode = signal
        child.emit("exit", null, signal)
      }
    },
  })
  controller.abort(new Error("route timeout"))
  await assert.rejects(run, /route timeout/)
  assert.deepEqual(signals, ["group:-4321:SIGTERM", "group:-4321:SIGKILL"], "POSIX TERM and KILL must target the spawned process group")
}

{
  const signals = []
  const controller = new AbortController()
  const child = mockChild((signal) => {
    signals.push(signal)
    return true
  })
  const run = runMimoPromptProcess("mimo", { model: "test/model", prompt: "wait", signal: controller.signal }, {
    spawn: () => child,
    termGraceMs: 5,
    killConfirmationMs: 5,
    killProcessGroup: (pid, signal) => signals.push(`group:${pid}:${signal}`),
  })
  controller.abort(new Error("route timeout"))
  await assert.rejects(run, /route timeout/)
  assert.deepEqual(signals, ["group:-4321:SIGTERM", "group:-4321:SIGKILL"], "KILL confirmation must have a bounded timeout")
}

{
  const signals = []
  const controller = new AbortController()
  const child = mockChild((signal) => {
    signals.push(signal)
    return true
  })
  const run = runMimoPromptProcess("mimo", { model: "test/model", prompt: "wait", signal: controller.signal }, {
    spawn: () => child,
    platform: "win32",
    termGraceMs: 5,
    killConfirmationMs: 5,
  })
  controller.abort(new Error("route timeout"))
  await assert.rejects(run, /route timeout/)
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"], "Windows must signal the child rather than a negative process group")
}

{
  const controller = new AbortController()
  const child = mockChild(() => {
    throw new Error("child-level signal should not be used on POSIX")
  })
  const run = runMimoPromptProcess("mimo", { model: "test/model", prompt: "wait", signal: controller.signal }, {
    spawn: () => child,
    termGraceMs: 5,
    killProcessGroup: () => {
      const error = new Error("operation not permitted")
      error.code = "EPERM"
      throw error
    },
  })
  controller.abort(new Error("route timeout"))
  await assert.rejects(run, /operation not permitted/)
}

{
  const controller = new AbortController()
  const child = mockChild(() => {
    throw new Error("child-level signal should not be used on POSIX")
  })
  const run = runMimoPromptProcess("mimo", { model: "test/model", prompt: "wait", signal: controller.signal }, {
    spawn: () => child,
    killProcessGroup: () => {
      const error = new Error("no such process")
      error.code = "ESRCH"
      throw error
    },
  })
  controller.abort(new Error("route timeout"))
  await assert.rejects(run, /route timeout/, "ESRCH should be treated as an already-exited process group")
}

{
  const child = mockChild(() => true)
  const run = runMimoPromptProcess("mimo", { model: "test/model", prompt: "wait", signal: new AbortController().signal }, {
    spawn: () => child,
  })
  child.stdout.end("not-json-at-eof")
  child.exitCode = 0
  child.emit("exit", 0, null)
  await assert.rejects(run, /invalid JSON output/, "malformed EOF output must fail closed")
}

console.log("mimo command tests passed")

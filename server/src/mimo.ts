import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { execFile, spawn as nodeSpawn, type ChildProcess } from "node:child_process"
import crossSpawn, { spawn } from "cross-spawn"

const sleep = promisify(setTimeout)

export interface MimoServerInfo {
  url: string
  port: number
  pid: number
}

let activeProcess: ChildProcess | null = null
let activePort: number | null = null

function getMimoCommand(): string | null {
  const platform = os.platform()
  const candidates = platform === "win32" ? ["mimo.cmd", "mimo.exe", "mimo"] : ["mimo"]

  for (const cmd of candidates) {
    try {
      const result = crossSpawn.sync(cmd, ["--version"], { stdio: "ignore" })
      if (result.status === 0) {
        return cmd
      }
    } catch {
      // try next
    }
  }

  // Check common install locations
  const home = os.homedir()
  const commonPaths: string[] = []
  if (platform === "win32") {
    commonPaths.push(path.join(home, ".mimocode", "bin", "mimo.exe"))
  } else {
    commonPaths.push(path.join(home, ".mimocode", "bin", "mimo"))
    commonPaths.push(path.join(home, ".local", "bin", "mimo"))
    commonPaths.push("/usr/local/bin/mimo")
    commonPaths.push("/usr/bin/mimo")
  }

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  return null
}

export function detectMimo(): { command: string; path: string } | null {
  const command = getMimoCommand()
  if (!command) return null
  return { command, path: command }
}

export async function listBuiltinModels(): Promise<Array<{ providerID: string; modelID: string; name: string }>> {
  const mimo = detectMimo()
  if (!mimo) return []

  return new Promise((resolve) => {
    execFile(mimo.command, ["models"], { timeout: 10000 }, (error, stdout) => {
      if (error) {
        console.warn("[mimo] failed to list models:", error.message)
        resolve([])
        return
      }

      const models = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.includes("/"))
        .map((line) => {
          const [providerID, modelID] = line.split("/", 2)
          return { providerID, modelID, name: modelID }
        })
      resolve(models)
    })
  })
}

export async function runMimoPrompt(input: { model: string; prompt: string }): Promise<{ text: string }> {
  const mimo = detectMimo()
  if (!mimo) throw new Error("MiMo-Code CLI (mimo) not found")

  return new Promise((resolve, reject) => {
    const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
    const command = [mimo.command, "run", "--model", input.model, "--format", "json", input.prompt]
      .map(quote)
      .join(" ")
    const proc = nodeSpawn(command, {
      shell: true,
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      proc.kill("SIGTERM")
      reject(new Error("mimo run timed out"))
    }, 120000)

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    proc.on("exit", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(stderr.trim() || `mimo run exited with code ${code}`))
        return
      }

      const textParts: string[] = []
      for (const line of stdout.split("\n").map((item) => item.trim()).filter(Boolean)) {
        try {
          const event = JSON.parse(line) as { type?: string; part?: { type?: string; text?: string }; error?: { data?: { message?: string }; message?: string } }
          if (event.type === "error") {
            reject(new Error(event.error?.data?.message || event.error?.message || "mimo run failed"))
            return
          }
          if (event.part?.type === "text" && event.part.text) textParts.push(event.part.text)
        } catch (error) {
          if (!(error instanceof SyntaxError)) {
            reject(error instanceof Error ? error : new Error(String(error)))
            return
          }
        }
      }

      resolve({ text: textParts.join("\n") || stdout.trim() })
    })
  })
}

export async function probeNativeModel(input: { baseUrl: string; model: string; prompt?: string }): Promise<{ supported: boolean; text?: string; reason?: string }> {
  const [providerID, modelID] = input.model.split("/", 2)
  if (!providerID || !modelID) return { supported: false, reason: "invalid model id" }

  const prompt = input.prompt ?? "native model probe，请只回复 OK"
  const sessionResponse = await fetch(`${input.baseUrl}/session`, { method: "POST" })
  if (!sessionResponse.ok) return { supported: false, reason: `session create failed: ${sessionResponse.status}` }
  const session = (await sessionResponse.json()) as { id?: string }
  if (!session.id) return { supported: false, reason: "session create returned no id" }

  const promptResponse = await fetch(`${input.baseUrl}/session/${session.id}/prompt_async`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionID: session.id,
      agent: "build",
      model: { providerID, modelID },
      parts: [{ type: "text", text: prompt }],
    }),
  })
  if (!promptResponse.ok) return { supported: false, reason: `prompt failed: ${promptResponse.status}` }

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    await sleep(1000)
    const messagesResponse = await fetch(`${input.baseUrl}/session/${session.id}/message?limit=20`)
    if (!messagesResponse.ok) continue
    const messages = (await messagesResponse.json()) as Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
    const assistant = messages.find((message) => message.info?.role === "assistant" && message.parts?.some((part) => part.type === "text" && part.text))
    const text = assistant?.parts
      ?.filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n")
    if (text) return { supported: true, text }
  }

  return { supported: false, reason: "no assistant text from native prompt_async" }
}

export async function startMimoServer(hostname = "127.0.0.1", port = 4096, workspaceRoot = process.cwd()): Promise<MimoServerInfo> {
  if (activeProcess && !activeProcess.killed) {
    return { url: `http://${hostname}:${activePort ?? port}`, port: activePort ?? port, pid: activeProcess.pid ?? 0 }
  }

  const mimo = detectMimo()
  if (!mimo) {
    throw new Error("MiMo-Code CLI (mimo) not found. Please install it first: https://github.com/XiaomiMiMo/MiMo-Code")
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(mimo.command, ["serve", `--hostname=${hostname}`, `--port=${port}`], {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })

    activeProcess = proc
    activePort = port

    let stdout = ""
    let stderr = ""
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        proc.kill()
        reject(new Error(`Timeout waiting for mimo serve to start on port ${port}`))
      }
    }, 30000)

    let buffer = ""
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        console.log(`[mimo] ${line}`)

        if (line.includes("server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (match) {
            clearTimeout(timeout)
            resolved = true
            const url = match[1]
            resolve({ url, port, pid: proc.pid ?? 0 })
          }
        }
      }
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      console.error(`[mimo stderr] ${chunk.toString().trim()}`)
    })

    proc.on("error", (error) => {
      clearTimeout(timeout)
      if (!resolved) {
        reject(new Error(`Failed to start mimo serve: ${error.message}`))
      }
    })

    proc.on("exit", (code) => {
      activeProcess = null
      activePort = null
      clearTimeout(timeout)
      if (!resolved) {
        reject(new Error(`mimo serve exited with code ${code}.\nstdout: ${stdout}\nstderr: ${stderr}`))
      }
    })
  })
}

export async function stopMimoServer(): Promise<void> {
  if (!activeProcess) return

  activeProcess.kill("SIGTERM")
  let waited = 0
  while (!activeProcess.killed && waited < 5000) {
    await sleep(100)
    waited += 100
  }
  if (!activeProcess.killed) {
    activeProcess.kill("SIGKILL")
  }
  activeProcess = null
  activePort = null
}

export async function checkHealth(url: string): Promise<{ healthy: boolean; version?: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${url}/global/health`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) {
      return { healthy: false }
    }
    const data = (await response.json()) as { healthy?: boolean; version?: string }
    return { healthy: data.healthy === true, version: data.version }
  } catch {
    return { healthy: false }
  }
}

export function getActiveMimoProcess(): ChildProcess | null {
  return activeProcess
}

import { fetchJson } from "@/api/client"

export interface FileContent {
  type: "text" | "binary"
  content: string
  diff?: string
  encoding?: "base64"
  mimeType?: string
}

export async function readFileContent(path: string): Promise<FileContent> {
  return fetchJson<FileContent>(`/file/content?path=${encodeURIComponent(path)}`)
}

import { fetchJson } from "@/api/client"

export interface FileContent {
  type: "text" | "binary"
  content: string
  diff?: string
  encoding?: "base64"
  mimeType?: string
}

export async function readFileContent(path: string, directory?: string): Promise<FileContent> {
  const query = new URLSearchParams({ path })
  if (directory) query.set("directory", directory)
  return fetchJson<FileContent>(`/file/content?${query.toString()}`)
}

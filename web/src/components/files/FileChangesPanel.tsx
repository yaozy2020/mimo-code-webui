import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { readFileContent, type FileContent } from "@/api/file"
import { Button } from "@/components/ui/button"
import type { SnapshotFileDiff } from "@/types"
import { cn } from "@/lib/utils"

interface FileChangesPanelProps {
  diffs: SnapshotFileDiff[]
  onClose: () => void
}

export function FileChangesPanel({ diffs, onClose }: FileChangesPanelProps) {
  const [selectedFile, setSelectedFile] = useState(diffs[0]?.file ?? "")
  const [content, setContent] = useState<FileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedDiff = diffs.find((diff) => diff.file === selectedFile) ?? diffs[0]

  useEffect(() => {
    if (!selectedDiff) return
    setSelectedFile((current) => current || selectedDiff.file)
  }, [selectedDiff])

  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false
    setLoading(true)
    setError(null)

    readFileContent(selectedFile)
      .then((result) => {
        if (!cancelled) setContent(result)
      })
      .catch((error) => {
        if (!cancelled) setError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedFile])

  return (
    <aside className="fixed inset-x-2 bottom-2 top-16 z-30 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl lg:static lg:inset-auto lg:z-auto lg:w-[420px] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">文件变更</h2>
          <p className="text-xs text-muted-foreground">{diffs.length} 个文件</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} title="关闭文件变更面板">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] overflow-hidden">
        <div className="max-h-36 overflow-auto border-b p-2 sm:max-h-44">
          {diffs.map((diff) => (
            <button
              key={diff.file}
              className={cn(
                "mb-1 w-full rounded-md border px-2 py-2 text-left text-xs hover:bg-muted",
                selectedFile === diff.file && "border-primary bg-muted",
              )}
              onClick={() => setSelectedFile(diff.file)}
            >
              <div className="truncate font-medium" title={diff.file}>{diff.file}</div>
              <div className="mt-1 text-muted-foreground">
                {diff.status ?? "modified"} +{diff.additions} -{diff.deletions}
              </div>
            </button>
          ))}
        </div>

        <div className="min-h-0 overflow-auto p-3 text-xs">
          {selectedDiff && (
            <section className="mb-4">
              <h3 className="mb-2 font-semibold">Patch</h3>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted p-3 [overflow-wrap:anywhere] sm:max-h-64">
                {selectedDiff.patch || "这个变更没有 patch 内容。"}
              </pre>
            </section>
          )}

          <section>
            <h3 className="mb-2 font-semibold">当前文件内容</h3>
            {loading && <div className="rounded-md border p-3 text-muted-foreground">正在读取文件...</div>}
            {error && <div className="rounded-md border border-destructive p-3 text-destructive">读取失败：{error}</div>}
            {!loading && !error && content?.type === "binary" && (
              <div className="rounded-md border p-3 text-muted-foreground">二进制文件暂不预览。</div>
            )}
            {!loading && !error && content?.type === "text" && (
              <pre className="max-h-[42dvh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted p-3 [overflow-wrap:anywhere] lg:max-h-[52vh]">
                {content.content}
              </pre>
            )}
          </section>
        </div>
      </div>
    </aside>
  )
}

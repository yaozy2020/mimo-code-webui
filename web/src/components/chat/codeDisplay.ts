const INLINE_CODE_BASE =
  "rounded-md border border-slate-300/80 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)] dark:border-slate-600/80 dark:bg-slate-800 dark:text-slate-50 dark:shadow-none"

const CODE_BLOCK_BASE = "inline-block min-w-max whitespace-pre font-mono"

export function inlineCodeClassName(value: unknown) {
  const text = String(value ?? "")
  if (text.length > 28 || /[\w.-]+\/[\w./-]+/.test(text) || /\s--?\w/.test(text)) {
    return `${INLINE_CODE_BASE} inline-block max-w-full overflow-x-auto whitespace-nowrap align-bottom [-webkit-overflow-scrolling:touch]`
  }
  return INLINE_CODE_BASE
}

export function codeBlockClassName() {
  return CODE_BLOCK_BASE
}

export function codeBlockText(value: unknown): string {
  if (value === undefined || value === null || typeof value === "boolean") return ""
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.map(codeBlockText).join("")
  if (typeof value === "object" && "props" in value) {
    return codeBlockText((value as { props?: { children?: unknown } }).props?.children)
  }
  return ""
}

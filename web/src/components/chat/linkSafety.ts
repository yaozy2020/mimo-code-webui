const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

export function getSafeExternalHref(href: string | undefined): string | null {
  if (!href) return null
  try {
    const url = new URL(href)
    return SAFE_LINK_PROTOCOLS.has(url.protocol) ? href : null
  } catch {
    return null
  }
}

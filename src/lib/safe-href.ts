// Returns a safe href value. Whitelists http, https, mailto, tel schemes.
// Anything else (javascript:, data:, vbscript:, etc.) returns '#'.
// Relative paths (starting with / or without a scheme) pass through.
export function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  const trimmed = url.trim()
  if (!trimmed) return '#'
  // Relative paths (start with /) are safe — same origin.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  try {
    const parsed = new URL(trimmed)
    const ok = ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
    return ok ? parsed.toString() : '#'
  } catch {
    return '#'
  }
}

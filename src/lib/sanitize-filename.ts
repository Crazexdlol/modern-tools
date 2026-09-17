// Strip anything that could break the Content-Disposition header or enable
// header injection. Preserves letters, digits, dot, dash, underscore.
export function sanitizeFilename(name: string): string {
  return String(name || 'file').replace(/[^\w.-]/g, '_').slice(0, 200)
}

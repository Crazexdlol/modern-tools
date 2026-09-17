import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** Throw when a company doesn't have a template file for a report. */
export class NoTemplateError extends Error {
  code = 'NO_TEMPLATE' as const
  constructor(public companySlug: string, public templateRelPath: string) {
    super(`No template configured for company '${companySlug}' at templates/${templateRelPath}. Contact your admin.`)
    this.name = 'NoTemplateError'
  }
}

export const NO_TEMPLATE_CODE = 'NO_TEMPLATE' as const

/**
 * Resolves a template's absolute path for the given company. Throws
 * NoTemplateError if the file doesn't exist so callers can catch it and
 * surface an empty-state message to the UI.
 *
 * `templateRelPath` is relative to the company's templates/ folder — e.g.
 * `'acv-template.pdf'` or `'dv-templates/dv-nationwide-attorney.pdf'`.
 */
export function getTemplatePath(companySlug: string, templateRelPath: string): string {
  const abs = path.join(process.cwd(), 'public', 'companies', companySlug, 'templates', templateRelPath)
  if (!existsSync(abs)) {
    throw new NoTemplateError(companySlug, templateRelPath)
  }
  return abs
}

/** Reads a template's raw bytes (throws NoTemplateError if missing). */
export function readTemplate(companySlug: string, templateRelPath: string): Buffer {
  return readFileSync(getTemplatePath(companySlug, templateRelPath))
}

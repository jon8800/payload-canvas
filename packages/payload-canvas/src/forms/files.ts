// Checks of a file for the `file` form field: type (as in `<input accept>`) and size. Pure and
// client-safe: the site's form checks a file when the visitor picks it, `formFileUploads` again.

import { FILE_FIELD_MAX_MB } from './fieldConfigs'

const MB = 1024 * 1024

/** The file field's limits: `accept` as in `<input accept>`, `maxSize` in MB. */
export type FileRules = { accept?: string | null; maxSize?: number | null }

/** The patterns of an `accept` text: "image/*, .pdf" -> ["image/*", ".pdf"]. */
export const acceptPatterns = (accept: string | null | undefined) =>
  (accept ?? '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)

/** The largest size in bytes: the field's own, at most `limitMb`. */
export function maxFileBytes(rules: FileRules, limitMb = FILE_FIELD_MAX_MB): number {
  const own = typeof rules.maxSize === 'number' && rules.maxSize > 0 ? rules.maxSize : limitMb
  return Math.min(own, limitMb) * MB
}

/** True when the file's type or name ending matches one of the patterns (or there are none). */
export function fileTypeAllowed(file: { name: string; mimetype: string }, accept: string | null | undefined): boolean {
  const patterns = acceptPatterns(accept)
  if (patterns.length === 0) return true
  const type = file.mimetype.toLowerCase()
  const name = file.name.toLowerCase()
  return patterns.some((p) => (p.startsWith('.') ? name.endsWith(p) : p.endsWith('/*') ? type.startsWith(p.slice(0, -1)) : type === p))
}

/** The message for a file, or '' when it is fine. */
export function fileProblem(file: { name: string; mimetype: string; size: number }, rules: FileRules, limitMb = FILE_FIELD_MAX_MB): string {
  if (!fileTypeAllowed(file, rules.accept)) return `This file type is not allowed. Allowed: ${acceptPatterns(rules.accept).join(', ')}.`
  const max = maxFileBytes(rules, limitMb)
  if (file.size > max) return `The file is too large. The limit is ${Math.round((max / MB) * 10) / 10} MB.`
  return ''
}

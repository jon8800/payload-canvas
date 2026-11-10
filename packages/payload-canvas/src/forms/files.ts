// Checks of the files of a `file` form field: their number, type (as in `<input accept>`) and size. Pure and
// client-safe: the site's form checks a file when the visitor picks it, `formFileUploads` again.

import { FILE_FIELD_MAX_MB } from './fieldConfigs'
import { maxFileCount } from './fieldSettings'

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

/** A file field's rules for the files it takes: required, several files, the most files. */
export type FileCountRules = FileRules & { required?: boolean | null; multiple?: boolean | null; maxFiles?: number | null }

/**
 * The message for the files of one file field, or '' when they are fine: none when it is required,
 * more than it takes, then each file's type and size. With several files the message names the file.
 */
export function filesProblem(files: ReadonlyArray<{ name: string; mimetype: string; size: number }>, rules: FileCountRules, limitMb = FILE_FIELD_MAX_MB): string {
  if (files.length === 0) return rules.required ? 'Choose a file.' : ''
  const most = maxFileCount(rules)
  if (files.length > most) return most === 1 ? 'Choose one file only.' : `Choose at most ${most} files.`
  for (const file of files) {
    const problem = fileProblem(file, rules, limitMb)
    if (problem) return files.length > 1 ? `${file.name}: ${problem}` : problem
  }
  return ''
}

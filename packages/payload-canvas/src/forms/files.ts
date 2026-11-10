// Checks of the files of a `file` form field: their number, type (as in `<input accept>`, checked by
// the file's ending and its MIME type; HTML, SVG, scripts and XML never) and size. Pure and
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

/** The MIME type of common file endings, to check a file's ending against MIME patterns ("image/*"). */
const MIME_OF_ENDING: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

/**
 * The types a file field takes when its `accept` is empty: images (not SVG), PDF, common office
 * documents, text and CSV. Never "any type": a stored file opens on the site's own address.
 */
export const DEFAULT_FILE_ACCEPT = '.jpg, .jpeg, .png, .gif, .webp, .avif, .heic, .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .odt, .ods, .odp, .rtf, .txt, .csv'

/** File endings never taken, whatever `accept` says: files a browser runs as a page or a script. */
export const BLOCKED_FILE_ENDINGS = ['html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'js', 'mjs', 'cjs', 'xml', 'xsl', 'xslt'] as const

/** MIME types never taken, whatever `accept` says (also every `…+xml` type). */
export const BLOCKED_MIME_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'text/ecmascript',
  'application/xml',
  'text/xml',
] as const

/** The ending of a file name, lower case, without the dot. Empty without one. */
const endingOf = (name: string) => {
  const at = name.lastIndexOf('.')
  return at > 0 ? name.slice(at + 1).trim().toLowerCase() : ''
}

/** The MIME type without parameters, lower case. */
const baseType = (mimetype: string) => mimetype.split(';')[0]!.trim().toLowerCase()

/** True for a file that is never taken: its ending or MIME type is one a browser runs (HTML, SVG, scripts, XML). */
export function fileTypeBlocked(file: { name: string; mimetype: string }): boolean {
  const type = baseType(file.mimetype)
  return (BLOCKED_FILE_ENDINGS as readonly string[]).includes(endingOf(file.name)) || (BLOCKED_MIME_TYPES as readonly string[]).includes(type) || type.endsWith('+xml')
}

/** True when a MIME type matches a pattern ("image/*", "application/pdf"). */
const mimeMatches = (type: string, pattern: string) => (pattern.endsWith('/*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern)

/**
 * True when the field takes the file: never a blocked type (`fileTypeBlocked`); else its name ends
 * with one of the endings in `accept` (".pdf"), or both its MIME type and the type of its ending
 * match a MIME pattern ("image/*"), so a file never passes on the type the browser claims alone.
 * An empty `accept` takes `DEFAULT_FILE_ACCEPT`.
 */
export function fileTypeAllowed(file: { name: string; mimetype: string }, accept: string | null | undefined): boolean {
  if (fileTypeBlocked(file)) return false
  const own = acceptPatterns(accept)
  const patterns = own.length > 0 ? own : acceptPatterns(DEFAULT_FILE_ACCEPT)
  const type = baseType(file.mimetype)
  const ending = endingOf(file.name)
  const endingType = MIME_OF_ENDING[ending]
  return patterns.some((p) => (p.startsWith('.') ? ending === p.slice(1) : endingType !== undefined && mimeMatches(type, p) && mimeMatches(endingType, p)))
}

/** The message for a file, or '' when it is fine. */
export function fileProblem(file: { name: string; mimetype: string; size: number }, rules: FileRules, limitMb = FILE_FIELD_MAX_MB): string {
  if (!fileTypeAllowed(file, rules.accept)) {
    const own = acceptPatterns(rules.accept)
    return `This file type is not allowed. Allowed: ${own.length > 0 ? own.join(', ') : 'images, PDF, office documents, text and CSV files'}.`
  }
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

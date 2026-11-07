import fs from 'node:fs'
import path from 'node:path'

import { FEATURES } from './config.js'

/**
 * The starter's list of features. Each one names the files and scripts to delete when it is off.
 * Labels and hints for the prompt are in `FEATURES` (config.ts).
 */
export const MANIFEST_FILE = 'starter-features.json'
/** Payload writes this file. It imports every admin component by path. */
export const IMPORT_MAP_FILE = 'src/app/(payload)/admin/importMap.js'

export type ManifestFeature = { id: string; paths: string[]; scripts?: string[] }
export type Manifest = { features: ManifestFeature[] }

const OPEN = /@feature:([\w-]+)/
const CLOSE = /@end:([\w-]+)/
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', '.git', '.tarballs'])

/**
 * Removes the marked regions of features that are off. A line with `@feature:<id>` opens a region
 * and a line with `@end:<id>` closes it. The marker lines always go. The lines between them go
 * when `<id>` is not in `enabledIds`. `file` only makes error messages clearer.
 */
export function stripRegions(text: string, enabledIds: Iterable<string>, file = 'text'): string {
  const enabled = new Set(enabledIds)
  const open: { id: string; line: number }[] = []
  const kept: string[] = []
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    const start = OPEN.exec(line)
    if (start) {
      open.push({ id: start[1], line: index + 1 })
      return
    }
    const end = CLOSE.exec(line)
    if (end) {
      const last = open.pop()
      if (!last) throw new Error(`${file}:${index + 1}: "@end:${end[1]}" has no matching "@feature:${end[1]}".`)
      if (last.id !== end[1]) {
        throw new Error(`${file}:${index + 1}: "@end:${end[1]}" closes "@feature:${last.id}" from line ${last.line}.`)
      }
      return
    }
    if (open.every((region) => enabled.has(region.id))) kept.push(line)
  })
  const unclosed = open.pop()
  if (unclosed) throw new Error(`${file}:${unclosed.line}: "@feature:${unclosed.id}" is never closed with "@end:${unclosed.id}".`)
  return kept.join('\n')
}

/** The part of a deleted `src/` path that importMap.js uses, e.g. `src/admin/nav` -> `/admin/nav`. */
function importMapKey(removedPath: string): string | null {
  const rel = removedPath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!rel.startsWith('src/')) return null
  return rel.slice('src'.length).replace(/\.[cm]?[jt]sx?$/, '')
}

/**
 * Removes the importMap.js lines that point into deleted files or folders: the import lines
 * and the map entries. `removedPaths` are relative to the project root, like `src/admin/nav`.
 */
export function stripImportMap(text: string, removedPaths: string[]): string {
  const keys = removedPaths.map(importMapKey).filter((key): key is string => key !== null)
  if (keys.length === 0) return text
  // The key must end at a path separator, a quote or the `#export` part, so `/admin/nav` does not match `/admin/navbar`.
  const pointsIntoRemoved = (line: string) =>
    keys.some((key) => {
      let at = line.indexOf(key)
      while (at !== -1) {
        if (/^[/'"#]/.test(line.slice(at + key.length))) return true
        at = line.indexOf(key, at + 1)
      }
      return false
    })
  return text
    .split('\n')
    .filter((line) => !pointsIntoRemoved(line))
    .join('\n')
}

/** Reads `starter-features.json`. Returns null when the starter has none (older versions). */
export function readManifest(targetDir: string): Manifest | null {
  const file = path.join(targetDir, MANIFEST_FILE)
  if (!fs.existsSync(file)) return null
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest
  if (!Array.isArray(manifest.features)) throw new Error(`${MANIFEST_FILE} has no "features" list.`)
  return manifest
}

/** Resolves a manifest path inside the project. Throws if it points outside. */
function resolveInside(targetDir: string, rel: string): string {
  const full = path.resolve(targetDir, rel)
  const back = path.relative(targetDir, full)
  if (!back || back.startsWith('..') || path.isAbsolute(back)) throw new Error(`${MANIFEST_FILE}: "${rel}" is outside the project.`)
  return full
}

/** All files under `dir`, without dependency and build folders. */
function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : listFiles(full)
    return entry.isFile() ? [full] : []
  })
}

/** The project files that hold `@feature:` or `@end:` markers, with their text. */
export function filesWithMarkers(targetDir: string): { file: string; text: string }[] {
  return listFiles(targetDir).flatMap((file) => {
    const buffer = fs.readFileSync(file)
    if (buffer.includes(0)) return [] // binary file
    const text = buffer.toString('utf8')
    return OPEN.test(text) || CLOSE.test(text) ? [{ file, text }] : []
  })
}

/**
 * Turns the starter's features on or off in a copied project. For each known feature that is not in
 * `enabledIds`, it deletes the feature's files, its package.json scripts, its marked regions and its
 * importMap.js lines. Then it deletes `starter-features.json`.
 * Returns the ids it turned off, or null when the starter has no manifest (then it changes nothing).
 */
export function applyFeatures(targetDir: string, enabledIds: Iterable<string>): string[] | null {
  const manifest = readManifest(targetDir)
  if (!manifest) return null

  const enabled = new Set(enabledIds)
  const known = new Set<string>(FEATURES.map((feature) => feature.id))
  const off = manifest.features.filter((feature) => known.has(feature.id) && !enabled.has(feature.id))
  const offIds = new Set(off.map((feature) => feature.id))
  const keptIds = manifest.features.map((feature) => feature.id).filter((id) => !offIds.has(id))

  // Marked regions. Do this before deleting files, so a bad marker stops everything early.
  for (const { file, text } of filesWithMarkers(targetDir)) {
    const rel = path.relative(targetDir, file).split(path.sep).join('/')
    for (const match of text.matchAll(/@(?:feature|end):([\w-]+)/g)) {
      if (!manifest.features.some((feature) => feature.id === match[1])) {
        throw new Error(`${rel} marks "${match[1]}", but ${MANIFEST_FILE} has no feature with that id.`)
      }
    }
    fs.writeFileSync(file, stripRegions(text, keptIds, rel))
  }

  // Files and folders.
  const removedPaths = off.flatMap((feature) => feature.paths)
  for (const rel of removedPaths) fs.rmSync(resolveInside(targetDir, rel), { recursive: true, force: true })

  const importMap = path.join(targetDir, IMPORT_MAP_FILE)
  if (removedPaths.length > 0 && fs.existsSync(importMap)) {
    fs.writeFileSync(importMap, stripImportMap(fs.readFileSync(importMap, 'utf8'), removedPaths))
  }

  // package.json scripts.
  const scripts = off.flatMap((feature) => feature.scripts ?? [])
  const pkgFile = path.join(targetDir, 'package.json')
  if (scripts.length > 0 && fs.existsSync(pkgFile)) {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> }
    for (const name of scripts) delete pkg.scripts?.[name]
    fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
  }

  fs.rmSync(path.join(targetDir, MANIFEST_FILE))
  return [...offIds]
}

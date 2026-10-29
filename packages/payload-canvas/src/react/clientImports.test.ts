// A site page ships the JavaScript of every client component it imports, and of everything those
// import. Bundlers keep whole modules, so a client component that imports one constant from a
// module of block definitions ships all the definitions. This test keeps the site's client
// components (everything under react/ but the editor canvas) away from heavy modules.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STATEMENT = /^\s*(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

function resolveLocal(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`Cannot resolve ${specifier} from ${from}`)
}

/** Every module reached from `entry` through static runtime imports (`import()` is a chunk of its own). */
function reached(entry: string): { files: string[]; packages: string[] } {
  const seen = new Set<string>()
  const packages = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(STATEMENT)) {
      const [, typeOnly, specifier = ''] = match
      if (typeOnly) continue
      if (specifier.startsWith('.')) visit(resolveLocal(file, specifier))
      else packages.add(specifier)
    }
  }
  visit(entry)
  return { files: [...seen].map((file) => path.relative(src, file).replaceAll('\\', '/')), packages: [...packages] }
}

function clientModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'canvas' ? [] : clientModules(full)
    if (!/\.tsx?$/.test(entry.name) || /\.test(-data)?\.ts$/.test(entry.name)) return []
    return /^\s*['"]use client['"]/.test(readFileSync(full, 'utf8')) ? [full] : []
  })
}

/** Modules a site's client component must never reach. */
const HEAVY = [
  /^blocks\/(index|defaults|link|payload)\.ts$/,
  /^blocks\/builtins\//,
  /^core\/(index|bindings|blocks|tree|schema|validate|operations)\.ts$/,
  /^(ai|admin|plugin|live|mcp|migrate)\//,
  /^css\/(?!marker\.ts$)/,
]
// next/link: the menu's client-side navigation (`clientLinks`). Next ships it on every page anyway.
// Embla: the carousel, which loads only on pages that have one.
const ALLOWED_PACKAGES = new Set([
  'react',
  'react-dom',
  'next/dynamic',
  'next/link',
  'next/navigation',
  'embla-carousel-react',
  'embla-carousel-fade',
])

describe('site client components', () => {
  const modules = clientModules(path.join(src, 'react'))

  it('finds the client components', () => {
    const names = modules.map((file) => path.basename(file))
    for (const name of ['Menu.tsx', 'Carousel.tsx', 'Popup.tsx', 'Tabs.tsx', 'lazy.tsx']) assert.ok(names.includes(name), name)
  })

  for (const file of modules) {
    const name = path.relative(src, file).replaceAll('\\', '/')
    it(`${name} ships no block definitions, AI text, Payload or the Tailwind compiler`, () => {
      const { files, packages } = reached(file)
      assert.deepEqual(files.filter((reachedFile) => HEAVY.some((pattern) => pattern.test(reachedFile))), [])
      assert.deepEqual(packages.filter((specifier) => !ALLOWED_PACKAGES.has(specifier)), [])
    })
  }
})

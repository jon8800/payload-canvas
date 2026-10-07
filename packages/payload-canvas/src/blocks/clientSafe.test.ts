// The `./blocks` and `./core` entries run in the browser (canvas iframe, admin). They must not
// pull in `node:` modules or Payload's runtime. Type-only imports are erased, so they are allowed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

/** Every runtime import of a non-relative module, reached from `entry` through relative imports. */
function runtimeImports(entry: string): string[] {
  const seen = new Set<string>()
  const found: string[] = []
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(STATEMENT)) {
      const [, typeOnly, specifier = ''] = match
      if (typeOnly) continue
      if (specifier.startsWith('.')) visit(resolveLocal(file, specifier))
      else found.push(`${path.relative(src, file)}: ${specifier}`)
    }
  }
  visit(entry)
  return found
}

describe('client-safe entries', () => {
  it('the check finds runtime imports (server code fails it)', () => {
    const found = runtimeImports(path.join(src, 'plugin/hook.ts'))
    assert.ok(found.some((line) => line.endsWith(': node:crypto')))
    assert.ok(found.some((line) => line.endsWith(': payload')))
  })

  for (const entry of ['blocks/index.ts', 'core/index.ts']) {
    it(`${entry} has no runtime imports outside the package`, () => {
      assert.deepEqual(runtimeImports(path.join(src, entry)), [])
    })
  }
})

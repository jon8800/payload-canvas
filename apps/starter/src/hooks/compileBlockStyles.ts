import fs from 'node:fs'
import path from 'node:path'
import { compile } from 'tailwindcss'
import type { CollectionBeforeChangeHook } from 'payload'
import { getBlockStyles } from '../lib/blockStyles'

type BlockLike = {
  id?: string
  blockType?: string
  styles?: Record<string, any>
  children?: BlockLike[]
  [key: string]: unknown
}

/** Recursively walk a block tree and collect ALL classes + scoped CSS */
function walkBlocks(
  blocks: BlockLike[] | undefined,
  allClasses: Set<string>,
  scopedCSS: string[],
): void {
  if (!blocks) return

  for (const block of blocks) {
    // Collect ALL classes that getBlockStyles would produce (preset + custom)
    // This ensures every class on the element has a corresponding CSS rule
    const { className } = getBlockStyles(block.styles)
    if (className) {
      for (const cls of className.split(/\s+/).filter(Boolean)) {
        allClasses.add(cls)
      }
    }

    // Scope inline CSS to block id
    const inlineCSS = block.styles?.customCSS?.inlineCSS
    if (inlineCSS && block.id) {
      scopedCSS.push(`#block-${block.id} { ${inlineCSS} }`)
    }

    // Recurse into child blocks (Container, Grid, etc.)
    if (Array.isArray(block.children)) {
      walkBlocks(block.children, allClasses, scopedCSS)
    }
  }
}

/**
 * Extract utility rules and their required theme variables from Tailwind build output.
 *
 * The full build includes @layer theme (CSS variables), @layer base (preflight reset),
 * and @layer utilities. The app's main CSS only includes theme variables for classes
 * found in source files — dynamic classes added via the style panel won't have their
 * variables defined. We extract both utilities AND any theme variables they reference
 * (e.g., --color-sky-100, --spacing) so they work independently.
 */
function extractCompiledCSS(fullCSS: string): string {
  // Extract utility rules
  const utilMatch = fullCSS.match(/@layer utilities \{([\s\S]*?)\n\}/)
  const utilityCSS = utilMatch?.[1]?.trim() || ''
  if (!utilityCSS) return ''

  // Find which CSS variables the utilities reference
  const varRefs = new Set<string>()
  for (const match of utilityCSS.matchAll(/var\((--[^)]+)\)/g)) {
    varRefs.add(match[1])
  }

  // Extract theme variable definitions for only the referenced variables
  // Tailwind v4 uses `:root, :host { ... }` inside @layer theme
  const themeMatch = fullCSS.match(/@layer theme \{[\s\S]*?:root[^{]*\{([\s\S]*?)\}\s*\}/)
  const themeVars: string[] = []
  if (themeMatch && varRefs.size > 0) {
    for (const line of themeMatch[1].split('\n')) {
      const varName = line.match(/(--[\w-]+)\s*:/)?.[1]
      if (varName && varRefs.has(varName)) {
        themeVars.push(line.trim())
      }
    }
  }

  const parts: string[] = []
  if (themeVars.length > 0) {
    parts.push(`:root { ${themeVars.join(' ')} }`)
  }
  parts.push(utilityCSS)
  return parts.join('\n')
}

async function createCompiler(): Promise<Awaited<ReturnType<typeof compile>>> {
  const twPath = path.join(process.cwd(), 'node_modules', 'tailwindcss', 'index.css')
  const twCSS = fs.readFileSync(twPath, 'utf-8')
  const twBase = path.dirname(twPath)

  return compile(twCSS, {
    base: twBase,
    loadStylesheet: async (id: string, base: string) => {
      const resolved = path.resolve(base, id)
      return {
        content: fs.readFileSync(resolved, 'utf-8'),
        base: path.dirname(resolved),
      }
    },
  })
}

export const compileBlockStyles: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
}) => {
  const layout = data.layout as BlockLike[] | undefined
  if (!layout?.length) return data

  const allClasses = new Set<string>()
  const scopedCSS: string[] = []

  walkBlocks(layout, allClasses, scopedCSS)

  // Nothing to compile — clear field
  if (allClasses.size === 0 && scopedCSS.length === 0) {
    data._compiledBlockCSS = ''
    return data
  }

  const compiledParts: string[] = []

  // Compile Tailwind classes
  if (allClasses.size > 0) {
    try {
      // Create a fresh compiler each time to avoid accumulating classes
      // across different page saves (build() is additive on a cached compiler)
      const compiler = await createCompiler()
      const fullCSS = compiler.build(Array.from(allClasses))
      const compiledCSS = extractCompiledCSS(fullCSS)
      if (compiledCSS) {
        compiledParts.push(compiledCSS)
      }
    } catch (err) {
      // Non-fatal — scoped CSS still works without compiled Tailwind
      const errMsg = err instanceof Error ? err.message : String(err)
      req.payload.logger.warn('Tailwind class compilation skipped: ' + errMsg)
    }
  }

  // Add scoped CSS
  if (scopedCSS.length > 0) {
    compiledParts.push(scopedCSS.join('\n'))
  }

  data._compiledBlockCSS = compiledParts.join('\n')
  return data
}

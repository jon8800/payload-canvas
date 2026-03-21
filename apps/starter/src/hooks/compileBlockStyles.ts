import fs from 'node:fs'
import path from 'node:path'
import { compile } from 'tailwindcss'
import type { CollectionAfterChangeHook } from 'payload'

type BlockLike = {
  id?: string
  blockType?: string
  styles?: {
    customCSS?: {
      classes?: string
      inlineCSS?: string
    }
  }
  children?: BlockLike[]
  [key: string]: unknown
}

/** Recursively walk a block tree and collect Tailwind classes + scoped CSS */
function walkBlocks(
  blocks: BlockLike[] | undefined,
  allClasses: Set<string>,
  scopedCSS: string[],
): void {
  if (!blocks) return

  for (const block of blocks) {
    const css = block.styles?.customCSS

    // Collect Tailwind class names
    if (css?.classes) {
      for (const cls of css.classes.split(/\s+/).filter(Boolean)) {
        allClasses.add(cls)
      }
    }

    // Scope inline CSS to block id
    if (css?.inlineCSS && block.id) {
      scopedCSS.push(`#block-${block.id} { ${css.inlineCSS} }`)
    }

    // Recurse into child blocks (Container, Grid, etc.)
    if (Array.isArray(block.children)) {
      walkBlocks(block.children, allClasses, scopedCSS)
    }
  }
}

let cachedCompiler: Awaited<ReturnType<typeof compile>> | null = null

async function getCompiler(): Promise<Awaited<ReturnType<typeof compile>>> {
  if (cachedCompiler) return cachedCompiler

  // Resolve tailwindcss/index.css from node_modules
  const twPath = path.join(process.cwd(), 'node_modules', 'tailwindcss', 'index.css')
  const twCSS = fs.readFileSync(twPath, 'utf-8')
  const twBase = path.dirname(twPath)

  cachedCompiler = await compile(twCSS, {
    base: twBase,
    loadStylesheet: async (id: string, base: string) => {
      const resolved = path.resolve(base, id)
      return {
        content: fs.readFileSync(resolved, 'utf-8'),
        base: path.dirname(resolved),
      }
    },
  })
  return cachedCompiler
}

export const compileBlockStyles: CollectionAfterChangeHook = async ({
  collection,
  doc,
  req,
}) => {
  // Prevent infinite loops
  if (req.context?.disableCompileStyles) return doc

  const layout = doc.layout as BlockLike[] | undefined
  if (!layout?.length) return doc

  const collectionSlug = collection.slug

  const allClasses = new Set<string>()
  const scopedCSS: string[] = []

  walkBlocks(layout, allClasses, scopedCSS)

  // Nothing to compile
  if (allClasses.size === 0 && scopedCSS.length === 0) {
    // Clear field if previously set
    if (doc._compiledBlockCSS) {
      await req.payload.update({
        collection: collectionSlug as any,
        id: doc.id,
        data: { _compiledBlockCSS: '' },
        context: { disableRevalidate: true, disableCompileStyles: true },
      })
    }
    return doc
  }

  const compiledParts: string[] = []

  // Compile Tailwind classes
  if (allClasses.size > 0) {
    try {
      const compiler = await getCompiler()
      const tailwindCSS = compiler.build(Array.from(allClasses))
      if (tailwindCSS) {
        compiledParts.push(tailwindCSS)
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

  const compiledBlockCSS = compiledParts.join('\n')

  // Only update if changed
  if (compiledBlockCSS !== (doc._compiledBlockCSS ?? '')) {
    await req.payload.update({
      collection: collectionSlug as any,
      id: doc.id,
      data: { _compiledBlockCSS: compiledBlockCSS },
      context: { disableRevalidate: true, disableCompileStyles: true },
    })
  }

  return doc
}

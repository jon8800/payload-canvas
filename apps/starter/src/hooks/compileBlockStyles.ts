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
  columns?: Array<{ blocks?: BlockLike[] }>
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

    // Recurse into child blocks (Container, etc.)
    walkBlocks(block.children, allClasses, scopedCSS)

    // Recurse into Grid columns
    if (block.columns) {
      for (const col of block.columns) {
        walkBlocks(col.blocks, allClasses, scopedCSS)
      }
    }
  }
}

let cachedCompiler: Awaited<ReturnType<typeof compile>> | null = null

async function getCompiler(): Promise<Awaited<ReturnType<typeof compile>>> {
  if (cachedCompiler) return cachedCompiler

  // Read the project's globals.css to get the full Tailwind theme
  const globalsPath = path.join(process.cwd(), 'src/app/(frontend)/globals.css')
  let cssInput = '@import "tailwindcss";'

  try {
    const content = fs.readFileSync(globalsPath, 'utf-8')
    // Strip @source directives and @plugin directives that need filesystem resolution
    // Keep @theme, @custom-variant, CSS variables, and @layer definitions
    cssInput = content
      .replace(/^@import\s+"tw-animate-css";\s*$/gm, '')
      .replace(/^@import\s+"shadcn\/tailwind\.css";\s*$/gm, '')
      .replace(/^@source\s+.*$/gm, '')
      .replace(/^@plugin\s+.*$/gm, '')
  } catch {
    // Fall back to basic Tailwind import
  }

  cachedCompiler = await compile(cssInput)
  return cachedCompiler
}

export const compileBlockStyles: CollectionAfterChangeHook = async ({
  doc,
  req,
}) => {
  // Prevent infinite loops
  if (req.context.disableCompileStyles) return doc

  const layout = doc.layout as BlockLike[] | undefined
  if (!layout?.length) return doc

  const allClasses = new Set<string>()
  const scopedCSS: string[] = []

  walkBlocks(layout, allClasses, scopedCSS)

  // Nothing to compile
  if (allClasses.size === 0 && scopedCSS.length === 0) {
    // Clear field if previously set
    if (doc._compiledBlockCSS) {
      await req.payload.update({
        collection: req.collection!.slug as any,
        id: doc.id,
        data: { _compiledBlockCSS: '' },
        context: { disableRevalidate: true, disableCompileStyles: true },
      })
    }
    return doc
  }

  let compiledParts: string[] = []

  // Compile Tailwind classes
  if (allClasses.size > 0) {
    try {
      const compiler = await getCompiler()
      const tailwindCSS = compiler.build(Array.from(allClasses))
      if (tailwindCSS) {
        compiledParts.push(tailwindCSS)
      }
    } catch (err) {
      req.payload.logger.error('Failed to compile Tailwind classes:', err)
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
      collection: req.collection!.slug as any,
      id: doc.id,
      data: { _compiledBlockCSS: compiledBlockCSS },
      context: { disableRevalidate: true, disableCompileStyles: true },
    })
  }

  return doc
}

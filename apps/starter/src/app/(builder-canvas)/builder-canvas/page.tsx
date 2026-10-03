'use client'

import { BuilderCanvas } from '@payload-toolkit/builder-react/canvas'
import typography from '@tailwindcss/typography'
import { builderBlocks, resolveLink } from '@/builder'
import { blockComponents } from '@/components/blocks'

// A client page: Tailwind plugins are functions and cannot cross the server/client boundary.
// Pass the same plugins as `websiteBuilder({ css: { plugins } })` in payload.config.ts.
const plugins = { '@tailwindcss/typography': typography }

/**
 * The page builder's canvas iframe. The admin editor sends it the layout over postMessage.
 * It uses the same blocks, components and link resolver as the site (BuilderContent).
 */
export default function BuilderCanvasPage() {
  return <BuilderCanvas blocks={builderBlocks} plugins={plugins} components={blockComponents} resolveLink={resolveLink} />
}

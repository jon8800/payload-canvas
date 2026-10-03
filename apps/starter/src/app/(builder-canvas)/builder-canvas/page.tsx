'use client'

import { BuilderCanvas } from '@payload-toolkit/builder-react/canvas'
import typography from '@tailwindcss/typography'
import { blockComponents } from '@/components/blocks'
import { resolveLink } from '@/lib/links'

// A client page: Tailwind plugins are functions and cannot cross the server/client boundary.
// Pass the same plugins as `websiteBuilder({ css: { plugins } })` in payload.config.ts.
const plugins = { '@tailwindcss/typography': typography }

/** The page builder's canvas iframe. The admin editor sends it the layout over postMessage. */
export default function BuilderCanvasPage() {
  return <BuilderCanvas plugins={plugins} components={blockComponents} resolveLink={resolveLink} />
}

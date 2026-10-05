'use server'

// The canvas server action. The canvas iframe is a client page, so it cannot run server
// components that load data. It sends those blocks here; they render with the site's own
// components and go back as React Server Component output. It also loads the page data.
import config from '@payload-config'
import { createCanvasServer, type CanvasServerRequest } from '@payload-toolkit/builder-react/server'
import { builderBlocks, resolveLink } from '@/builder'
import { loadPageData, serverBlockComponents } from '@/components/blocks/server'

const canvas = createCanvasServer({
  config,
  blocks: builderBlocks,
  components: serverBlockComponents,
  resolveLink,
  pageData: async (args) => (await loadPageData(args)) ?? {},
})

export async function builderCanvas(request: CanvasServerRequest) {
  return canvas(request)
}

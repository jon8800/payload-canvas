'use server'

// The canvas server action. The canvas iframe is a client page, so it cannot run server
// components that load data. It sends those blocks here; they render with the site's own
// components and go back as React Server Component output. It also loads the page data.
import config from '@payload-config'
import { createCanvasServer, type CanvasServerRequest } from 'payload-canvas/react/server'
import { builderBlocks, resolveLink } from '@/builder'
import { loadPageData, serverBlockComponents } from '@/components/blocks/server'
import { FormFrame } from '@/components/blocks/FormFrame'

const canvas = createCanvasServer({
  config,
  blocks: builderBlocks,
  components: serverBlockComponents,
  resolveLink,
  pageData: async (args) => (await loadPageData(args)) ?? {},
  // The form builder (`websiteBuilder({ forms })`): the form around its fields, as the site shows
  // it. Other documents have no regions, so they never ask for a frame.
  frame: ({ document, doc, region }) => (document.collection === 'forms' ? <FormFrame doc={doc} region={region} /> : null),
})

export async function builderCanvas(request: CanvasServerRequest) {
  return canvas(request)
}

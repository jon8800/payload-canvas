// Server only: the app's block components with the server components that load data. The site
// renderer (BuilderContent) and the canvas server action use this map. The canvas iframe uses
// the client-safe `blockComponents` and renders the blocks it lacks through its server action.
import type { BlockComponents, PageData } from '@payload-toolkit/builder-react'
import type { PageDataArgs } from '@payload-toolkit/builder-react/server'
import { legacyDemo } from '@/legacy-fixture/enabled'
import { legacyPageData, legacyServerComponents } from '@/legacy-fixture/server'
import { blockComponents } from '.'

export const serverBlockComponents: BlockComponents = {
  ...blockComponents,
  // Dev fixture: async server components (NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1).
  ...(legacyDemo ? legacyServerComponents : {}),
}

/**
 * The page data blocks read (`RenderLayout`'s `pageData`), loaded once per page. The site and
 * the canvas server action call the same function. Only the dev fixture uses it.
 */
export async function loadPageData(args: Pick<PageDataArgs, 'payload'>): Promise<PageData | null> {
  return legacyDemo ? legacyPageData(args) : null
}

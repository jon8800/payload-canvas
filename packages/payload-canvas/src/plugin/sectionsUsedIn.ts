// Saved sections (server only): `GET {api}/{slug}/:id/used-in` tells the editor how many builder
// documents use a saved section (a component's copies), for "Used on 3 pages" in the inspector.

import type { CollectionConfig, Endpoint } from 'payload'

import { findReferrers } from './references'

export const SECTION_USED_IN_PATH = '/:id/used-in'

/** The endpoint, for the saved sections collection `slug`. Needs a signed-in user. */
export function sectionUsedInEndpoint(slug: string): Endpoint {
  return {
    path: SECTION_USED_IN_PATH,
    method: 'get',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Sign in first.' }, { status: 401 })
      const id = req.routeParams?.id
      if (typeof id !== 'string' && typeof id !== 'number') return Response.json({ error: 'No id.' }, { status: 400 })
      const { docs, total } = await findReferrers(req.payload, { relationTo: slug, value: id }, { req, limit: 50 })
      return Response.json({ total, docs: docs.slice(0, 10) })
    },
  }
}

/** The saved sections collection with the endpoint added. */
export function withSectionUsedIn(collection: CollectionConfig): CollectionConfig {
  return { ...collection, endpoints: [...(collection.endpoints || []), sectionUsedInEndpoint(collection.slug)] }
}

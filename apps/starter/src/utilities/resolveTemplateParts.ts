import { cache } from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

type PartType = 'header' | 'footer' | 'custom'

async function resolve(
  partType: PartType,
  currentPath: string,
  currentCollection?: string,
  draft?: boolean,
) {
  const payload = await getPayload({ config: configPromise })

  const where: Record<string, any> = {
    type: { equals: partType },
  }
  if (!draft) {
    where._status = { equals: 'published' }
  }

  const { docs: parts } = await payload.find({
    collection: 'template-parts',
    where,
    limit: 0,
    depth: 2,
    draft: draft || false,
  })

  // Priority 1: Specific pages match
  const specificMatch = parts.find(
    (part) =>
      part.displayCondition?.mode === 'specificPages' &&
      Array.isArray(part.displayCondition.pages) &&
      part.displayCondition.pages.some((p) => {
        const slug = typeof p === 'object' && p !== null ? p.slug : null
        return slug != null && (currentPath === `/${slug}` || currentPath === slug)
      }),
  )
  if (specificMatch) return specificMatch

  // Priority 2: Collection type match
  if (currentCollection) {
    const collectionMatch = parts.find(
      (part) =>
        part.displayCondition?.mode === 'collectionType' &&
        part.displayCondition.collectionType === currentCollection,
    )
    if (collectionMatch) return collectionMatch
  }

  // Priority 3: Exclude pages (show everywhere except listed)
  const excludeMatch = parts.find(
    (part) =>
      part.displayCondition?.mode === 'excludePages' &&
      Array.isArray(part.displayCondition.pages) &&
      !part.displayCondition.pages.some((p) => {
        const slug = typeof p === 'object' && p !== null ? p.slug : null
        return slug != null && (currentPath === `/${slug}` || currentPath === slug)
      }),
  )
  if (excludeMatch) return excludeMatch

  // Priority 4: Entire site fallback
  const entireSiteMatch = parts.find(
    (part) => part.displayCondition?.mode === 'entireSite',
  )
  return entireSiteMatch || null
}

export const resolveTemplateParts = cache(resolve)

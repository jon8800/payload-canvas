import type { PayloadRequest, SanitizedCollectionConfig } from 'payload'

/** The admin URL of the full-screen builder for a document, e.g. `/admin/builder/pages/12`. */
export function builderViewPath(adminRoute: string, collection: string, id: string | number): string {
  return `${adminRoute === '/' ? '' : adminRoute}/builder/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`
}

/** The public path of a document from the collection's `url` option. Null when it has none or it throws. */
export function documentPath(url: ((doc: Record<string, unknown>) => string) | undefined, doc: Record<string, unknown>): string | null {
  if (!url) return null
  try {
    const path = url(doc)
    return typeof path === 'string' && path ? path : null
  } catch {
    return null
  }
}

/** The draft preview path from the collection's `admin.livePreview.url` or `admin.preview`. */
export async function draftPreviewPath(req: PayloadRequest, collection: string, doc: Record<string, unknown>): Promise<string | null> {
  const config = (req.payload.collections as Record<string, { config: SanitizedCollectionConfig } | undefined>)[collection]?.config
  if (!config) return null
  const admin = (config.admin ?? {}) as { livePreview?: { url?: unknown }; preview?: unknown }
  const locale = (req as { locale?: string }).locale ?? 'en'
  try {
    const live = admin.livePreview?.url
    if (typeof live === 'string') return live
    if (typeof live === 'function') {
      const value: unknown = await live({ data: doc, collectionConfig: config, locale: { code: locale, label: locale }, req, payload: req.payload })
      if (typeof value === 'string' && value) return value
    }
    if (typeof admin.preview === 'function') {
      const value: unknown = await admin.preview(doc, { locale, req, token: null })
      if (typeof value === 'string' && value) return value
    }
  } catch {
    return null
  }
  return null
}

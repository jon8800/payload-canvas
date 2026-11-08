import type { PayloadRequest, SanitizedCollectionConfig } from 'payload'

/** The admin URL of the full-screen builder for a document, e.g. `/admin/builder/pages/12`. */
export function builderViewPath(adminRoute: string, collection: string, id: string | number): string {
  return `${adminRoute === '/' ? '' : adminRoute}/builder/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`
}

/**
 * The search parameter that keeps Payload's edit form open when `editor.openInBuilder` is on:
 * `/admin/collections/pages/12?form=1`.
 */
export const FORM_PARAM = 'form'

/** The admin URL of Payload's edit view for a document. `form`: stay there with `openInBuilder` on. */
export function editViewPath(adminRoute: string, collection: string, id: string | number, options: { form?: boolean } = {}): string {
  const path = `${adminRoute === '/' ? '' : adminRoute}/collections/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`
  return options.form ? `${path}?${FORM_PARAM}=1` : path
}

/** The admin URL of a collection's list view, e.g. `/admin/collections/pages`. */
export function listViewPath(adminRoute: string, collection: string): string {
  return `${adminRoute === '/' ? '' : adminRoute}/collections/${encodeURIComponent(collection)}`
}

/**
 * True when the edit view of an existing document should open the builder instead: the option is
 * on, the user can save, the document is not in the trash, the view is not in a drawer, and the
 * URL does not ask for the form. Pure, so it is tested without React.
 */
export function opensInBuilder(state: {
  option: boolean
  id: string | number | null | undefined
  canSave: boolean
  trashed: boolean
  inDrawer: boolean
  formParam: string | null
}): boolean {
  const { option, id, canSave, trashed, inDrawer, formParam } = state
  if (!option || inDrawer || trashed || !canSave) return false
  if (id === undefined || id === null || id === '') return false
  return formParam === null
}

/**
 * How the edit view goes on to the builder. `page`: a full page load, for an edit view that is the
 * page the browser loaded (a typed or pasted URL, a new tab, a reload). `router`: a client
 * navigation, for an edit view that Next's router opened (a link in the admin).
 *
 * A client navigation right after a full load can lock React in a render loop in development
 * ("Maximum update depth exceeded" many times, the CPU busy). Strict Mode runs Payload's
 * `CloseModalOnRouteChange` effect twice on mount, so it closes all modals once at idle priority.
 * The navigation keeps React busy until the builder arrives, and then closes all modals again.
 * From then on every render applies that close again and makes a new `modalState` object, and the
 * effects that read it set state again, so the idle close never runs. A full page load gives
 * the builder a fresh page. `loadedUrl` is the URL of the page load (Navigation Timing).
 */
export function builderOpening(loadedUrl: string | null | undefined, currentUrl: string): 'page' | 'router' {
  if (!loadedUrl) return 'router'
  try {
    return new URL(loadedUrl).pathname === new URL(currentUrl).pathname ? 'page' : 'router'
  } catch {
    return 'router'
  }
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

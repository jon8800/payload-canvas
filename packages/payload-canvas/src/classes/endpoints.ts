// Endpoints of the editable classes. The editor writes styles with Payload's own REST API
// (`PATCH {api}/{collection}/{id}?draft=true&autosave=true`); these cover what REST cannot do in
// one call: the list for the canvas, usage, rename, delete with removal, import, and the site's
// stylesheet. Server-only.

import type { Endpoint, PayloadRequest } from 'payload'

import { deleteClass, importSiteClasses, loadClasses, namesOf, renameClass, type ActionResult } from './actions'
import { loadClassesSheet } from './sheet'
import { CLASSES_PATH, CLASSES_SHEET_PATH } from './shared'
import { classUsage } from './usage'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

const unauthorized = () => json({ ok: false, error: 'Sign in to edit classes.' }, 401)

async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const value = typeof req.json === 'function' ? await req.json() : {}
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const reply = <T,>(result: ActionResult<T>) => json(result, result.ok ? 200 : result.status)

const idOf = (value: unknown): string | number | null => (typeof value === 'string' || typeof value === 'number') && value !== '' ? value : null

export function classesEndpoints(): Endpoint[] {
  return [
    {
      // The classes' latest drafts, as the user reads them: the editor's list and the canvas compile.
      path: CLASSES_PATH,
      method: 'get',
      handler: async (req) => {
        if (!req.user) return unauthorized()
        try {
          return json({ classes: await loadClasses(req) })
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500)
        }
      },
    },
    {
      // Where each class is used: `{ usage: { [name]: { blocks, documents } } }`. `?names=a,b` limits it.
      path: `${CLASSES_PATH}/usage`,
      method: 'get',
      handler: async (req) => {
        if (!req.user) return unauthorized()
        const asked = typeof req.searchParams?.get === 'function' ? req.searchParams.get('names') : null
        const names = asked ? asked.split(',').filter(Boolean) : namesOf(await loadClasses(req))
        return json({ usage: await classUsage(req, names) })
      },
    },
    {
      path: `${CLASSES_PATH}/rename`,
      method: 'post',
      handler: async (req) => {
        if (!req.user) return unauthorized()
        const data = await readBody(req)
        const id = idOf(data.id)
        if (id === null || typeof data.name !== 'string') return json({ ok: false, error: 'Send { id, name }.' }, 400)
        return reply(await renameClass(req, id, data.name))
      },
    },
    {
      path: `${CLASSES_PATH}/delete`,
      method: 'post',
      handler: async (req) => {
        if (!req.user) return unauthorized()
        const data = await readBody(req)
        const id = idOf(data.id)
        if (id === null) return json({ ok: false, error: 'Send { id }.' }, 400)
        return reply(await deleteClass(req, id, { removeFromBlocks: data.removeFromBlocks === true }))
      },
    },
    {
      // Creates classes from the site's code `@utility` classes. `{ names?: string[] }` limits it.
      path: `${CLASSES_PATH}/import`,
      method: 'post',
      handler: async (req) => {
        if (!req.user) return unauthorized()
        const data = await readBody(req)
        const names = Array.isArray(data.names) ? data.names.filter((n): n is string => typeof n === 'string') : undefined
        return reply(await importSiteClasses(req, names))
      },
    },
    {
      // The site's stylesheet: `<hash>.css` is immutable (a new publish gets a new hash). Public:
      // it holds only CSS of published classes.
      path: `${CLASSES_SHEET_PATH}/:file`,
      method: 'get',
      handler: async (req) => {
        const file = String((req.routeParams as Record<string, unknown> | undefined)?.file ?? '')
        const sheet = await loadClassesSheet(req.payload)
        const css = sheet?.css ?? ''
        const exact = Boolean(sheet?.hash) && file === `${sheet?.hash}.css`
        return new Response(css, {
          status: 200,
          headers: {
            'Content-Type': 'text/css; charset=utf-8',
            // An old hash (a page cached before a publish) gets the current sheet, briefly cached.
            'Cache-Control': exact ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
          },
        })
      },
    },
  ]
}

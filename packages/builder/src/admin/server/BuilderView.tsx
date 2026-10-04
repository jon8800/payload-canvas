import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { PayloadIcon } from '@payloadcms/ui/shared'
import { notFound, redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { builderConfigOf, liveRuntimeOf, loadDocMeta, sessionTargetOf } from '../../live'
import type { BuilderDocMeta } from '../../live/types'
import { builderViewPath } from '../../plugin/links'
import { BuilderScreen } from '../screen/BuilderScreen'

function segment(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? '')
  } catch {
    return ''
  }
}

/**
 * The full-screen builder: a root admin view at `{admin}/builder/:collection/:id`. Payload renders
 * root views with three path segments without its template, so there is no nav and no header.
 *
 * Payload does not check the session for custom root views, so this view does: signed out goes
 * to the login (and back), no admin access to "unauthorized", unknown documents and collections
 * without the builder to "not found", and read-only users to the normal edit view.
 */
export async function BuilderView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions } = initPageResult
  const { payload } = req
  const { routes } = payload.config
  const admin = routes.admin === '/' ? '' : routes.admin
  const segments = Array.isArray(params?.segments) ? params.segments : []
  const collection = segment(segments[1])
  const id = segment(segments[2])
  const here = builderViewPath(routes.admin, collection, id)

  if (!req.user) redirect(`${admin}${payload.config.admin.routes.login}?redirect=${encodeURIComponent(here)}`)
  if (!permissions.canAccessAdmin) redirect(`${admin}${payload.config.admin.routes.unauthorized}`)

  const server = builderConfigOf(payload)
  const target = server && segments.length === 3 ? sessionTargetOf(payload, server.collections, collection, id) : null
  if (!server || !target) notFound()

  const runtime = liveRuntimeOf(payload)
  const canUpdate = await runtime.canUpdate(req, collection, id)
  let meta: BuilderDocMeta | null = null
  try {
    meta = await loadDocMeta(req, {
      target,
      url: server.collections[collection]?.url,
      isTemplate: collection === server.templates,
      canUpdate,
    })
  } catch {
    meta = null
  }
  if (!meta) notFound()
  if (!canUpdate) redirect(`${admin}/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`)

  // oxlint-disable-next-line react/capitalized-calls -- Payload's helper (a function) renders the app's icon component
  const icon = RenderServerComponent({
    Component: payload.config.admin.components?.graphics?.Icon,
    Fallback: PayloadIcon,
    importMap: payload.importMap,
    serverProps: { i18n: req.i18n, locale: req.locale, params, payload, permissions, searchParams, user: req.user },
  })

  return <BuilderScreen meta={meta} icon={icon} />
}

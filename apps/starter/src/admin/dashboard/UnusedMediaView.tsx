import { DefaultTemplate } from '@payloadcms/ui/rsc'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { MEDIA_COLLECTION } from './lib'
import { can, UNUSED_MEDIA_PATH, unusedMedia } from './server'
import { WidgetEmpty, WidgetList } from './WidgetCard'
import { mediaRow } from './widgets/UnusedMedia'

const PER_PAGE = 50

/**
 * The full list of unused media ("View all" in the Unused media widget), 50 files a page, newest
 * first. Each page is one query on the reference index. Payload's media list cannot show this
 * filter: its filter bar does not know join fields.
 */
export async function UnusedMediaView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions, locale, visibleEntities } = initPageResult
  const page = Math.max(1, Number(searchParams?.page) || 1)
  const allowed = can(req, permissions, MEDIA_COLLECTION)
  const unused = allowed ? await unusedMedia(req, PER_PAGE, page) : null
  const adminRoute = req.payload.config.routes.admin
  const pageURL = (n: number) => `${adminRoute === '/' ? '' : adminRoute}${UNUSED_MEDIA_PATH}?page=${n}`

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter className="unused-media">
        <h1 className="unused-media__title">Unused media</h1>
        {!allowed ? (
          <WidgetEmpty>You cannot read media.</WidgetEmpty>
        ) : !unused ? (
          <WidgetEmpty>Checking which files are in use. This takes a few minutes after the first start.</WidgetEmpty>
        ) : unused.total === 0 ? (
          <WidgetEmpty>Every file is in use.</WidgetEmpty>
        ) : (
          <>
            <p className="dash-total">
              <strong>{unused.total}</strong>
              {unused.total === 1 ? 'file is not used by any page, post, document or setting' : 'files are not used by any page, post, document or setting'}
            </p>
            <WidgetList rows={unused.docs.map((doc) => mediaRow(req, doc))} />
            {unused.pages > 1 && (
              <nav className="unused-media__pager" aria-label="Pages">
                {page > 1 ? <Link href={pageURL(page - 1)}>Previous</Link> : <span />}
                <span>
                  Page {page} of {unused.pages}
                </span>
                {page < unused.pages ? <Link href={pageURL(page + 1)}>Next</Link> : <span />}
              </nav>
            )}
          </>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}

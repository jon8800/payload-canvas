import { ANALYTICS_DAYS, analyticsProvider, fetchAnalytics } from '../analytics'
import type { WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty } from '../WidgetCard'

/** Visitors, page views and the top pages of the last 7 days, from Plausible or Umami. */
export async function Analytics({ req }: WidgetProps) {
  const provider = analyticsProvider()
  const title = `Visitors · last ${ANALYTICS_DAYS} days`
  if (!provider) {
    return (
      <WidgetCard title={title}>
        <WidgetEmpty>
          Not set up. Add PLAUSIBLE_API_KEY and PLAUSIBLE_SITE_ID, or UMAMI_API_KEY and UMAMI_WEBSITE_ID, to .env.
        </WidgetEmpty>
      </WidgetCard>
    )
  }
  const summary = await fetchAnalytics(provider).catch((error: unknown) => {
    req.payload.logger.warn({ msg: 'Analytics widget: the request failed', err: error })
    return null
  })
  if (!summary) {
    return (
      <WidgetCard title={title}>
        <WidgetEmpty>Could not load the numbers. Check the analytics settings in .env.</WidgetEmpty>
      </WidgetCard>
    )
  }

  const number = new Intl.NumberFormat(req.i18n.language)
  return (
    <WidgetCard title={title}>
      <dl className="dash-stats">
        <div>
          <dt>Visitors</dt>
          <dd>{number.format(summary.visitors)}</dd>
        </div>
        <div>
          <dt>Page views</dt>
          <dd>{number.format(summary.pageviews)}</dd>
        </div>
      </dl>
      {summary.topPages.length > 0 && (
        <ol className="dash-top">
          {summary.topPages.map((page) => (
            <li key={page.path}>
              <span className="dash-top__path">{page.path}</span>
              <span className="dash-top__count">{number.format(page.visitors)}</span>
            </li>
          ))}
        </ol>
      )}
    </WidgetCard>
  )
}

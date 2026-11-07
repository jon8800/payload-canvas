// Visitor numbers for the Analytics widget, from Plausible or Umami. Set the variables in .env;
// without them the widget is not added to the dashboard.
//   Plausible: PLAUSIBLE_API_KEY, PLAUSIBLE_SITE_ID, and PLAUSIBLE_URL for a self-hosted server.
//   Umami:     UMAMI_API_KEY, UMAMI_WEBSITE_ID, and UMAMI_URL for a self-hosted server: its API
//              address, such as https://umami.example.com/api (the key is then an API token).

export type AnalyticsProvider =
  | { kind: 'plausible'; url: string; apiKey: string; siteId: string }
  | { kind: 'umami'; url: string; apiKey: string; websiteId: string }

export type AnalyticsSummary = {
  visitors: number
  pageviews: number
  topPages: Array<{ path: string; visitors: number }>
}

const PLAUSIBLE_CLOUD = 'https://plausible.io'
const UMAMI_CLOUD = 'https://api.umami.is/v1'
const DAYS = 7
const TOP_PAGES = 5

/** Reads the provider from environment variables. Null when none is set up. */
export function analyticsProvider(env: Record<string, string | undefined> = process.env): AnalyticsProvider | null {
  if (env.PLAUSIBLE_API_KEY && env.PLAUSIBLE_SITE_ID) {
    return { kind: 'plausible', url: trimSlash(env.PLAUSIBLE_URL || PLAUSIBLE_CLOUD), apiKey: env.PLAUSIBLE_API_KEY, siteId: env.PLAUSIBLE_SITE_ID }
  }
  if (env.UMAMI_API_KEY && env.UMAMI_WEBSITE_ID) {
    return { kind: 'umami', url: trimSlash(env.UMAMI_URL || UMAMI_CLOUD), apiKey: env.UMAMI_API_KEY, websiteId: env.UMAMI_WEBSITE_ID }
  }
  return null
}

const trimSlash = (url: string) => url.replace(/\/+$/, '')

const number = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'value' in value) return number((value as { value: unknown }).value)
  return 0
}

async function json(url: string, init: RequestInit): Promise<unknown> {
  // Cache for 5 minutes, so the dashboard does not call the API on every visit.
  const response = await fetch(url, { ...init, next: { revalidate: 300 } } as RequestInit)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function plausible(provider: Extract<AnalyticsProvider, { kind: 'plausible' }>): Promise<AnalyticsSummary> {
  const query = (body: Record<string, unknown>) =>
    json(`${provider.url}/api/v2/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${provider.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ site_id: provider.siteId, date_range: `${DAYS}d`, ...body }),
    }) as Promise<{ results?: Array<{ metrics: number[]; dimensions: string[] }> }>
  const [totals, pages] = await Promise.all([
    query({ metrics: ['visitors', 'pageviews'] }),
    query({ metrics: ['visitors'], dimensions: ['event:page'], order_by: [['visitors', 'desc']], pagination: { limit: TOP_PAGES } }),
  ])
  const [visitors = 0, pageviews = 0] = totals.results?.[0]?.metrics ?? []
  return {
    visitors,
    pageviews,
    topPages: (pages.results ?? []).map((row) => ({ path: row.dimensions[0] ?? '/', visitors: row.metrics[0] ?? 0 })),
  }
}

async function umami(provider: Extract<AnalyticsProvider, { kind: 'umami' }>): Promise<AnalyticsSummary> {
  const endAt = Date.now()
  const startAt = endAt - DAYS * 24 * 3600 * 1000
  const headers = { accept: 'application/json', 'x-umami-api-key': provider.apiKey, authorization: `Bearer ${provider.apiKey}` }
  const base = `${provider.url}/websites/${encodeURIComponent(provider.websiteId)}`
  const range = `startAt=${startAt}&endAt=${endAt}`
  const [stats, pages] = await Promise.all([
    json(`${base}/stats?${range}`, { headers }) as Promise<Record<string, unknown>>,
    // Umami 2 calls the dimension "url", Umami 3 "path".
    (json(`${base}/metrics?${range}&type=path&limit=${TOP_PAGES}`, { headers }).catch(() =>
      json(`${base}/metrics?${range}&type=url&limit=${TOP_PAGES}`, { headers }),
    ) as Promise<Array<{ x: string; y: number }>>),
  ])
  return {
    visitors: number(stats.visitors),
    pageviews: number(stats.pageviews),
    topPages: (Array.isArray(pages) ? pages : []).slice(0, TOP_PAGES).map((row) => ({ path: row.x, visitors: row.y })),
  }
}

export function fetchAnalytics(provider: AnalyticsProvider): Promise<AnalyticsSummary> {
  return provider.kind === 'plausible' ? plausible(provider) : umami(provider)
}

export const ANALYTICS_DAYS = DAYS

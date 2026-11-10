// Takes the preview images for "Edit dashboard" → "Add widget": a screenshot of every dashboard
// widget, light and dark, saved as public/admin/widget-previews/<slug>-<theme>.webp.
// Run with `pnpm previews:widgets` while the dev server runs with dev auto-login
// (DEV_AUTOLOGIN_EMAIL). PREVIEW_BASE_URL sets the server (default http://localhost:3000).
//
// The widgets show the database's own data, so add some first: drafts, a comment, form messages,
// a scheduled publish, a 404 hit. For the Analytics widget, start the dev server with
//   PLAUSIBLE_URL=http://localhost:3199 PLAUSIBLE_API_KEY=preview PLAUSIBLE_SITE_ID=preview
// in .env: this script answers there with demo numbers (a stand-in for the Plausible API).
//
// The script shows every widget on the signed-in user's dashboard while it runs, then puts the
// user's own layout back. It drives the installed Chrome (PREVIEW_BROWSER=msedge for Edge).
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium, type Page } from 'playwright-core'
import sharp from 'sharp'

import { widgetPreviewURL, widgets, type WidgetPreviewTheme } from '../src/admin/dashboard'

const BASE_URL = (process.env.PREVIEW_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
const ANALYTICS_PORT = 3199
/** The widget's width on the page (CSS pixels) and the image width. Images are 3:2, like the drawer's boxes. */
const CARD_WIDTH = 440
const IMAGE_WIDTH = 480
const CARD_HEIGHT = Math.round((CARD_WIDTH * 2) / 3)
const THEMES: WidgetPreviewTheme[] = ['light', 'dark']
/** Rows a list widget shows, so the last row is not cut in half. */
const LIST_ROWS = 3
const PREFERENCE_URL = '/api/payload-preferences/dashboard-layout'
const PUBLIC_DIR = path.resolve(import.meta.dirname, '../public')

/** Demo answers in the shape of Plausible's /api/v2/query (see src/admin/dashboard/analytics.ts). */
function startAnalyticsStandIn() {
  const topPages = [
    ['/', 1284],
    ['/services', 612],
    ['/blog/a-faster-launch', 455],
    ['/about', 318],
    ['/contact', 207],
  ] as const
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      const query = JSON.parse(body || '{}') as { dimensions?: string[] }
      const results = query.dimensions?.length
        ? topPages.map(([page, visitors]) => ({ dimensions: [page], metrics: [visitors] }))
        : [{ dimensions: [], metrics: [3172, 8945] }]
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results }))
    })
  })
  server.on('error', (error) => console.warn(`Analytics demo numbers are off (port ${ANALYTICS_PORT}): ${error.message}`))
  server.listen(ANALYTICS_PORT)
  return server
}

/** Calls the Payload REST API from the page, so the request carries the admin's sign-in cookie. */
function api(page: Page, url: string, init: { method: string; body?: unknown }) {
  return page.evaluate(
    async ({ address, method, body }) => {
      const request: RequestInit = { method, credentials: 'include' }
      if (body !== undefined) Object.assign(request, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const response = await fetch(address, request)
      return { ok: response.ok, json: (await response.json().catch(() => null)) as { value?: unknown } | null }
    },
    { address: url, ...init },
  )
}

async function capture(page: Page, theme: WidgetPreviewTheme) {
  await page.context().addCookies([{ name: 'payload-theme', value: theme, url: BASE_URL }])
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' })
  // Every widget in its own row, as wide as CARD_WIDTH and at least 3:2 tall.
  await page.addStyleTag({
    content: `.modular-dashboard { width: ${CARD_WIDTH + 12}px !important; }
      .widget .dash-card { min-height: ${CARD_HEIGHT}px; }
      nextjs-portal { display: none !important; }`,
  })
  await page.evaluate(() => document.fonts.ready)

  for (const { slug } of widgets) {
    const card = page.locator(`.widget[data-slug="${slug}-preview"] .dash-card`)
    await card.scrollIntoViewIfNeeded()
    // Images load lazily: wait for the ones in this widget.
    await card.evaluate((element) =>
      Promise.all([...element.querySelectorAll('img')].map((image) => image.decode().catch(() => undefined))),
    )
    const shot = await card.screenshot({ animations: 'disabled' })
    const { width = 0, height = 0 } = await sharp(shot).metadata()
    const file = path.join(PUBLIC_DIR, widgetPreviewURL(slug, theme))
    await sharp(shot)
      .extract({ left: 0, top: 0, width, height: Math.min(height, Math.round((width * 2) / 3)) })
      .resize({ width: IMAGE_WIDTH })
      .webp({ quality: 82 })
      .toFile(file)
    console.log(`  ${path.relative(PUBLIC_DIR, file)}`)
  }
}

const analytics = startAnalyticsStandIn()
const browser = await chromium.launch({ channel: process.env.PREVIEW_BROWSER || 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' })
  if (new URL(page.url()).pathname.endsWith('/login')) {
    throw new Error('Not signed in. Set DEV_AUTOLOGIN_EMAIL in .env and run the dev server.')
  }
  await mkdir(path.join(PUBLIC_DIR, path.dirname(widgetPreviewURL('x', 'light'))), { recursive: true })

  const saved = await api(page, PREFERENCE_URL, { method: 'GET' })
  const layouts = widgets.map(({ slug, fields, minWidth }) => ({
    id: `${slug}-preview`,
    data: fields?.some((field) => 'name' in field && field.name === 'limit') ? { limit: LIST_ROWS } : {},
    maxWidth: 'full',
    minWidth,
    width: 'full',
  }))
  await api(page, PREFERENCE_URL, { method: 'POST', body: { value: { layouts } } })
  try {
    for (const theme of THEMES) await capture(page, theme)
  } finally {
    // Put the user's own dashboard back.
    if (saved.ok && saved.json?.value) await api(page, PREFERENCE_URL, { method: 'POST', body: { value: saved.json.value } })
    else await api(page, PREFERENCE_URL, { method: 'DELETE' })
  }
  console.log(`Saved ${widgets.length * THEMES.length} previews.`)
} finally {
  await browser.close()
  analytics.close()
}

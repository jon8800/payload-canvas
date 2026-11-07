import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'

import { fetchAnalytics } from './analytics'

type Seen = { method?: string; url?: string; headers: IncomingMessage['headers']; body: string }

// A small fake of the Plausible and Umami APIs.
let server: Server
let base = ''
const seen: Seen[] = []

before(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body })
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/v2/query') {
        const query = JSON.parse(body) as { dimensions?: string[] }
        res.end(JSON.stringify(query.dimensions ? { results: [{ metrics: [40], dimensions: ['/pricing'] }] } : { results: [{ metrics: [120, 300], dimensions: [] }] }))
        return
      }
      if (req.url?.startsWith('/api/websites/site-1/stats')) {
        res.end(JSON.stringify({ visitors: { value: 7 }, pageviews: { value: 19 } }))
        return
      }
      if (req.url?.includes('/metrics') && req.url.includes('type=path')) {
        res.statusCode = 400
        res.end('{}')
        return
      }
      if (req.url?.includes('/metrics')) {
        res.end(JSON.stringify([{ x: '/', y: 5 }]))
        return
      }
      res.statusCode = 404
      res.end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => server.close())

describe('fetchAnalytics', () => {
  it('reads Plausible totals and top pages', async () => {
    const summary = await fetchAnalytics({ kind: 'plausible', url: base, apiKey: 'secret', siteId: 'example.com' })
    assert.deepEqual(summary, { visitors: 120, pageviews: 300, topPages: [{ path: '/pricing', visitors: 40 }] })
    const request = seen.find((item) => item.url === '/api/v2/query')
    assert.equal(request?.headers.authorization, 'Bearer secret')
    assert.equal((JSON.parse(request?.body ?? '{}') as { site_id?: string }).site_id, 'example.com')
  })

  it('reads Umami 2 numbers and falls back to the "url" metric', async () => {
    const summary = await fetchAnalytics({ kind: 'umami', url: `${base}/api`, apiKey: 'token', websiteId: 'site-1' })
    assert.deepEqual(summary, { visitors: 7, pageviews: 19, topPages: [{ path: '/', visitors: 5 }] })
  })

  it('fails when the API fails', async () => {
    await assert.rejects(fetchAnalytics({ kind: 'umami', url: `${base}/api`, apiKey: 'token', websiteId: 'missing' }))
  })
})

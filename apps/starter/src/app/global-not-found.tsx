// The 404 page for direct requests (unknown URLs and `notFound()` in site pages). The app has
// several root layouts ((frontend), (payload), (builder-canvas)), so Next renders this file instead
// of a layout plus not-found.tsx (`experimental.globalNotFound` in next.config.ts). It must render
// the whole document, so it repeats the site layout's shell: fonts, globals.css and the theme.
import type { Metadata } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { cn } from '@/lib/utils'
import { NotFoundContent } from '@/components/NotFoundContent'
import { ThemeStyle } from 'payload-canvas/react/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import { getSiteInfo } from '@/utilities/generateMeta'

import './(frontend)/globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteInfo()
  return {
    title: site.name ? `Page not found | ${site.name}` : 'Page not found',
    description: 'The page you are looking for does not exist.',
  }
}

export default async function GlobalNotFound() {
  const payload = await getPayload({ config })
  return (
    <html className={cn(GeistSans.variable, GeistMono.variable)} lang="en">
      <head>
        <ThemeStyle payload={payload} />
      </head>
      <body className="font-sans antialiased">
        <NotFoundContent />
      </body>
    </html>
  )
}

import type { Metadata } from 'next'

import { cn } from '@/lib/utils'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import React from 'react'
import { draftMode, headers } from 'next/headers'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { getServerSideURL } from '@/utilities/getURL'
import { resolveTemplateParts } from '@/utilities/resolveTemplateParts'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { BlockSelectionHandler } from '@/components/BlockSelectionHandler'
import { buildCSSVariables } from '@/lib/themeUtils'

import './globals.css'

const getTheme = unstable_cache(
  async () => {
    const payload = await getPayload({ config: configPromise })
    return payload.findGlobal({ slug: 'theme-settings' })
  },
  ['theme-settings'],
  { tags: ['theme-settings'] },
)

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled: draft } = await draftMode()
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || '/'

  const currentCollection = pathname.startsWith('/blog') ? 'posts' : 'pages'

  const headerPart = await resolveTemplateParts('header', pathname, currentCollection, draft)
  const footerPart = await resolveTemplateParts('footer', pathname, currentCollection, draft)

  const theme = await getTheme()
  const cssVars = buildCSSVariables(theme as any)

  return (
    <html
      className={cn(GeistSans.variable, GeistMono.variable)}
      lang="en"
      style={Object.keys(cssVars).length > 0 ? cssVars : undefined}
    >
      <head>
        {theme?.fonts?.sans && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link
              rel="stylesheet"
              href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fonts.sans)}&display=swap`}
            />
          </>
        )}
        {theme?.fonts?.mono && (
          <link
            rel="stylesheet"
            href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fonts.mono)}&display=swap`}
          />
        )}
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body className="font-sans antialiased">
        {draft && <BlockSelectionHandler />}
        {headerPart?.layout && (
          <header>
            <RenderBlocks blocks={headerPart.layout as any[]} compiledBlockCSS={(headerPart as any)._compiledBlockCSS} />
          </header>
        )}
        {children}
        {footerPart?.layout && (
          <footer>
            <RenderBlocks blocks={footerPart.layout as any[]} compiledBlockCSS={(footerPart as any)._compiledBlockCSS} />
          </footer>
        )}
      </body>
    </html>
  )
}

export const metadata: Metadata = {
  metadataBase: new URL(getServerSideURL()),
  openGraph: mergeOpenGraph(),
  twitter: {
    card: 'summary_large_image',
  },
}

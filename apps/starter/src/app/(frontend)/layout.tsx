import type { Metadata } from 'next'

import { cn } from '@/lib/utils'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import React from 'react'
import { draftMode, headers } from 'next/headers'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { getServerSideURL } from '@/utilities/getURL'
import { resolveTemplateParts } from '@/utilities/resolveTemplateParts'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { BlockSelectionHandler } from '@/components/BlockSelectionHandler'

import './globals.css'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled: draft } = await draftMode()
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || '/'

  const currentCollection = pathname.startsWith('/blog') ? 'posts' : 'pages'

  const headerPart = await resolveTemplateParts('header', pathname, currentCollection, draft)
  const footerPart = await resolveTemplateParts('footer', pathname, currentCollection, draft)

  return (
    <html className={cn(GeistSans.variable, GeistMono.variable)} lang="en">
      <head>
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        {draft && <BlockSelectionHandler />}
        {headerPart?.layout && (
          <header>
            <RenderBlocks blocks={headerPart.layout as any[]} />
          </header>
        )}
        {children}
        {footerPart?.layout && (
          <footer>
            <RenderBlocks blocks={footerPart.layout as any[]} />
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

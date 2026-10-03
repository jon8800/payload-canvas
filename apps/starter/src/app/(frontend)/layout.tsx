import type { Metadata } from 'next'

import { cn } from '@/lib/utils'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { ReactNode } from 'react'
import { draftMode, headers } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { getServerSideURL } from '@/utilities/getURL'
import { resolveTemplateParts } from '@/utilities/resolveTemplateParts'
import { BuilderContent } from '@/components/BuilderContent'
import { ThemeHead } from '@/components/ThemeHead'

import './globals.css'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { isEnabled: draft } = await draftMode()
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || '/'
  const currentCollection = pathname.startsWith('/blog') ? 'posts' : 'pages'

  const [headerPart, footerPart, payload] = await Promise.all([
    resolveTemplateParts('header', pathname, currentCollection, draft),
    resolveTemplateParts('footer', pathname, currentCollection, draft),
    getPayload({ config: configPromise }),
  ])

  return (
    <html className={cn(GeistSans.variable, GeistMono.variable)} lang="en">
      <head>
        <ThemeHead />
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body className="font-sans antialiased">
        {headerPart ? <BuilderContent doc={headerPart} payload={payload} draft={draft} /> : null}
        {children}
        {footerPart ? <BuilderContent doc={footerPart} payload={payload} draft={draft} /> : null}
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

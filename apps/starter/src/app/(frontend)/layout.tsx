import type { Metadata } from 'next'

import { cn } from '@/lib/utils'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { ReactNode } from 'react'

import { getServerSideURL } from '@/utilities/getURL'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { ThemeHead } from '@/components/ThemeHead'

import './globals.css'

/**
 * The document shell only. Each page renders its own frame (header part, content, footer part)
 * through `SiteFrame`, so all builder layouts on a page share one stylesheet.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={cn(GeistSans.variable, GeistMono.variable)} lang="en">
      <head>
        <ThemeHead />
      </head>
      <body className="font-sans antialiased">{children}</body>
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

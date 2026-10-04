import type { Metadata } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { ReactNode } from 'react'
import { ThemeStyle } from '@payload-toolkit/builder-react/server'
import config from '@payload-config'
import { getPayload } from 'payload'

// The canvas iframe of the page builder has its own root layout: no site header or footer,
// and no globals.css. The canvas compiles the full CSS for the layout in the browser.
// It gets the same theme variables and fonts as the site layout. `live` reloads them when the
// Theme global is saved in another tab.
export default async function BuilderCanvasLayout({ children }: { children: ReactNode }) {
  const payload = await getPayload({ config })
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <ThemeStyle payload={payload} live />
      </head>
      <body>{children}</body>
    </html>
  )
}

export const metadata: Metadata = {
  title: 'Builder canvas',
  robots: { index: false, follow: false },
}

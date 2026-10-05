import type { Metadata } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { ReactNode } from 'react'
import { ThemeStyle } from '@payload-toolkit/builder-react/server'
import config from '@payload-config'
import { getPayload } from 'payload'

// The site's CSS: every class Tailwind found in the app's files, so components show their own
// classes on the canvas as on the site. The canvas adds the CSS for the layout's classes after it
// (compiled in the browser), as the site adds the generated CSS.
import '../(frontend)/globals.css'

// The canvas iframe of the page builder has its own root layout: no site header or footer.
// It gets the same CSS, theme variables, fonts and body classes as the site layout. `live`
// reloads the theme when the Theme global is saved in another tab.
export default async function BuilderCanvasLayout({ children }: { children: ReactNode }) {
  const payload = await getPayload({ config })
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <ThemeStyle payload={payload} live />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}

export const metadata: Metadata = {
  title: 'Builder canvas',
  robots: { index: false, follow: false },
}

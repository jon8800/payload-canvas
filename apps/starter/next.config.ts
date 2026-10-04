import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // The app has several root layouts, so the site's 404 page is app/global-not-found.tsx.
    // Without it a direct request for an unknown URL gets Next's blank error shell.
    globalNotFound: true,
  },
  transpilePackages: ['@payload-toolkit/builder', '@payload-toolkit/builder-react'],
  // The website builder compiles Tailwind classes on save. Standalone output must ship the CSS
  // entry and the stylesheets it imports.
  outputFileTracingIncludes: {
    '/*': [
      './src/app/\\(frontend\\)/globals.css',
      './node_modules/tailwindcss/package.json',
      './node_modules/tailwindcss/*.css',
      './node_modules/tw-animate-css/package.json',
      './node_modules/tw-animate-css/dist/*.css',
      './node_modules/shadcn/package.json',
      './node_modules/shadcn/dist/tailwind.css',
    ],
  },
  sassOptions: {
    includePaths: [
      path.resolve(import.meta.dirname, 'node_modules', '@payloadcms', 'ui', 'dist', 'scss'),
    ],
  },
}

export default withPayload(nextConfig)

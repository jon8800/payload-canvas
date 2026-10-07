import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Compression belongs to the reverse proxy (see "Deploying" in packages/payload-canvas/README.md).
  // Next's built-in gzip leaks one 'drain' listener per backpressure event on streamed HTML
  // (the large admin and builder pages), which logs MaxListenersExceededWarning in production.
  compress: false,
  experimental: {
    // The app has several root layouts, so the site's 404 page is app/global-not-found.tsx.
    // Without it a direct request for an unknown URL gets Next's blank error shell.
    globalNotFound: true,
  },
  transpilePackages: ['payload-canvas'],
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
  // MCP sign-in (OAuth): AI clients look for these root URLs. Payload endpoints cannot serve them.
  async rewrites() {
    return [
      { source: '/.well-known/oauth-authorization-server', destination: '/api/mcp/oauth/metadata' },
      { source: '/.well-known/oauth-protected-resource', destination: '/api/mcp/oauth/resource' },
      { source: '/.well-known/oauth-protected-resource/api/mcp', destination: '/api/mcp/oauth/resource' },
    ]
  },
  // The approval screen must not load inside another site's frame.
  async headers() {
    return [
      {
        source: '/admin/mcp-:view',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
  sassOptions: {
    includePaths: [
      path.resolve(import.meta.dirname, 'node_modules', '@payloadcms', 'ui', 'dist', 'scss'),
    ],
  },
}

export default withPayload(nextConfig)

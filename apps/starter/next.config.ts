import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Resolve @payloadcms/ui SCSS path through pnpm's node_modules structure
const payloadUiPath = path.dirname(require.resolve('@payloadcms/ui/package.json'))

const nextConfig: NextConfig = {
  output: 'standalone',
  sassOptions: {
    includePaths: [path.join(payloadUiPath, 'dist', 'scss')],
  },
}

export default withPayload(nextConfig)

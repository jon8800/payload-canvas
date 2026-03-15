import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  sassOptions: {
    includePaths: [
      path.resolve(import.meta.dirname, 'node_modules', '@payloadcms', 'ui', 'dist', 'scss'),
    ],
  },
}

export default withPayload(nextConfig)

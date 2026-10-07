// The GitHub repo that hosts Payload Canvas. Change it here if the repo moves.
export const GITHUB_OWNER = 'jon8800'
export const GITHUB_REPO = 'payload-toolkit'
export const DEFAULT_REF = 'main'
export const STARTER_SUBDIR = 'apps/starter'
// Guides that the starter's .env.example points to. They live at the repo root.
export const DOCS_SUBDIR = 'docs/ai'

export function tarballUrl(ref: string): string {
  return `https://codeload.github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tar.gz/${ref}`
}

// Version range for the payload-canvas package when it comes from npm.
export const PUBLISHED_VERSION = '^0.1.0'

// The package the starter depends on: its npm name and its folder under `packages/` in the repo.
export const BUILDER_PACKAGE = { name: 'payload-canvas', dir: 'payload-canvas' } as const

// Files and folders of the starter that only make sense inside the repo. The CLI does not copy them.
//  - Docker files expect the repo root as build context and the workspace packages.
//  - `setup.ts` is the repo's own scaffold script; the CLI replaces it.
//  - `_` scripts are developer test helpers.
export const SKIP_NAMES = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.git',
  '.env',
  '.tarballs',
  '.playwright-mcp',
  '.claude',
  'screenshots',
  'tsconfig.tsbuildinfo',
  'next-env.d.ts',
  'Dockerfile',
  'Dockerfile.dockerignore',
  'docker-compose.yml',
])
// Paths relative to the starter folder.
export const SKIP_PATHS = ['scripts/setup.ts', 'scripts/lib', 'docs/qa']

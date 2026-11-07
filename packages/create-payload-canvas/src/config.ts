// The GitHub repo that hosts Payload Canvas. Change it here if the repo moves.
export const GITHUB_OWNER = 'jon8800'
export const GITHUB_REPO = 'payload-canvas'
export const DEFAULT_REF = 'main'
export const STARTER_SUBDIR = 'apps/starter'
// Guides that the starter's .env.example points to. They live at the repo root.
export const DOCS_SUBDIR = 'docs/ai'

export function tarballUrl(ref: string): string {
  return `https://codeload.github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tar.gz/${ref}`
}

// Version range for the payload-canvas package when it comes from npm.
export const PUBLISHED_VERSION = '^0.3.0'

// The package the starter depends on: its npm name and its folder under `packages/` in the repo.
export const BUILDER_PACKAGE = { name: 'payload-canvas', dir: 'payload-canvas' } as const

// Files and folders of the starter that only make sense inside the repo. The CLI does not copy them.
//  - Docker files expect the repo root as build context and the workspace packages.
//  - `setup.ts` is the repo's own scaffold script; the CLI replaces it. The two `scripts/lib` files
//    were its helpers. Keep `scripts/lib/classes.ts`: the seed scripts import it.
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
export const SKIP_PATHS = ['scripts/setup.ts', 'scripts/lib/create-database.ts', 'scripts/lib/generate-env.ts', 'docs/qa']

// Starter features the user can turn off. The CLI asks about these and has a `--no-<id>` flag for each.
// The starter's `starter-features.json` says which files, config lines and scripts belong to each one.
// A feature in that file but not in this list is always kept.
export const FEATURES = [
  { id: 'look', label: 'Admin look', hint: 'Neutral colors and finer details in the admin' },
  { id: 'nav', label: 'Sidebar navigation', hint: 'Grouped sidebar with icons' },
  { id: 'dashboard', label: 'Dashboard widgets', hint: 'Quick actions, recent edits, form messages, site checks, analytics' },
  { id: 'demo', label: 'Demo content', hint: 'The demo pages, posts and images seed' },
  { id: 'ai', label: 'AI assistant', hint: 'The chat panel in the page builder' },
] as const

export type FeatureId = (typeof FEATURES)[number]['id']

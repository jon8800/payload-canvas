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
export const PUBLISHED_VERSION = '^0.6.1'

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
// `uploads`: files visitors sent with forms (private, never part of a new project).
export const SKIP_PATHS = ['scripts/setup.ts', 'scripts/lib/create-database.ts', 'scripts/lib/generate-env.ts', 'docs/qa', 'uploads']

// Starter features the user can turn on or off. The CLI asks about these and has a `--<id>` and a
// `--no-<id>` flag for each. `on: false` features are off unless the user picks them.
// The starter's `starter-features.json` says which files, config lines, scripts and dependencies
// belong to each one. A feature in that file but not in this list is always kept.
export const FEATURES = [
  { id: 'look', label: 'Admin look', hint: 'Neutral colors and finer details in the admin', on: true },
  { id: 'nav', label: 'Sidebar navigation', hint: 'Grouped sidebar with icons', on: true },
  { id: 'dashboard', label: 'Dashboard widgets', hint: 'Quick actions, recent edits, form messages, site checks, analytics', on: true },
  { id: 'demo', label: 'Demo content', hint: 'The demo pages, posts and images seed', on: true },
  { id: 'ai', label: 'AI assistant', hint: 'The chat panel in the page builder', on: true },
  { id: 'gallery', label: 'Media gallery', hint: 'Media as a grid with a lightbox and drag-and-drop upload (payload-media-gallery)', on: true },
  { id: 'workflows', label: 'Workflows', hint: 'A visual workflow builder and a graph of every job run (payload-workflows)', on: true },
  { id: 'reviews', label: 'Google reviews', hint: 'Syncs Google reviews into a collection; needs a Google place (payload-google-reviews)', on: false },
] as const

export type FeatureId = (typeof FEATURES)[number]['id']

/** The features that are on when the user passes no flags. */
export const DEFAULT_FEATURES: FeatureId[] = FEATURES.filter((feature) => feature.on).map((feature) => feature.id)

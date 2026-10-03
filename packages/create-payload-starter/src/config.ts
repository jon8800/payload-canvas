// The GitHub owner that hosts the payload-toolkit repo. Change it here if the repo moves.
export const GITHUB_OWNER = 'jon8800'
export const GITHUB_REPO = 'payload-toolkit'
export const GITHUB_BRANCH = 'main'
export const TARBALL_URL = `https://codeload.github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tar.gz/${GITHUB_BRANCH}`
export const STARTER_SUBDIR = 'apps/starter'

// Version range for the builder packages when the CLI runs outside the repo.
export const PUBLISHED_VERSION = '^0.1.0'

// Builder packages the starter depends on, as folders under `packages/` in the repo.
export const BUILDER_PACKAGES = [
  { name: '@payload-toolkit/builder', dir: 'builder' },
  { name: '@payload-toolkit/builder-react', dir: 'builder-react' },
] as const

import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { x as extractTar } from 'tar'

import { GITHUB_BRANCH, GITHUB_REPO, STARTER_SUBDIR, TARBALL_URL } from './config.js'

const SKIP_NAMES = new Set(['node_modules', '.next', '.turbo', '.env', 'tsconfig.tsbuildinfo', '.git'])

/** True for files that must not be copied. `rel` is relative to the starter folder. */
function shouldSkip(rel: string): boolean {
  const parts = rel.split('/').filter(Boolean)
  if (parts.some((part) => SKIP_NAMES.has(part))) return true
  // Uploaded files: keep the folder, drop the files.
  return parts[0] === 'public' && parts[1] === 'media' && parts.length > 2
}

/** Finds the repo root when the CLI runs from inside the payload-toolkit repo. */
export function findRepoRoot(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const hasWorkspace = fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))
    if (hasWorkspace && fs.existsSync(path.join(dir, STARTER_SUBDIR, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function copyStarterFromRepo(repoRoot: string, targetDir: string): void {
  const source = path.join(repoRoot, STARTER_SUBDIR)
  fs.cpSync(source, targetDir, {
    recursive: true,
    filter: (src) => !shouldSkip(path.relative(source, src).split(path.sep).join('/')),
  })
}

export async function downloadStarter(targetDir: string): Promise<void> {
  const response = await fetch(TARBALL_URL)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (HTTP ${response.status}) from ${TARBALL_URL}`)
  }
  // GitHub puts everything in one top folder named `<repo>-<branch>`.
  const prefix = `${GITHUB_REPO}-${GITHUB_BRANCH}/${STARTER_SUBDIR}/`
  await pipeline(
    Readable.fromWeb(response.body as never),
    extractTar({
      cwd: targetDir,
      strip: prefix.split('/').filter(Boolean).length,
      filter: (entryPath) => entryPath.startsWith(prefix) && !shouldSkip(entryPath.slice(prefix.length)),
    }),
  )
}

/** Makes sure `public/media` exists, so uploads work on the first run. */
export function ensureMediaFolder(targetDir: string): void {
  const media = path.join(targetDir, 'public', 'media')
  fs.mkdirSync(media, { recursive: true })
  fs.writeFileSync(path.join(media, '.gitkeep'), '')
}

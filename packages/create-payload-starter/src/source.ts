import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { x as extractTar } from 'tar'

import { DOCS_SUBDIR, GITHUB_OWNER, GITHUB_REPO, SKIP_NAMES, SKIP_PATHS, STARTER_SUBDIR, tarballUrl } from './config.js'

/** True for files that must not be copied. `rel` is relative to the starter folder, with `/` separators. */
function shouldSkip(rel: string): boolean {
  const parts = rel.split('/').filter(Boolean)
  if (parts.some((part) => SKIP_NAMES.has(part))) return true
  if (SKIP_PATHS.some((skip) => rel === skip || rel.startsWith(`${skip}/`))) return true
  // Developer test helpers, such as scripts/_dev-user.ts.
  if (parts[0] === 'scripts' && parts[1]?.startsWith('_')) return true
  // Uploaded files: keep the folder, drop the files.
  return parts[0] === 'public' && parts[1] === 'media' && parts.length > 2
}

export function isRepoRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) && fs.existsSync(path.join(dir, STARTER_SUBDIR, 'package.json'))
}

/** Finds the repo root when the CLI file lives inside the payload-toolkit repo. */
export function findRepoRoot(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (isRepoRoot(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Copies the starter, and the AI guides it links to, from a repo checkout into `targetDir`. */
export function copyStarterFromRepo(repoRoot: string, targetDir: string): void {
  const source = path.join(repoRoot, STARTER_SUBDIR)
  fs.cpSync(source, targetDir, {
    recursive: true,
    filter: (src) => !shouldSkip(path.relative(source, src).split(path.sep).join('/')),
  })
  const docs = path.join(repoRoot, DOCS_SUBDIR)
  if (fs.existsSync(docs)) fs.cpSync(docs, path.join(targetDir, DOCS_SUBDIR), { recursive: true })
  ensureMediaFolder(targetDir)
}

/**
 * Downloads the repo from GitHub and unpacks only the starter and the AI guides into a temp folder.
 * The result has the same layout as a repo checkout. The caller deletes it.
 */
export async function downloadRepo(ref: string): Promise<string> {
  const url = tarballUrl(ref)
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  } catch (error) {
    throw new Error(
      `Could not reach GitHub (${error instanceof Error ? error.message : String(error)}). Check your network, or run the CLI from a payload-toolkit checkout.`,
      { cause: error },
    )
  }
  if (response.status === 404) {
    throw new Error(`Branch or tag "${ref}" was not found in ${GITHUB_OWNER}/${GITHUB_REPO}.`)
  }
  if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status}) from ${url}`)

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-payload-toolkit-'))
  try {
    // GitHub puts everything in one top folder, `strip: 1` removes it.
    const wanted = [`${STARTER_SUBDIR}/`, `${DOCS_SUBDIR}/`]
    await pipeline(
      Readable.fromWeb(response.body as never),
      extractTar({
        cwd: temp,
        strip: 1,
        filter: (entryPath) => {
          const inner = entryPath.split('/').slice(1).join('/')
          return wanted.some((prefix) => inner.startsWith(prefix))
        },
      }),
    )
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true })
    throw error
  }
  if (!fs.existsSync(path.join(temp, STARTER_SUBDIR, 'package.json'))) {
    fs.rmSync(temp, { recursive: true, force: true })
    throw new Error(`The download has no ${STARTER_SUBDIR} folder. Is "${ref}" the right branch?`)
  }
  return temp
}

/** Makes sure `public/media` exists, so uploads work on the first run. */
function ensureMediaFolder(targetDir: string): void {
  const media = path.join(targetDir, 'public', 'media')
  fs.mkdirSync(media, { recursive: true })
  fs.writeFileSync(path.join(media, '.gitkeep'), '')
}

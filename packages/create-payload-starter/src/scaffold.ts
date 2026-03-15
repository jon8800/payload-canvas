import * as p from '@clack/prompts'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { x as extractTar } from 'tar'

const REPO_OWNER = 'jon8800'
const REPO_NAME = 'payload-toolkit'
const BRANCH = 'main'
const TEMPLATE_SUBDIR = 'apps/starter'

export async function scaffoldProject(targetDir: string): Promise<void> {
  const s = p.spinner()

  if (fs.existsSync(targetDir)) {
    const files = fs.readdirSync(targetDir)
    if (files.length > 0) {
      p.log.error(`Directory "${targetDir}" already exists and is not empty.`)
      process.exit(1)
    }
  }

  fs.mkdirSync(targetDir, { recursive: true })

  s.start('Downloading starter template...')

  const tarballUrl = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/${BRANCH}`
  const prefix = `${REPO_NAME}-${BRANCH}/${TEMPLATE_SUBDIR}/`
  const stripCount = prefix.split('/').filter(Boolean).length

  try {
    const response = await fetch(tarballUrl)
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const readable = Readable.fromWeb(response.body as any)

    await new Promise<void>((resolve, reject) => {
      readable
        .pipe(
          extractTar({
            cwd: targetDir,
            filter: (filePath: string) => filePath.startsWith(prefix),
            strip: stripCount,
          })
        )
        .on('finish', resolve)
        .on('error', reject)
    })

    s.stop('Template downloaded.')
  } catch (err) {
    s.stop('Download failed.')
    p.log.error(`Failed to download template: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // Remove setup-only files that should not be in scaffolded projects
  const filesToDelete = ['scripts/setup.ts', 'scripts/lib/modify-config.ts']
  for (const file of filesToDelete) {
    const filePath = `${targetDir}/${file}`
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { recursive: true, force: true })
    }
  }

  p.log.success('Project scaffolded successfully.')
}

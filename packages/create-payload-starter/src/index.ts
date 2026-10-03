#!/usr/bin/env node

import * as p from '@clack/prompts'
import fs from 'node:fs'
import path from 'node:path'

import { buildDatabaseUrl, createDatabase } from './database.js'
import { resolveOptions } from './options.js'
import { ensureMediaFolder, copyStarterFromRepo, downloadStarter, findRepoRoot } from './source.js'
import { packBuilderPackages, updatePackageJson, writeEnv } from './project.js'
import { hasCommand, run } from './run.js'

async function main() {
  const options = await resolveOptions()
  if (!options) return
  const { targetDir, name, db } = options

  // 1. Copy the starter.
  const repoRoot = findRepoRoot()
  const spinner = p.spinner()
  spinner.start(repoRoot ? 'Copying the starter from the repo...' : 'Downloading the starter from GitHub...')
  fs.mkdirSync(targetDir, { recursive: true })
  if (repoRoot) copyStarterFromRepo(repoRoot, targetDir)
  else await downloadStarter(targetDir)
  ensureMediaFolder(targetDir)
  spinner.stop('Starter files ready.')

  // 2. Point the builder packages at local tarballs (repo) or the published version (download).
  spinner.start('Writing package.json and .env...')
  const tarballs = repoRoot ? packBuilderPackages(repoRoot, targetDir) : null
  updatePackageJson(targetDir, name, tarballs)
  writeEnv(targetDir, buildDatabaseUrl(db))
  spinner.stop('package.json and .env written.')

  // 3. Create the database.
  let databaseReady = false
  try {
    const created = await createDatabase(db)
    databaseReady = true
    p.log.success(created ? `Created database "${db.name}".` : `Database "${db.name}" already exists.`)
  } catch (error) {
    p.log.warn(`Could not create the database: ${error instanceof Error ? error.message : String(error)}`)
    p.log.warn(`Create "${db.name}" yourself, or fix DATABASE_URL in ${path.join(targetDir, '.env')}.`)
  }

  // 4. Install. The schema syncs on the first `dev` run (push: true), so there is no migrate step.
  const manager = hasCommand('pnpm') ? 'pnpm' : 'npm'
  let installed = false
  if (options.install) {
    p.log.step(`Installing dependencies with ${manager}...`)
    installed = run(manager, ['install'], targetDir)
    if (!installed) throw new Error(`"${manager} install" failed. Fix the error, then run it again in ${targetDir}.`)
  }

  // 5. Seed.
  if (options.seed) {
    if (!installed || !databaseReady) {
      p.log.warn('Skipped seeding: it needs installed dependencies and a working database.')
    } else {
      p.log.step('Seeding demo content...')
      const seeded = run(manager, ['run', 'seed:demo'], targetDir)
      if (!seeded) p.log.warn(`Seeding failed. Run "${manager} run seed:demo" in ${targetDir} to try again.`)
    }
  }

  const relative = path.relative(process.cwd(), targetDir) || '.'
  const steps = [
    `cd ${relative}`,
    options.install ? null : `${manager} install`,
    `${manager} run dev`,
    'Open http://localhost:3000/admin and create the first user.',
  ].filter(Boolean)
  p.note(steps.join('\n'), 'Next steps')
  p.outro('Done.')
}

main().catch((error) => {
  p.log.error(error instanceof Error ? error.message : String(error))
  p.cancel('Setup failed.')
  process.exit(1)
})

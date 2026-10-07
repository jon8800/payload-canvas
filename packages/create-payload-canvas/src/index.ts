#!/usr/bin/env node

import * as p from '@clack/prompts'
import fs from 'node:fs'
import path from 'node:path'

import { BUILDER_PACKAGE } from './config.js'
import { buildDatabaseUrl, checkDatabase, createDatabase, type DbState } from './database.js'
import { resolveOptions, type Options } from './options.js'
import {
  builderPackageIsPublished,
  checkProject,
  hasBuilderPackage,
  packBuilderPackage,
  updatePackageJson,
  writeEnv,
} from './project.js'
import { hasCommand, run } from './run.js'
import { copyStarterFromRepo, downloadRepo, findRepoRoot, isRepoRoot } from './source.js'

/** Works out where the starter files and the payload-canvas package come from. Stops early if the install cannot work. */
async function resolveSource(options: Options) {
  if (options.packages && !hasBuilderPackage(options.packages)) {
    throw new Error(`--packages "${options.packages}" is not a Payload Canvas checkout (no packages/${BUILDER_PACKAGE.dir} folder).`)
  }
  // A repo checkout also holds the matching starter, so use it unless --github says otherwise.
  const checkout = options.packages && isRepoRoot(options.packages) ? options.packages : null
  const localRepo = options.github ? null : (findRepoRoot() ?? checkout)
  // Where `pnpm pack` finds the payload-canvas package. Null means: use the version on npm.
  const packagesRoot = options.packages ?? localRepo

  if (!packagesRoot && options.install) {
    const published = await builderPackageIsPublished()
    if (published === false) {
      throw new Error(
        [
          `${BUILDER_PACKAGE.name} is not published to npm yet, so the install would fail.`,
          'Pick one:',
          '  --packages <path-to-a-payload-canvas-checkout>    pack it from a local checkout',
          '  --no-install                                      only create the files, install later',
        ].join('\n'),
      )
    }
  }
  return { localRepo, packagesRoot }
}

const quote = (value: string) => (/\s/.test(value) ? `"${value}"` : value)

async function main() {
  const options = await resolveOptions()
  if (!options) return
  const { targetDir, name, db } = options

  // 0. Check everything that can fail before we write a single file.
  const { localRepo, packagesRoot } = await resolveSource(options)
  const manager = hasCommand('pnpm') ? 'pnpm' : 'npm'
  let dbState: DbState = 'missing'
  if (!options.skipDb) {
    dbState = await checkDatabase(db)
    if (dbState === 'exists' && !options.reuseDb) {
      throw new Error(
        `The database "${db.name}" already exists on ${db.host}:${db.port}. Pass --reuse-db to use it, or pick another --db-name.`,
      )
    }
  }

  // 1. Copy the starter. 2. Point payload-canvas at a local tarball or at npm. Write .env.
  // If this part fails, delete the half-made folder so the command can run again.
  const spinner = p.spinner()
  let tarball: string | null = null
  try {
    fs.mkdirSync(targetDir, { recursive: true })
    if (localRepo) {
      spinner.start('Copying the starter from the repo...')
      copyStarterFromRepo(localRepo, targetDir)
    } else {
      spinner.start(`Downloading the starter from GitHub (${options.ref})...`)
      const downloaded = await downloadRepo(options.ref)
      try {
        copyStarterFromRepo(downloaded, targetDir)
      } finally {
        fs.rmSync(downloaded, { recursive: true, force: true })
      }
    }
    spinner.stop('Starter files ready.')

    spinner.start(packagesRoot ? `Packing ${BUILDER_PACKAGE.name}...` : 'Writing package.json and .env...')
    tarball = packagesRoot ? packBuilderPackage(packagesRoot, targetDir) : null
    updatePackageJson(targetDir, name, tarball, manager)
    writeEnv(targetDir, buildDatabaseUrl(db))
    spinner.stop('package.json and .env written.')
  } catch (error) {
    spinner.error('Failed.')
    fs.rmSync(targetDir, { recursive: true, force: true })
    throw error
  }

  for (const problem of checkProject(targetDir)) p.log.warn(problem)
  if (!tarball && !options.install) {
    p.log.warn(`${BUILDER_PACKAGE.name} comes from npm. It must be published before "${manager} install" works.`)
  }

  // 3. Create the database.
  if (options.skipDb) {
    p.log.info(`Skipped the database. Put your connection string in ${path.join(targetDir, '.env')}.`)
  } else if (dbState === 'exists') {
    p.log.success(`Using the existing database "${db.name}".`)
  } else {
    await createDatabase(db)
    p.log.success(`Created database "${db.name}".`)
  }

  // 4. Install. The schema syncs on the first `dev` run (push: true), so there is no migrate step.
  let installed = false
  if (options.install) {
    p.log.step(`Installing dependencies with ${manager}...`)
    installed = run(manager, ['install'], targetDir)
    if (!installed) {
      throw new Error(`"${manager} install" failed. The project is in ${targetDir}. Fix the error above, then run "${manager} install" there.`)
    }
  }

  // 5. Seed.
  let seeded = false
  if (options.seed) {
    p.log.step('Seeding demo content...')
    seeded = run(manager, ['run', 'seed:demo'], targetDir)
    if (!seeded) p.log.warn(`Seeding failed. Run "${manager} run seed:demo" in ${targetDir} to try again.`)
  }

  // 6. Summary.
  const relative = path.relative(process.cwd(), targetDir)
  const cdTarget = !relative ? null : relative.startsWith('..') || path.isAbsolute(relative) ? targetDir : relative
  const run_ = manager === 'pnpm' ? 'pnpm' : 'npm run'
  const lines = [
    `Project:   ${targetDir}`,
    options.skipDb ? 'Database:  not set up (--skip-db)' : `Database:  ${db.name} on ${db.host}:${db.port}`,
    `Demo data: ${seeded ? 'seeded' : 'not seeded'}`,
    '',
    'Next steps:',
    ...[
      cdTarget ? `cd ${quote(cdTarget)}` : null,
      options.install ? null : `${manager} install`,
      options.skipDb ? 'Set DATABASE_URL in .env' : null,
      `${run_} dev`,
    ]
      .filter((step): step is string => step !== null)
      .map((step) => `  ${step}`),
    '  Open http://localhost:3000/admin and create the first user.',
    '',
    'Do not run "payload migrate" on the local database. "dev" syncs the schema.',
    'Before your first production deploy, run this in the project:',
    `  ${manager === 'pnpm' ? 'pnpm' : 'npx'} payload migrate:create`,
    'Commit the new files in src/migrations. Migrations belong to your app, not the plugin.',
  ]
  p.note(lines.join('\n'), 'Done')
  p.outro('Your project is ready.')
}

main().catch((error) => {
  p.log.error(error instanceof Error ? error.message : String(error))
  p.cancel('Setup failed.')
  process.exit(1)
})

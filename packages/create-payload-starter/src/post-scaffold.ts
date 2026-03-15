import * as p from '@clack/prompts'
import spawn from 'cross-spawn'

import type { Selections } from './prompts.js'
import { createDatabase, generateEnv } from '@jon8800/shared'

export async function postScaffold(targetDir: string, selections: Selections): Promise<void> {
  const s = p.spinner()

  // Step 1: Generate .env
  s.start('Generating .env...')
  try {
    generateEnv({
      targetDir,
      projectName: selections.projectName,
      dbHost: selections.dbHost,
      dbPort: selections.dbPort,
      dbUser: selections.dbUser,
      dbPassword: selections.dbPassword,
      adminEmail: selections.adminEmail,
      smtp: selections.smtp,
    })
    s.stop('.env generated.')
  } catch (err) {
    s.stop('.env generation failed.')
    p.log.error(`Env error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // Step 2: Install dependencies
  s.start('Installing dependencies (this may take a while)...')
  const installResult = spawn.sync('pnpm', ['install'], {
    cwd: targetDir,
    stdio: 'inherit',
  })
  if (installResult.status !== 0) {
    s.stop('Install failed.')
    p.log.error('Failed to install dependencies. Run `pnpm install` manually in the project directory.')
    process.exit(1)
  }
  s.stop('Dependencies installed.')

  // Step 3: Create database
  s.start('Creating database...')
  try {
    await createDatabase({
      host: selections.dbHost,
      port: Number(selections.dbPort),
      user: selections.dbUser,
      password: selections.dbPassword,
      database: selections.projectName,
    })
    s.stop('Database ready.')
  } catch (err) {
    s.stop('Database creation failed.')
    p.log.error(`Database error: ${err instanceof Error ? err.message : String(err)}`)
    p.log.info('You may need to create the database manually.')
  }

  // Step 4: Run migrations
  s.start('Running migrations...')
  const migrateResult = spawn.sync('pnpm', ['payload', 'migrate'], {
    cwd: targetDir,
    stdio: 'inherit',
  })
  if (migrateResult.status !== 0) {
    s.stop('Migrations failed.')
    p.log.error('Migration failed. Check your database connection and try `pnpm payload migrate` manually.')
  } else {
    s.stop('Migrations complete.')
  }

  // Step 5: Create admin user
  s.start('Creating admin user...')
  try {
    const adminResult = spawn.sync(
      'pnpm',
      [
        'payload',
        'run',
        'scripts/create-admin.ts',
        '--',
        `--email=${selections.adminEmail}`,
        `--password=${selections.adminPassword}`,
      ],
      {
        cwd: targetDir,
        stdio: 'inherit',
      },
    )
    if (adminResult.status !== 0) {
      throw new Error('Admin creation command failed')
    }
    s.stop('Admin user created.')
  } catch (err) {
    s.stop('Admin creation failed.')
    p.log.warn('Could not create admin user. You can create one manually via the admin panel.')
  }

  // Step 6: Git init
  s.start('Initializing git repository...')
  try {
    const initResult = spawn.sync('git', ['init'], { cwd: targetDir, stdio: 'pipe' })
    if (initResult.status !== 0) {
      throw new Error('git init failed')
    }

    spawn.sync('git', ['add', '-A'], { cwd: targetDir, stdio: 'pipe' })
    spawn.sync('git', ['commit', '-m', 'Initial commit from create-payload-starter'], {
      cwd: targetDir,
      stdio: 'pipe',
    })
    s.stop('Git repository initialized.')
  } catch (err) {
    s.stop('Git init failed.')
    p.log.warn('Could not initialize git repository. You can run `git init` manually.')
  }
}

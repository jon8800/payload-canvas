import * as p from '@clack/prompts'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { DEFAULT_REF } from './config.js'
import { databaseNameFor, parseDatabaseUrl, type DbConfig } from './database.js'

export type Options = {
  targetDir: string
  name: string
  db: DbConfig
  seed: boolean
  install: boolean
  /** Do not connect to Postgres at all. Only writes the .env file. */
  skipDb: boolean
  /** Use the database if it already exists, instead of stopping. */
  reuseDb: boolean
  /** Download the starter from GitHub, even when the CLI runs inside the repo. */
  github: boolean
  /** Branch or tag to download. */
  ref: string
  /** Path to a payload-toolkit checkout. The builder packages are packed from there. */
  packages: string | null
}

export const HELP = `Usage: create-payload-toolkit [project-dir] [flags]

Creates a Payload CMS website builder project. Nothing is asked when you pass --yes
or when the input is not a terminal.

Project:
  -y, --yes                 Use defaults and ask nothing
      --no-install          Do not install dependencies (this also skips seeding)
      --seed / --no-seed    Seed demo content (default: yes with --yes, else ask)

Database (default user and password: postgres):
      --db-url <url>        postgresql://user:pass@host:5432/name (replaces the flags below)
      --db-host <host>      Default: localhost
      --db-port <port>      Default: 5432
      --db-user <user>
      --db-password <pw>
      --db-name <name>      Default: the project name with underscores
      --reuse-db            Use the database if it already exists (default: stop with an error)
      --skip-db             Do not connect to Postgres. Writes .env only. Skips seeding.

Source:
      --github              Download the starter from GitHub, even inside the repo
      --ref <name>          Branch or tag to download (default: ${DEFAULT_REF})
      --packages <path>     Path to a payload-toolkit checkout. The builder packages are packed
                            from there. Use this until they are published to npm.

  -h, --help                Show this help
`

function parseFlags() {
  return parseArgs({
    allowPositionals: true,
    options: {
      yes: { type: 'boolean', short: 'y' },
      'db-url': { type: 'string' },
      'db-host': { type: 'string' },
      'db-port': { type: 'string' },
      'db-user': { type: 'string' },
      'db-password': { type: 'string' },
      'db-name': { type: 'string' },
      'reuse-db': { type: 'boolean' },
      'skip-db': { type: 'boolean' },
      seed: { type: 'boolean' },
      'no-seed': { type: 'boolean' },
      'no-install': { type: 'boolean' },
      github: { type: 'boolean' },
      ref: { type: 'string' },
      packages: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
}

function cancelled(): never {
  p.cancel('Cancelled.')
  process.exit(0)
}

async function ask(prompt: Promise<string | symbol>): Promise<string> {
  const value = await prompt
  if (typeof value !== 'string') cancelled()
  return value
}

function validateName(value: string | undefined): string | undefined {
  if (!value || !/^[a-z0-9][a-z0-9-_]*$/.test(value)) {
    return 'Use lowercase letters, numbers, hyphens and underscores.'
  }
}

function validateTarget(dir: string): string | undefined {
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) return `"${dir}" exists and is a file.`
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    return `The folder "${dir}" already exists and is not empty. Pick another name, or delete it.`
  }
}

/** Reads flags, asks for anything missing, and returns the final options. Returns null after --help. */
export async function resolveOptions(): Promise<Options | null> {
  let parsed: ReturnType<typeof parseFlags>
  try {
    parsed = parseFlags()
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nRun with --help to see the flags.`, { cause: error })
  }
  const { values, positionals } = parsed
  if (values.help) {
    console.log(HELP)
    return null
  }
  p.intro('Create Payload Toolkit')

  // Without a terminal nobody can answer a prompt, so use the defaults.
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  const yes = values.yes === true || !interactive
  if (!interactive && values.yes !== true) p.log.info('No terminal found. Using defaults for everything you did not pass as a flag.')

  // Project directory and name.
  let dirInput = positionals[0]
  if (!dirInput) {
    dirInput = yes
      ? 'my-website'
      : await ask(
          p.text({
            message: 'Project name (also the folder name)',
            placeholder: 'my-website',
            defaultValue: 'my-website',
            validate: (value) => {
              const text = value || 'my-website'
              return validateName(text) ?? validateTarget(path.resolve(process.cwd(), text))
            },
          }),
        )
  }
  const targetDir = path.resolve(process.cwd(), dirInput)
  const name = path.basename(targetDir)
  const nameError = validateName(name) ?? validateTarget(targetDir)
  if (nameError) throw new Error(nameError)

  // Database.
  const skipDb = values['skip-db'] === true
  let db: DbConfig
  if (values['db-url']) {
    db = parseDatabaseUrl(values['db-url'])
  } else {
    const field = async (flag: string | undefined, message: string, fallback: string, secret = false) => {
      if (flag !== undefined) return flag
      if (yes || skipDb) return fallback
      if (secret) return ask(p.password({ message }))
      return ask(p.text({ message, placeholder: fallback, defaultValue: fallback }))
    }
    const host = await field(values['db-host'], 'Postgres host', 'localhost')
    const port = await field(values['db-port'], 'Postgres port', '5432')
    const user = await field(values['db-user'], 'Postgres user', 'postgres')
    const password = await field(values['db-password'], 'Postgres password', 'postgres', true)
    const dbName = await field(values['db-name'], 'Database name', databaseNameFor(name))
    if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error(`"${port}" is not a valid Postgres port.`)
    db = { host, port: Number(port), user, password, name: dbName }
  }
  if (values['db-name'] && values['db-url']) db.name = values['db-name']

  // Source.
  const packages = values.packages ? path.resolve(process.cwd(), values.packages) : null

  // Install and seed.
  const install = values['no-install'] !== true
  const canSeed = install && !skipDb
  let seed: boolean
  if (values['no-seed']) {
    seed = false
  } else if (values.seed) {
    seed = true
  } else if (!canSeed) {
    seed = false
  } else if (yes) {
    seed = true
  } else {
    const answer = await p.confirm({ message: 'Seed demo content?', initialValue: true })
    if (p.isCancel(answer)) cancelled()
    seed = answer
  }
  if (seed && !canSeed) {
    p.log.warn(`Seeding needs installed dependencies and a database, so ${skipDb ? '--skip-db' : '--no-install'} turns it off.`)
    seed = false
  }

  return {
    targetDir,
    name,
    db,
    seed,
    install,
    skipDb,
    reuseDb: values['reuse-db'] === true,
    github: values.github === true,
    ref: values.ref ?? DEFAULT_REF,
    packages,
  }
}

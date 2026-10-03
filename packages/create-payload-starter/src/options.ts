import * as p from '@clack/prompts'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { databaseNameFor, parseDatabaseUrl, type DbConfig } from './database.js'

export type Options = {
  targetDir: string
  name: string
  db: DbConfig
  seed: boolean
  install: boolean
}

export const HELP = `Usage: create-payload-toolkit [project-dir] [flags]

Flags:
  -y, --yes              Use defaults and ask nothing
      --db-url <url>     Postgres URL, e.g. postgresql://user:pass@localhost:5432/mydb
      --db-host <host>   Default: localhost
      --db-port <port>   Default: 5432
      --db-user <user>   Default: postgres
      --db-password <pw> Default: postgres (with --yes)
      --db-name <name>   Default: the project name with underscores
      --seed             Seed demo content
      --no-seed          Do not seed demo content
      --no-install       Do not install dependencies (this also skips seeding)
  -h, --help             Show this help
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
      seed: { type: 'boolean' },
      'no-seed': { type: 'boolean' },
      'no-install': { type: 'boolean' },
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
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) return `"${dir}" exists and is not empty.`
}

/** Reads flags, asks for anything missing, and returns the final options. Returns null after --help. */
export async function resolveOptions(): Promise<Options | null> {
  const { values, positionals } = parseFlags()
  if (values.help) {
    console.log(HELP)
    return null
  }
  p.intro('Create Payload Toolkit')
  const yes = values.yes === true

  // Project directory and name.
  let dirInput = positionals[0]
  if (!dirInput) {
    dirInput = yes ? 'my-website' : await ask(p.text({
      message: 'Project name (also the folder name)',
      placeholder: 'my-website',
      defaultValue: 'my-website',
      validate: (value) => validateName(value || 'my-website'),
    }))
  }
  const targetDir = path.resolve(process.cwd(), dirInput)
  const name = path.basename(targetDir)
  const nameError = validateName(name) ?? validateTarget(targetDir)
  if (nameError) throw new Error(nameError)

  // Database.
  let db: DbConfig
  if (values['db-url']) {
    db = parseDatabaseUrl(values['db-url'])
  } else {
    const field = async (flag: string | undefined, message: string, fallback: string, secret = false) => {
      if (flag !== undefined) return flag
      if (yes) return fallback
      if (secret) return ask(p.password({ message }))
      return ask(p.text({ message, placeholder: fallback, defaultValue: fallback }))
    }
    const host = await field(values['db-host'], 'Postgres host', 'localhost')
    const port = await field(values['db-port'], 'Postgres port', '5432')
    const user = await field(values['db-user'], 'Postgres user', 'postgres')
    const password = await field(values['db-password'], 'Postgres password', 'postgres', true)
    const dbName = await field(values['db-name'], 'Database name', databaseNameFor(name))
    db = { host, port: Number(port), user, password, name: dbName }
  }

  // Seed and install.
  const install = values['no-install'] !== true
  let seed: boolean
  if (values['no-seed'] || !install && !values.seed) {
    seed = false
  } else if (values.seed || yes) {
    seed = true
  } else {
    const answer = await p.confirm({ message: 'Seed demo content?', initialValue: true })
    if (p.isCancel(answer)) cancelled()
    seed = answer
  }
  if (!install && seed) {
    p.log.warn('Seeding needs installed dependencies, so --no-install turns it off.')
    seed = false
  }

  return { targetDir, name, db, seed, install }
}

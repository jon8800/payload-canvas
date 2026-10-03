import pg from 'pg'

export type DbConfig = {
  host: string
  port: number
  user: string
  password: string
  name: string
}

export function buildDatabaseUrl(db: DbConfig): string {
  const user = encodeURIComponent(db.user)
  const password = encodeURIComponent(db.password)
  return `postgresql://${user}:${password}@${db.host}:${db.port}/${db.name}`
}

export function parseDatabaseUrl(value: string): DbConfig {
  const url = new URL(value)
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('The database URL must start with postgresql:// or postgres://')
  }
  const name = decodeURIComponent(url.pathname.slice(1))
  if (!name) throw new Error('The database URL has no database name.')
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    name,
  }
}

/** Turns a project name into a safe Postgres database name. */
export function databaseNameFor(projectName: string): string {
  return projectName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'payload_site'
}

/** Creates the database if it does not exist. Returns true if it created one. */
export async function createDatabase(db: DbConfig): Promise<boolean> {
  const client = new pg.Client({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: 'postgres',
  })
  await client.connect()
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db.name])
    if (found.rowCount) return false
    await client.query(`CREATE DATABASE "${db.name.replaceAll('"', '""')}"`)
    return true
  } finally {
    await client.end()
  }
}

import { Client } from 'pg'

export type DbConfig = {
  host: string
  port: number
  user: string
  password: string
  name: string
}

export type DbState = 'missing' | 'exists'

export function buildDatabaseUrl(db: DbConfig): string {
  const user = encodeURIComponent(db.user)
  const password = encodeURIComponent(db.password)
  return `postgresql://${user}:${password}@${db.host}:${db.port}/${db.name}`
}

export function parseDatabaseUrl(value: string): DbConfig {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new Error('The database URL is not valid. Use postgresql://USER:PASSWORD@HOST:PORT/DATABASE', { cause: error })
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('The database URL must start with postgresql:// or postgres://')
  }
  const name = decodeURIComponent(url.pathname.slice(1))
  if (!name) throw new Error('The database URL has no database name.')
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username) || 'postgres',
    password: decodeURIComponent(url.password),
    name,
  }
}

/** Turns a project name into a safe Postgres database name. */
export function databaseNameFor(projectName: string): string {
  return projectName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'payload_site'
}

/** Turns a driver error into a short message that says what to do. Never includes the password. */
export function describeDbError(error: unknown, db: DbConfig): string {
  const code = (error as { code?: string })?.code
  const raw = error instanceof Error ? error.message : String(error)
  const where = `${db.host}:${db.port}`
  switch (code) {
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return `Cannot reach Postgres at ${where}. Start the server, or set --db-host and --db-port (or --db-url). Use --skip-db to continue without a database.`
    case 'ENOTFOUND':
      return `The Postgres host "${db.host}" was not found. Check --db-host (or --db-url).`
    case '28P01':
    case '28000':
      return `Postgres at ${where} rejected the login for user "${db.user}". Check --db-user and --db-password (or --db-url).`
    case '42501':
      return `User "${db.user}" is not allowed to create databases. Use a user that can, or create "${db.name}" yourself and pass --reuse-db.`
    default:
      return `Postgres error at ${where}: ${raw}`
  }
}

function connect(db: DbConfig, database: string): Client {
  return new Client({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database,
    connectionTimeoutMillis: 8000,
  })
}

/** Connects to the server and says if the database exists. Throws a clear error when it cannot connect. */
export async function checkDatabase(db: DbConfig): Promise<DbState> {
  const client = connect(db, db.name)
  client.on('error', () => {})
  try {
    await client.connect()
    return 'exists'
  } catch (error) {
    // 3D000: the server is fine, the database does not exist.
    if ((error as { code?: string }).code === '3D000') return 'missing'
    throw new Error(describeDbError(error, db), { cause: error })
  } finally {
    await client.end().catch(() => {})
  }
}

/** Creates the database. */
export async function createDatabase(db: DbConfig): Promise<void> {
  const client = connect(db, 'postgres')
  client.on('error', () => {})
  try {
    await client.connect()
    await client.query(`CREATE DATABASE "${db.name.replaceAll('"', '""')}"`)
  } catch (error) {
    throw new Error(describeDbError(error, db), { cause: error })
  } finally {
    await client.end().catch(() => {})
  }
}

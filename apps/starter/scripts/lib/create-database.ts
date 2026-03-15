import { Client } from 'pg'

type DatabaseConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export async function createDatabase(config: DatabaseConfig): Promise<void> {
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres', // Connect to default DB first
  })

  try {
    await client.connect()

    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [config.database],
    )

    if (result.rowCount === 0) {
      // Quote database name to handle hyphens and special characters
      await client.query(`CREATE DATABASE "${config.database}"`)
      console.log(`Database "${config.database}" created successfully.`)
    } else {
      console.log(`Database "${config.database}" already exists, skipping creation.`)
    }
  } finally {
    await client.end()
  }
}

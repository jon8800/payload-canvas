import { getPayload } from 'payload'
import config from '@payload-config'

async function main() {
  const args = process.argv.slice(2)

  let email = ''
  let password = ''

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      email = arg.replace('--email=', '').replace(/^"|"$/g, '')
    }
    if (arg.startsWith('--password=')) {
      password = arg.replace('--password=', '').replace(/^"|"$/g, '')
    }
  }

  if (!email || !password) {
    console.error('Usage: payload run scripts/create-admin.ts -- --email="admin@example.com" --password="password"')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  // Check if any users exist
  const existing = await payload.find({
    collection: 'users',
    limit: 1,
  })

  if (existing.totalDocs > 0) {
    console.log('Admin user already exists. Skipping creation.')
    process.exit(0)
  }

  await payload.create({
    collection: 'users',
    data: {
      email,
      password,
    },
  })

  console.log(`Admin user created: ${email}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Failed to create admin user:', err)
  process.exit(1)
})

import { getPayload } from 'payload'
import config from '@payload-config'
const payload = await getPayload({ config })
const email = 'builder-dev@local.test'
await payload.delete({ collection: 'users', where: { email: { equals: email } } })
if (process.argv[2] !== 'delete') await payload.create({ collection: 'users', data: { email, password: 'builder-dev-pass' } as any })
console.log('DONE')
process.exit(0)

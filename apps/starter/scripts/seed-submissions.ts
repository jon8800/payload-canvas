// Adds example form submissions for the demo: 12 for the Contact form, 4 for every other form.
// Dates spread over the past 3 weeks, some read and some new, each with the page it came from,
// short and long messages, and one with a file (a copy of a media library file in Form files). The answers follow each
// form's own fields. Runs once: when example submissions exist (answers at @example.net), it stops.
// No emails go out. Run with `pnpm seed:submissions`.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

/** Example answers use this email domain, so the seed finds its own submissions. */
const EXAMPLE_DOMAIN = '@example.net'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const CONTACT_FORM_TITLE = 'Contact form'
const DAY = 24 * 60 * 60 * 1000

type FormField = { blockType: string; name?: string | null; required?: boolean | null; options?: Array<{ value: string }> | null; defaultValue?: unknown }
type Person = { name: string; email: string; phone: string; company: string; website?: string; message: string }

const PEOPLE: Person[] = [
  { name: 'Maya Chen', email: 'maya.chen', phone: '+1 415 555 0142', company: 'Fernhill Bakery', website: 'https://fernhill.example', message: 'Hi! We need a new site before our second shop opens in March. Can you send a rough quote?' },
  { name: 'Tom Okafor', email: 'tom.okafor', phone: '+44 20 7946 0321', company: 'Okafor Legal', message: 'Quick question: do you also host the site, or do we need our own server?' },
  {
    name: 'Lena Fischer',
    email: 'lena.fischer',
    phone: '+49 30 901820',
    company: 'Studio Fischer',
    website: 'studiofischer.example',
    message:
      'Hello Northwind team,\n\nwe are a small architecture studio in Berlin. Our current site is six years old, hard to update and looks bad on phones. We would like a redesign with a project gallery, a team page and a simple way to post news.\n\nThe content is mostly ready. Our budget is flexible for the right partner. Could we book a call next week? Tuesday or Thursday afternoon works best for us.\n\nThanks,\nLena',
  },
  { name: 'Carlos Ruiz', email: 'carlos.ruiz', phone: '+34 912 345 678', company: 'Ruiz Coffee Roasters', message: 'Love your work on the Harbor site. We want something similar for our online shop.' },
  { name: 'Priya Natarajan', email: 'priya.n', phone: '+1 646 555 0187', company: 'Brightpath Tutoring', website: 'https://brightpath.example', message: 'Our booking form stopped working after a plugin update. Can you fix it this week?' },
  { name: 'Jonas Berg', email: 'jonas.berg', phone: '+46 8 123 456 78', company: 'Berg & Co', message: 'Thanks for the call yesterday. Sending the brief as discussed — see the attachment.' },
  { name: 'Aisha Mensah', email: 'aisha.mensah', phone: '+233 30 277 0000', company: 'Mensah Foundation', message: 'We are a charity and need a donation page that works with our payment provider. Is that something you do?' },
  { name: 'Oliver Grant', email: 'oliver.grant', phone: '+61 2 9876 5432', company: 'Grant Physio', message: 'Hi, just checking you got my last message?' },
  {
    name: 'Sofia Rossi',
    email: 'sofia.rossi',
    phone: '+39 06 1234 5678',
    company: 'Trattoria Rossi',
    website: 'https://trattoriarossi.example',
    message:
      'Buongiorno! We run a family restaurant and want a site with our menu, opening hours and table bookings. The menu changes every season, so we need to edit it ourselves.\n\nAlso: can the site show the menu in Italian and English?',
  },
  { name: 'Ben Walker', email: 'ben.walker', phone: '+1 312 555 0110', company: 'Walker Builds', message: 'Need a one-page site for a new product launch. Tight deadline: 3 weeks.' },
  { name: 'Hana Sato', email: 'hana.sato', phone: '+81 3 1234 5678', company: 'Sato Design', website: 'https://sato.example', message: 'Are you open to a partnership? We do branding, you do the websites.' },
  { name: 'Liam O’Brien', email: 'liam.obrien', phone: '+353 1 234 5678', company: 'O’Brien Pubs', message: 'Can you add an events calendar to our existing site?' },
]

/** Days ago for each example (fractions are hours), newest first. The first four and the ninth are new. */
const DAYS_AGO = [0.08, 0.35, 0.9, 1.6, 2.4, 3.2, 5.1, 6.7, 8.3, 11.5, 15.2, 20.4]
const UNREAD = new Set([0, 1, 2, 3, 8])
const PAGES = ['/contact', '/contact', '/services', '/', '/contact?utm_source=newsletter', '/about', '/blog', '/contact']
const COUNTRIES = ['US', 'GB', 'DE', 'ES', 'US', 'SE']
const STATES = ['CA', 'NY', 'TX', 'WA']

/** The answer of one field for one person, or null for none. Optional fields stay empty now and then. */
function answer(field: FormField, person: Person, index: number, createdAt: Date): string | null {
  const name = (field.name ?? '').toLowerCase()
  const optional = !field.required
  const skip = optional && index % 3 === 2
  switch (field.blockType) {
    case 'email':
      return `${person.email}${EXAMPLE_DOMAIN}`
    case 'textarea':
      return person.message
    case 'phone':
      return skip ? null : person.phone
    case 'url':
      return person.website ?? null
    case 'number':
      return skip ? null : String([2, 5, 10, 3, 8][index % 5])
    case 'select':
    case 'radio': {
      const options = field.options ?? []
      return options.length > 0 && !(optional && index % 4 === 3) ? options[index % options.length].value : null
    }
    case 'checkbox':
      return String(index % 2 === 0)
    case 'consent':
      return 'true'
    case 'country':
      return COUNTRIES[index % COUNTRIES.length]
    case 'state':
      return STATES[index % STATES.length]
    case 'date':
      return skip ? null : new Date(createdAt.getTime() + (14 + index) * DAY).toISOString().slice(0, 10)
    case 'hidden':
      return typeof field.defaultValue === 'string' && field.defaultValue ? field.defaultValue : null
    case 'text':
      if (name.includes('name')) return person.name
      if (name.includes('company') || name.includes('business')) return person.company
      return skip ? null : person.company
    default:
      return null
  }
}

/**
 * A file for the example with an attachment: a copy of a media library file (a PDF if there is one,
 * else an image) in the private Form files collection, where visitors' files go.
 */
async function exampleFile(payload: Payload): Promise<{ id: number | string; filename?: string | null } | null> {
  for (const mimeType of ['application/pdf', 'image/']) {
    const found = await payload.find({ collection: 'media', where: { mimeType: { like: mimeType } }, limit: 1, depth: 0, sort: '-createdAt', overrideAccess: true })
    const media = found.docs[0] as { filename?: string | null; mimeType?: string | null } | undefined
    if (!media?.filename) continue
    const source = path.resolve(dirname, '../public/media', media.filename)
    if (!fs.existsSync(source)) continue
    const data = fs.readFileSync(source)
    const file = { name: media.filename, data, mimetype: media.mimeType ?? 'application/octet-stream', size: data.length }
    return (await payload.create({ collection: 'form-files', data: { alt: media.filename }, file, overrideAccess: true })) as { id: number | string; filename?: string | null }
  }
  return null
}

try {
  const payload = await getPayload({ config })
  const existing = await payload.find({ collection: 'form-submissions', where: { 'submissionData.value': { like: EXAMPLE_DOMAIN } }, limit: 1, depth: 0, overrideAccess: true })
  if (existing.totalDocs > 0) {
    payload.logger.info('Example submissions exist already. Nothing to do.')
    process.exit(0)
  }
  // The form-builder plugin emails every new submission. Examples send nothing.
  payload.sendEmail = async () => undefined

  const forms = await payload.find({ collection: 'forms', limit: 100, depth: 0, sort: 'id', overrideAccess: true })
  const file = await exampleFile(payload)
  const base = (payload.config.serverURL || 'http://localhost:3000').replace(/\/$/, '')
  const now = Date.now()
  let created = 0
  for (const form of forms.docs as Array<{ id: number | string; title?: string; fields?: FormField[] | null }>) {
    const fields = (form.fields ?? []).filter((field) => field.name && field.blockType !== 'file' && field.blockType !== 'message')
    if (fields.length === 0) continue
    const count = form.title === CONTACT_FORM_TITLE ? PEOPLE.length : 4
    for (let index = 0; index < count; index++) {
      const person = PEOPLE[index]
      const createdAt = new Date(now - DAYS_AGO[index] * DAY)
      const submissionData = fields.flatMap((field) => {
        const value = answer(field, person, index, createdAt)
        return value === null ? [] : [{ field: field.name as string, value }]
      })
      const doc = await payload.create({
        collection: 'form-submissions',
        data: {
          form: form.id,
          submissionData,
          createdAt: createdAt.toISOString(),
          sourceUrl: `${base}${PAGES[index % PAGES.length]}`,
          ...(UNREAD.has(index) ? {} : { readAt: new Date(createdAt.getTime() + (2 + (index % 5)) * 60 * 60 * 1000).toISOString() }),
        } as never,
        overrideAccess: true,
      })
      // Jonas sends the brief: the one example with a file. `formFileUploads` drops links on create
      // (visitors never link existing files), so the file is linked after.
      if (index === 5 && file) await payload.update({ collection: 'form-submissions', id: doc.id, data: { attachments: [file.id] } as never, overrideAccess: true })
      created++
    }
  }
  payload.logger.info(`Created ${created} example submissions${file ? ` (one with the file ${file.filename ?? file.id})` : ''}.`)
  process.exit(0)
} catch (error) {
  console.error('Seeding submissions failed:', error)
  process.exit(1)
}

import type { CollectionConfig } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { authenticated } from '../access/authenticated'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Files visitors send with a form (file fields). Private: only signed-in users can open them.
 * The files live in `uploads/form-files`, outside `public/`, so Next never serves them; Payload
 * serves them at /api/form-files/file/<name> after the read check. Only the submission hook
 * (`formFileUploads`, payload.config.ts) creates them.
 */
export const FormFiles: CollectionConfig = {
  slug: 'form-files',
  labels: { singular: 'Form file', plural: 'Form files' },
  admin: {
    group: 'Forms',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'mimeType', 'filesize', 'createdAt'],
    description: 'Files visitors sent with a form. Only signed-in users can open them.',
  },
  access: {
    create: () => false,
    read: authenticated,
    update: () => false,
    delete: authenticated,
  },
  fields: [{ name: 'alt', type: 'text', label: 'Original name', admin: { readOnly: true } }],
  upload: {
    staticDir: path.resolve(dirname, '../../uploads/form-files'),
    // Every file downloads, and the browser never guesses another type: a file never runs as a
    // page on the site's own address (the form field already refuses HTML, SVG and scripts).
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Content-Disposition', 'attachment')
      headers.set('X-Content-Type-Options', 'nosniff')
      return headers
    },
  },
}

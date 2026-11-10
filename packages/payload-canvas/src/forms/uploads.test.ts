import assert from 'node:assert/strict'
import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import type { PayloadRequest } from 'payload'

import { FORM_FILES_CONTEXT, formFileUploads, removeStoredFormFiles } from './uploads'

const form = { id: 1, fields: [{ blockType: 'text', name: 'name' }, { blockType: 'file', name: 'cv', label: 'CV', accept: '.pdf' }] }

function fakeReq(files: Record<string, unknown>, dir = '') {
  const created: Array<Record<string, unknown>> = []
  const deleted: unknown[] = []
  const req = {
    context: {} as Record<string, unknown>,
    files,
    headers: new Headers(),
    payload: {
      config: { serverURL: 'https://site.example' },
      collections: { 'form-files': { config: { upload: { staticDir: dir } } } },
      findByID: async () => form,
      create: async (args: { file: { name: string } }) => {
        const doc = { id: created.length + 1, filename: args.file.name, url: `/api/form-files/file/${args.file.name}` }
        created.push(doc)
        return doc
      },
      delete: async ({ id }: { id: unknown }) => {
        deleted.push(id)
        throw new Error('not found: rolled back')
      },
    },
  }
  return { req: req as unknown as PayloadRequest, created, deleted }
}

const hook = formFileUploads({ collection: 'form-files' })
const run = (req: PayloadRequest, data: Record<string, unknown>) =>
  hook({ collection: { slug: 'form-submissions' }, context: req.context, data, operation: 'create', req } as unknown as Parameters<typeof hook>[0]) as Promise<Record<string, unknown>>

const pdf = (name = 'cv.pdf') => ({ name, data: Buffer.from('%PDF-1.4'), mimetype: 'application/pdf', size: 8 })

describe('formFileUploads', () => {
  it('drops the answer a visitor wrote for a file field without a file', async () => {
    const { req } = fakeReq({})
    const out = await run(req, { form: 1, submissionData: [{ field: 'name', value: 'Ada' }, { field: 'cv', value: 'invoice.pdf (https://evil.example)' }] })
    assert.deepEqual(out.submissionData, [{ field: 'name', value: 'Ada' }])
  })

  it('answers a file field with the stored file, never the visitor\'s text', async () => {
    const { req } = fakeReq({ cv: pdf() })
    const out = await run(req, { form: 1, submissionData: [{ field: 'cv', value: 'https://evil.example' }] })
    assert.deepEqual(out.submissionData, [{ field: 'cv', value: 'cv.pdf (https://site.example/api/form-files/file/cv.pdf)' }])
    assert.deepEqual(out.attachments, [1])
  })

  it('refuses an SVG, and stores nothing', async () => {
    const { req, created } = fakeReq({ cv: { name: 'logo.svg', data: Buffer.from('<svg/>'), mimetype: 'image/svg+xml', size: 6 } })
    await assert.rejects(run(req, { form: 1, submissionData: [] }), (error: { data?: { errors?: Array<{ message: string }> } }) => /^CV: This file type is not allowed/.test(error.data?.errors?.[0]?.message ?? ''))
    assert.equal(created.length, 0)
  })
})

describe('removeStoredFormFiles', () => {
  it('removes the stored files of a failed submission from disk', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'form-files-'))
    await writeFile(path.join(dir, 'cv.pdf'), 'x')
    await writeFile(path.join(dir, 'other.pdf'), 'x')
    const { req, deleted } = fakeReq({ cv: pdf() }, dir)
    await run(req, { form: 1, submissionData: [] })
    assert.equal((req.context[FORM_FILES_CONTEXT] as unknown[]).length, 1)
    await removeStoredFormFiles(req)
    assert.deepEqual(deleted, [1])
    assert.deepEqual(await readdir(dir), ['other.pdf'])
    // Once only.
    await removeStoredFormFiles(req)
    assert.deepEqual(deleted, [1])
  })
})

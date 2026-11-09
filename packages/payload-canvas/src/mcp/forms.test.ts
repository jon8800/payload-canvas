import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Block as PayloadBlockConfig, Field, PayloadRequest } from 'payload'
import { z } from 'zod'

import { formSystemPrompt } from '../ai/prompt'
import { runTool, toolDefinitions, Workspace, type ToolEnv } from '../ai/tools'
import { payloadBlocksStorage } from '../core/payloadBlocks'
import type { Layout } from '../core/types'
import { formFieldBlocks } from '../forms/blocks'
import { withFormConditions } from '../forms/conditions'
import { BUILDER_CONFIG_KEY } from '../live/document'
import { LIVE_RUNTIME_KEY, type LiveRuntime } from '../live/runtime'
import { createSessionManager } from '../live/session'
import { builderMcpTools, type BuilderMcpTool } from './index'

const base: Field[] = [
  { name: 'name', type: 'text', required: true },
  { name: 'label', type: 'text' },
  { name: 'required', type: 'checkbox' },
]
const configs: PayloadBlockConfig[] = [
  withFormConditions({ slug: 'text', fields: base }),
  withFormConditions({ slug: 'email', fields: base }),
  withFormConditions({ slug: 'select', fields: [...base, { name: 'options', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'value', type: 'text' }] }] }),
]
const definitions = formFieldBlocks(configs)
const storage = payloadBlocksStorage(['text', 'email', 'select'], definitions, '"forms.fields"')

const tools = builderMcpTools({ blocks: [], collections: { pages: { field: 'layout' } }, forms: true, classes: false })
const tool = (name: string): BuilderMcpTool => {
  const found = tools.find((t) => t.name === name)
  if (!found) throw new Error(`No tool ${name}`)
  return found
}
const json = (result: { content: { text: string }[] }) => JSON.parse(result.content[0]!.text) as Record<string, unknown>

/** A fake request with one form and the plugin's server config of the forms collection. */
function fakeRequest(options: { formsOn?: boolean } = {}) {
  const runtime: LiveRuntime = { sessions: createSessionManager({ persistDebounceMs: 5 }), canUpdate: async () => true }
  const doc = {
    id: 9,
    title: 'Contact',
    submitButtonLabel: 'Send',
    updatedAt: 't0',
    fields: [
      { id: 'r1', blockType: 'text', name: 'name', label: 'Name', required: true },
      { id: 'r2', blockType: 'email', name: 'email', label: 'Email', conditions: { match: 'all', rules: [{ id: 'x', field: 'name', operator: 'isNotEmpty' }] } },
    ],
  }
  const payload = {
    collections: { forms: { config: { fields: [{ name: 'title', type: 'text' }, { name: 'fields', type: 'blocks', blocks: configs }] } } },
    config: {
      serverURL: 'http://site.test',
      routes: { admin: '/admin' },
      custom: {
        [LIVE_RUNTIME_KEY]: runtime,
        ...(options.formsOn === false
          ? {}
          : { [BUILDER_CONFIG_KEY]: { collections: { forms: { field: 'fields', payloadBlocks: storage, regions: [{ name: 'settings', label: 'Form settings', panel: true, fields: [{ path: 'title' }, { path: 'submitButtonLabel' }] }] } }, templates: null } }),
      },
    },
    async find(a: Record<string, unknown>) {
      assert.equal(a.collection, 'forms')
      assert.equal(a.overrideAccess, false)
      return { docs: [structuredClone(doc)], totalDocs: 1 }
    },
    async findByID(a: Record<string, unknown>) {
      if (String(a.id) !== '9') throw Object.assign(new Error('Not Found'), { status: 404 })
      return structuredClone(doc)
    },
  }
  return { req: { payload, user: { id: 1 }, url: 'http://site.test/api/mcp' } as unknown as PayloadRequest }
}

describe('form MCP tools', () => {
  it('adds the form tools with collection routing on the forms collection', () => {
    const names = tools.map((t) => `${t.name}:${t.routing.action}`)
    for (const name of ['listForms:read', 'getForm:read', 'createForm:create', 'editFormFields:update', 'updateFormSettings:update']) assert.ok(names.includes(name), name)
    assert.equal(builderMcpTools({ blocks: [], collections: { pages: {} }, classes: false }).some((t) => t.name === 'listForms'), false)
    // The collection argument defaults to the forms collection.
    assert.deepEqual(z.object(tool('getForm').parameters).parse({ id: '9' }), { collection: 'forms', id: '9' })
    assert.equal(z.object(tool('getForm').parameters).safeParse({ collection: 'pages', id: '9' }).success, false)
  })

  it('explains the field types and the condition format in the edit tool', () => {
    const description = tool('editFormFields').description
    for (const word of ['email', 'textarea', 'select', 'checkbox', 'message', 'options', 'notEquals', 'isNotEmpty', 'match "all"', 'setConditions']) {
      assert.ok(description.includes(word), word)
    }
    assert.match(tool('updateFormSettings').description, /confirmationType: "message"/)
    const parsed = z.object(tool('editFormFields').parameters).safeParse({ id: '9', changes: [{ action: 'add', type: 'email', values: { label: 'Email' } }] })
    assert.ok(parsed.success)
  })

  it('lists forms with their field names and editor links', async () => {
    const { req } = fakeRequest()
    const out = json(await tool('listForms').handler({ collection: 'forms' }, req, {}))
    assert.deepEqual(out.forms, [{ id: 9, title: 'Contact', fields: ['name', 'email'], updatedAt: 't0', editorUrl: 'http://site.test/admin/builder/forms/9' }])
  })

  it('reads a form: fields with conditions in words, settings, field types and the guide', async () => {
    const { req } = fakeRequest()
    const out = json(await tool('getForm').handler({ collection: 'forms', id: '9' }, req, {}))
    const fields = out.fields as Array<Record<string, unknown>>
    assert.deepEqual(fields.map((f) => [f.id, f.type, f.name]), [['r1', 'text', 'name'], ['r2', 'email', 'email']])
    assert.equal(fields[1]!.shows, 'Shows when Name is not empty')
    assert.deepEqual(out.settings, { title: 'Contact', submitButtonLabel: 'Send' })
    assert.deepEqual((out.fieldTypes as Array<{ type: string }>).map((t) => t.type), ['text', 'email', 'select'])
    assert.match(String(out.guide), /DISPLAY CONDITIONS/)
  })

  it('says so when the form builder is off', async () => {
    const { req } = fakeRequest({ formsOn: false })
    const result = await tool('getForm').handler({ collection: 'forms', id: '9' }, req, {})
    assert.equal(result.isError, true)
    assert.match(result.content[0]!.text, /form builder is off/)
  })
})

describe('the assistant in the form builder', () => {
  const env: ToolEnv = { blocks: definitions, sections: [], bindingSources: null, searchMedia: async () => [], form: true }
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 'r1', type: 'formText', props: { name: 'name', label: 'Name' } },
      { id: 'r2', type: 'formSelect', props: { name: 'topic', label: 'Topic', options: [{ label: 'Sales', value: 'sales' }] } },
    ],
  }

  it('has the form tools and a form prompt', () => {
    assert.deepEqual(toolDefinitions(env).map((t) => t.name), ['getForm', 'getBlockSchema', 'editFormFields'])
    const prompt = formSystemPrompt({ blocks: definitions })
    assert.match(prompt, /form builder/)
    assert.match(prompt, /"type":"email"/)
    assert.doesNotMatch(prompt, /insertSection/)
  })

  it('edits fields in the workspace and returns the operations for the editor', async () => {
    const workspace = new Workspace(layout, definitions)
    const outcome = await runTool(
      'editFormFields',
      {
        changes: [
          { action: 'add', type: 'email', values: { label: 'Email', required: true }, index: 1 },
          { action: 'setConditions', field: 'topic', conditions: { rules: [{ field: 'email', operator: 'isNotEmpty' }] } },
        ],
      },
      workspace,
      env,
    )
    assert.equal(outcome.ok, true, outcome.content)
    assert.equal(outcome.summary, 'Added 1 field, updated 1 field')
    assert.deepEqual(outcome.ops?.map((op) => op.type), ['insert', 'update'])
    assert.deepEqual(workspace.layout.blocks.map((b) => b.props?.name), ['name', 'email', 'topic'])
    const read = JSON.parse((await runTool('getForm', {}, workspace, env)).content) as { fields: Array<{ name: string; shows?: string }> }
    assert.equal(read.fields[2]!.shows, 'Shows when Email is not empty')
  })

  it('refuses a bad change and leaves the form as it was', async () => {
    const workspace = new Workspace(layout, definitions)
    const outcome = await runTool('editFormFields', { changes: [{ action: 'add', type: 'text', values: { name: 'topic' } }] }, workspace, env)
    assert.equal(outcome.ok, false)
    assert.match(JSON.parse(outcome.content).error, /already named "topic"/)
    assert.equal(workspace.layout, layout)
  })
})

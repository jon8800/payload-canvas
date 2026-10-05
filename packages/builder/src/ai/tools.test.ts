import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout, SectionDefinition } from '../core/types'
import { CONTEXT_SAVED_SECTIONS, contextText, systemPrompt } from './prompt'
import { openAiTools, runTool, toolDefinitions, Workspace, type ToolEnv } from './tools'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text', required: true }] },
]

const hero: SectionDefinition = {
  id: 'hero',
  label: 'Hero',
  category: 'Heroes',
  blocks: [{ id: 'sec', type: 'stack', slots: { children: [{ id: 'title', type: 'heading', props: { text: 'Welcome' } }] } }],
}

const team: SectionDefinition = {
  id: 'saved:12',
  label: 'Team intro',
  category: 'Team',
  savedId: 12,
  blocks: [{ id: 's1', type: 'stack', slots: { children: [{ id: 's2', type: 'heading', props: { text: 'Our team' } }] } }],
}

const env = (overrides: Partial<ToolEnv> = {}): ToolEnv => ({
  blocks,
  sections: [hero],
  bindingSources: null,
  searchMedia: async () => [],
  ...overrides,
})

type Schema = { properties: Record<string, Record<string, unknown>> }
const schemaOf = (tools: ReturnType<typeof toolDefinitions>, name: string) =>
  tools.find((t) => t.name === name)?.input_schema as unknown as Schema | undefined

const emptyLayout = (): Layout => ({ version: 1, blocks: [] })

describe('section tool definitions', () => {
  it('use enums for built-in sections only', () => {
    const tools = toolDefinitions(env())
    assert.deepEqual(schemaOf(tools, 'insertSection')?.properties.sectionId.enum, ['hero'])
    assert.deepEqual(schemaOf(tools, 'listSections')?.properties.category.enum, ['Heroes'])
  })

  it('take any id, saved id or name when saved sections are on', () => {
    const tools = toolDefinitions(env({ savedSections: true }))
    const sectionId = schemaOf(tools, 'insertSection')?.properties.sectionId
    assert.equal(sectionId?.type, 'string')
    assert.equal('enum' in (sectionId ?? {}), false)
    assert.match(String(sectionId?.description), /saved:<id>/)
    assert.equal('enum' in (schemaOf(tools, 'listSections')?.properties.category ?? {}), false)
    // Strict mode stays valid: every object closes its properties.
    for (const name of ['listSections', 'insertSection']) {
      const tool = tools.find((t) => t.name === name) as unknown as { strict?: boolean; input_schema: { additionalProperties?: boolean } }
      assert.equal(tool.strict, true)
      assert.equal(tool.input_schema.additionalProperties, false)
    }
    const openAi = openAiTools(env({ savedSections: true })).find((t) => t.function.name === 'insertSection')
    assert.ok(openAi)
    const properties = openAi.function.parameters.properties as Record<string, Record<string, unknown>>
    assert.equal('enum' in properties.sectionId, false)
  })

  it('exist without built-in sections only when saved sections are on', () => {
    assert.equal(schemaOf(toolDefinitions(env({ sections: [] })), 'insertSection'), undefined)
    const names = toolDefinitions(env({ sections: [], savedSections: true })).map((t) => t.name)
    assert.ok(names.includes('listSections') && names.includes('insertSection'))
  })
})

describe('section tools with saved sections', () => {
  const withSaved = env({ sections: [hero, team], savedSections: true })

  it('listSections marks saved sections', async () => {
    const outcome = await runTool('listSections', {}, new Workspace(emptyLayout(), blocks), withSaved)
    assert.deepEqual(JSON.parse(outcome.content), [
      { id: 'hero', label: 'Hero', category: 'Heroes' },
      { id: 'saved:12', label: 'Team intro', saved: true, category: 'Team' },
    ])
    const filtered = await runTool('listSections', { category: 'Team' }, new Workspace(emptyLayout(), blocks), withSaved)
    assert.deepEqual((JSON.parse(filtered.content) as Array<{ id: string }>).map((s) => s.id), ['saved:12'])
  })

  for (const ref of ['saved:12', '12', 'team intro']) {
    it(`insertSection inserts a saved section by "${ref}"`, async () => {
      const workspace = new Workspace(emptyLayout(), blocks)
      const outcome = await runTool('insertSection', { sectionId: ref }, workspace, withSaved)
      assert.equal(outcome.ok, true)
      assert.equal(outcome.summary, 'Inserted Team intro')
      const body = JSON.parse(outcome.content) as { section: string; inserted: Array<{ id: string }> }
      assert.equal(body.section, 'saved:12')
      assert.notEqual(body.inserted[0].id, 's1')
      const heading = workspace.layout.blocks[0].slots?.children?.[0]
      assert.equal(heading && findBlock(workspace.layout, heading.id)?.props?.text, 'Our team')
    })
  }

  it('insertSection lists the known sections for an unknown id', async () => {
    const outcome = await runTool('insertSection', { sectionId: 'saved:99' }, new Workspace(emptyLayout(), blocks), withSaved)
    assert.equal(outcome.ok, false)
    assert.deepEqual(JSON.parse(outcome.content), {
      error: 'Unknown section "saved:99"',
      details: { known: ['hero', 'saved:12 (Team intro)'] },
    })
  })
})

describe('saved sections in the prompts', () => {
  const base = { collection: 'pages', id: 'p1', layout: emptyLayout(), breakpoints: [] }

  it('lists saved sections in the context message', () => {
    const text = contextText({ ...base, savedSections: [team] })
    assert.match(text, /Saved sections \(made by people on this site\)\. Insert with insertSection \{ sectionId \}:/)
    assert.match(text, /^- saved:12: Team intro \(Team\): stack, heading "Our team"$/m)
    // Before the layout, inside the context block.
    assert.ok(text.indexOf('saved:12') < text.indexOf('Current layout'))
  })

  it('adds nothing without saved sections', () => {
    assert.doesNotMatch(contextText({ ...base, savedSections: [] }), /Saved sections/)
    assert.doesNotMatch(contextText(base), /Saved sections/)
  })

  it(`lists at most ${CONTEXT_SAVED_SECTIONS} saved sections`, () => {
    const many = Array.from({ length: CONTEXT_SAVED_SECTIONS + 5 }, (_, i) => ({ ...team, id: `saved:${i}`, savedId: i }))
    const text = contextText({ ...base, savedSections: many })
    assert.equal(text.match(/^- saved:\d+:/gm)?.length, CONTEXT_SAVED_SECTIONS)
    assert.match(text, /and 5 more\. listSections lists them all\./)
  })

  it('keeps saved sections out of the system prompt', () => {
    const on = systemPrompt({ blocks, sections: [hero], tokens: null, bindings: false, savedSections: true })
    assert.match(on, /<editor_context> lists them/)
    assert.doesNotMatch(on, /Team intro/)
    const off = systemPrompt({ blocks, sections: [hero], tokens: null, bindings: false })
    assert.doesNotMatch(off, /saved:<id>/)
  })
})

describe('Workspace in a locale', () => {
  const localized: BlockDefinition[] = [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text', required: true, localized: true }] }]
  const settings = { locales: ['en', 'de'], defaultLocale: 'en', fallback: true }

  it('shows the locale view and writes prop updates to that locale', () => {
    const workspace = new Workspace({ version: 1, blocks: [{ id: 'h', type: 'heading', props: { text: 'Hello' } }] }, localized, { localization: settings, locale: 'de' })
    assert.equal(workspace.untranslatedCount(), 1)
    const result = workspace.apply([{ type: 'update', id: 'h', props: { text: 'Hallo' } }])
    assert.ok(result.ok)
    assert.deepEqual(result.ops, [{ type: 'update', id: 'h', locale: 'de', props: { text: 'Hallo' } }])
    assert.deepEqual(workspace.layout.blocks[0], { id: 'h', type: 'heading', props: { text: 'Hello' }, locales: { de: { text: 'Hallo' } } })
    assert.equal(workspace.view.blocks[0].props?.text, 'Hallo')
    assert.equal(workspace.untranslatedCount(), 0)
  })
})

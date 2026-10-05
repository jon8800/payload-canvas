import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout, SectionDefinition } from '../core/types'
import { chatTools } from './openai-format'
import { CONTEXT_SAVED_SECTIONS, contextText, systemPrompt } from './prompt'
import { repairMotion, repairOperations, runTool, toolDefinitions, Workspace, type ToolEnv } from './tools'

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
  tools.find((t) => t.name === name)?.inputSchema as unknown as Schema | undefined

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
      const tool = tools.find((t) => t.name === name)
      assert.equal(tool?.strict, true)
      assert.equal(tool?.inputSchema.additionalProperties, false)
    }
    const openAi = chatTools(toolDefinitions(env({ savedSections: true }))).find((t) => t.function.name === 'insertSection')
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

  it('insertSection and applyOperations take "__PAGE_ROOT__" as the page root', async () => {
    const workspace = new Workspace(emptyLayout(), blocks)
    const section = await runTool('insertSection', { sectionId: 'hero', parentId: '__PAGE_ROOT__' }, workspace, withSaved)
    assert.equal(section.ok, true, section.content)
    const insert = await runTool(
      'applyOperations',
      { operations: [{ type: 'insert', block: { type: 'heading', props: { text: 'Hi' } }, to: { parentId: '__PAGE_ROOT__', index: 1 } }] },
      workspace,
      withSaved,
    )
    assert.equal(insert.ok, true, insert.content)
    assert.equal(workspace.layout.blocks.length, 2)
  })

  it('applyOperations keeps a real block called "page" as a parent', () => {
    const repaired = repairOperations(
      { operations: [{ type: 'insert', block: { type: 'heading' }, to: { parentId: 'page', index: 0 } }] },
      (id) => id === 'page',
    )
    assert.ok(typeof repaired !== 'string')
    assert.equal((repaired.ops[0] as { to: { parentId: unknown } }).to.parentId, 'page')
  })

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

const withHeading = (): Workspace => new Workspace({ version: 1, blocks: [{ id: 'h', type: 'heading', props: { text: 'Hi' } }] }, blocks)
const repair = (input: Record<string, unknown>): { ops: unknown[]; notes: string[] } => {
  const repaired = repairOperations(input)
  assert.ok(typeof repaired !== 'string')
  return repaired
}

describe('motion in the assistant tools', () => {
  it('the tool schemas name motion and the presets, and stay compact', () => {
    const tools = toolDefinitions(env())
    const apply = tools.find((t) => t.name === 'applyOperations')
    assert.ok(apply)
    assert.match(apply.description, /motion\?/)
    const text = JSON.stringify(apply.inputSchema)
    assert.match(text, /fade-up/)
    assert.match(text, /parallax/)
    // The full motion schema is not pasted into the tool.
    assert.doesNotMatch(text, /Pixels the fade-up/)
    assert.match(JSON.stringify(apply.simpleInputSchema), /"motion":\{"type":\["object","null"\]/)
  })

  it('wraps a bare kind and a preset name', () => {
    const bare = repairMotion({ preset: 'fade-up', duration: 500 })
    assert.deepEqual(bare.value, { enter: { preset: 'fade-up', duration: 500 } })
    assert.ok(bare.note)
    assert.deepEqual(repairMotion({ preset: 'lift' }).value, { hover: { preset: 'lift' } })
    assert.deepEqual(repairMotion({ kind: 'scroll', preset: 'fade' }).value, { scroll: { preset: 'fade' } })
    assert.deepEqual(repairMotion('fade-up').value, { enter: { preset: 'fade-up' } })
    assert.deepEqual(repairMotion({ hover: 'lift', enter: { preset: 'fade' } }).value, { hover: { preset: 'lift' }, enter: { preset: 'fade' } })
    assert.deepEqual(repairMotion('{"enter":{"preset":"fade"}}').value, { enter: { preset: 'fade' } })
  })

  it('leaves correct and unfixable motion alone', () => {
    const good = { enter: { preset: 'fade-up' }, press: { preset: 'shrink' } }
    assert.deepEqual(repairMotion(good), { value: good })
    assert.deepEqual(repairMotion('spin'), { value: 'spin' })
    assert.deepEqual(repairMotion({ preset: 'spin' }), { value: { preset: 'spin' } })
    assert.deepEqual(repairMotion(5), { value: 5 })
  })

  it('repairOperations fixes motion of update and of inserted blocks, with notes', () => {
    const update = repair({ operations: [{ type: 'update', id: 'h', motion: { preset: 'fade-up' } }] })
    assert.deepEqual((update.ops[0] as { motion: unknown }).motion, { enter: { preset: 'fade-up' } })
    assert.match(update.notes[0], /^Operation 0: "motion" is an object of kinds/)

    const insert = repair({
      operations: [
        {
          type: 'insert',
          to: { parentId: null, index: 0 },
          block: { type: 'stack', motion: 'fade-up', slots: { children: [{ type: 'heading', motion: { preset: 'lift' } }] } },
        },
      ],
    })
    const block = (insert.ops[0] as { block: { motion: unknown; slots: { children: Array<{ motion: unknown }> } } }).block
    assert.deepEqual(block.motion, { enter: { preset: 'fade-up' } })
    assert.deepEqual(block.slots.children[0].motion, { hover: { preset: 'lift' } })
    assert.equal(insert.notes.length, 2)

    assert.deepEqual(repair({ operations: [{ type: 'update', id: 'h', motion: { enter: { preset: 'fade' } } }] }).notes, [])
  })

  it('applyOperations adds, merges and removes motion, and reports the repair', async () => {
    const workspace = withHeading()
    const first = await runTool('applyOperations', { operations: [{ type: 'update', id: 'h', motion: { preset: 'fade-up' } }] }, workspace, env())
    assert.equal(first.ok, true)
    assert.ok((JSON.parse(first.content) as { repaired?: string[] }).repaired)
    assert.deepEqual(findBlock(workspace.layout, 'h')?.motion, { enter: { preset: 'fade-up' } })
    assert.deepEqual(first.ops?.[0], { type: 'update', id: 'h', motion: { enter: { preset: 'fade-up' } } })

    await runTool('applyOperations', { operations: [{ type: 'update', id: 'h', motion: { hover: { preset: 'lift' } } }] }, workspace, env())
    assert.deepEqual(findBlock(workspace.layout, 'h')?.motion, { enter: { preset: 'fade-up' }, hover: { preset: 'lift' } })
    await runTool('applyOperations', { operations: [{ type: 'update', id: 'h', motion: { enter: null } }] }, workspace, env())
    assert.deepEqual(findBlock(workspace.layout, 'h')?.motion, { hover: { preset: 'lift' } })
    await runTool('applyOperations', { operations: [{ type: 'update', id: 'h', motion: null }] }, workspace, env())
    assert.equal(findBlock(workspace.layout, 'h')?.motion, undefined)
  })

  it('applyOperations inserts a block with motion and refuses bad motion', async () => {
    const workspace = new Workspace(emptyLayout(), blocks)
    const inserted = await runTool(
      'applyOperations',
      { operations: [{ type: 'insert', block: { type: 'heading', props: { text: 'A' }, motion: { enter: { preset: 'zoom-in', duration: 400 } } }, to: { parentId: null, index: 0 } }] },
      workspace,
      env(),
    )
    assert.equal(inserted.ok, true)
    assert.deepEqual(workspace.layout.blocks[0].motion, { enter: { preset: 'zoom-in', duration: 400 } })

    const bad = await runTool(
      'applyOperations',
      { operations: [{ type: 'update', id: workspace.layout.blocks[0].id, motion: { enter: { preset: 'fade', duration: 1 } } }] },
      workspace,
      env(),
    )
    assert.equal(bad.ok, false)
    assert.match(bad.content, /motion\.enter\.duration must be from 50 to 5000/)
    assert.deepEqual(workspace.layout.blocks[0].motion, { enter: { preset: 'zoom-in', duration: 400 } })
  })

  it('insertSection, getLayout, findBlocks, listSections and getBlockSchema keep motion', async () => {
    const animated: SectionDefinition = {
      id: 'animated',
      label: 'Animated',
      blocks: [{ id: 'x1', type: 'stack', motion: { enter: { preset: 'fade-up', stagger: 80 } }, slots: { children: [{ id: 'x2', type: 'heading', props: { text: 'Cards' } }] } }],
    }
    const e = env({ sections: [animated] })
    const workspace = new Workspace(emptyLayout(), blocks)
    const expected = { enter: { preset: 'fade-up', stagger: 80 } }
    const inserted = await runTool('insertSection', { sectionId: 'animated' }, workspace, e)
    assert.equal(inserted.ok, true)
    assert.deepEqual((JSON.parse(inserted.content) as { inserted: Array<{ motion: unknown }> }).inserted[0].motion, expected)

    const layout = JSON.parse((await runTool('getLayout', {}, workspace, e)).content) as { layout: Layout }
    assert.deepEqual(layout.layout.blocks[0].motion, expected)

    const found = JSON.parse((await runTool('findBlocks', { type: 'stack' }, workspace, e)).content) as { matches: Array<{ motion?: unknown }> }
    assert.deepEqual(found.matches[0].motion, expected)

    const listed = JSON.parse((await runTool('listSections', { full: true }, workspace, e)).content) as Array<{ blocks: Array<{ motion: unknown }> }>
    assert.deepEqual(listed[0].blocks[0].motion, expected)

    const schema = JSON.parse((await runTool('getBlockSchema', { type: 'heading' }, workspace, e)).content) as { properties: Record<string, unknown>; $defs: Record<string, unknown> }
    assert.deepEqual(schema.properties.motion, { $ref: '#/$defs/%24motion' })
    assert.ok(schema.$defs.$motion)
  })

  it('the system prompt has the animations rules and the preset lists, and stays stable', () => {
    const prompt = systemPrompt({ blocks, sections: [hero], tokens: null, bindings: false })
    assert.match(prompt, /\nANIMATIONS\n/)
    assert.match(prompt, /stagger 60-120/)
    assert.match(prompt, /trigger: "load"/)
    assert.match(prompt, /hover \{ preset: "lift" \} and press \{ preset: "shrink" \}/)
    assert.match(prompt, /merges per kind/)
    // The preset lists come from the core list.
    for (const preset of ['fade-up', 'blur-in', 'wipe-right', 'tilt', 'parallax', 'pulse', 'bouncy']) assert.match(prompt, new RegExp(preset))
    assert.equal(systemPrompt({ blocks, sections: [hero], tokens: null, bindings: false }), prompt)
  })
})

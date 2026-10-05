'use client'

// The empty page's start screen: a card over the canvas with three suggested sections, the
// Sections and Blocks tabs, and the assistant (when the plugin has one). A document that the site
// shows through a template says so first, with a link to the template.
//
// It sits in the canvas frame's wrapper, over the iframe, at screen size (not zoomed). Only the
// card takes the pointer, so drops from the library still reach the canvas around it. It hides
// while something is dragged.

import { Button, useConfig } from '@payloadcms/ui'
import { useEffect, useId, useMemo, useState } from 'react'

import { DOCUMENT_TEMPLATE_FIELD, TEMPLATE_DEFAULT_FIELD, TEMPLATE_LAYOUT_FIELD, TEMPLATE_TARGET_FIELD } from '../../../core/bindings'
import type { SectionDefinition } from '../../../core/types'
import { builderViewPath } from '../../../plugin/links'
import { insertBlocks, sectionPosition } from '../actions'
import { Icon } from '../icons'
import { selectLeftTab } from '../layout/leftTabs'
import { SectionThumb } from '../Library'
import { useRuntime, type Runtime } from '../runtime'
import { useEditor } from '../store'
import { isTemplateDoc } from '../templates/state'
import { useValueSelector } from '../valueStore'
import './empty.scss'

/** Categories of the suggested sections, in order: a page usually starts with these. */
const SUGGESTED = ['Heroes', 'Features', 'Calls to action']
const SUGGESTION_COUNT = 3

function suggestions(sections: SectionDefinition[]): SectionDefinition[] {
  const picked = SUGGESTED.flatMap((category) => sections.find((s) => s.category === category) ?? [])
  const rest = sections.filter((s) => !picked.includes(s))
  return [...picked, ...rest].slice(0, SUGGESTION_COUNT)
}

type AppliedTemplate = { id: string | number; name: string }

const hasBlocks = (doc: Record<string, unknown> | undefined) => {
  const layout = doc?.[TEMPLATE_LAYOUT_FIELD] as { blocks?: unknown[] } | null | undefined
  return Boolean(layout?.blocks?.length)
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
  return response.ok ? ((await response.json()) as Record<string, unknown>) : null
}

/**
 * The published template the site renders this document through: its own template, else the
 * collection's newest default template with blocks. The same rule as `loadTemplate`.
 */
async function appliedTemplate(runtime: Runtime, id: string | number): Promise<AppliedTemplate | null> {
  const templates = runtime.config.templates
  // Only collections that templates can target: filtering the templates on another slug is an
  // invalid select value, which the database rejects (500).
  if (!templates || !(runtime.config.collection in templates.sources)) return null
  const base = `${runtime.api}/${encodeURIComponent(templates.collection)}`
  const doc = await getJson(
    `${runtime.api}/${encodeURIComponent(runtime.config.collection)}/${encodeURIComponent(String(id))}?depth=0&draft=true&select[${DOCUMENT_TEMPLATE_FIELD}]=true`,
  )
  // Only template-enabled collections have the field (it is null when the document has no template of its own).
  if (!doc || !(DOCUMENT_TEMPLATE_FIELD in doc)) return null
  const own = doc[DOCUMENT_TEMPLATE_FIELD]
  const ownId = own && typeof own === 'object' ? (own as { id?: unknown }).id : own
  if (typeof ownId === 'string' || typeof ownId === 'number') {
    const template = await getJson(`${base}/${encodeURIComponent(String(ownId))}?depth=0`)
    if (template && hasBlocks(template)) return { id: ownId, name: String(template.name ?? 'Untitled') }
  }
  const query = new URLSearchParams({
    [`where[and][0][${TEMPLATE_TARGET_FIELD}][equals]`]: runtime.config.collection,
    [`where[and][1][${TEMPLATE_DEFAULT_FIELD}][equals]`]: 'true',
    'where[and][2][_status][equals]': 'published',
    sort: '-updatedAt',
    depth: '0',
    limit: '5',
  })
  const found = await getJson(`${base}?${query.toString()}`)
  const docs = (found?.docs as Record<string, unknown>[] | undefined) ?? []
  const template = docs.find(hasBlocks)
  if (!template) return null
  return { id: template.id as string | number, name: String(template.name ?? 'Untitled') }
}

/** The template that applies to this document. Null while loading, for templates themselves, and for collections without templates. */
function useAppliedTemplate(runtime: Runtime, active: boolean): AppliedTemplate | null {
  const id = useValueSelector(runtime.doc.meta, (meta) => meta.id)
  const enabled = active && runtime.config.templates !== null && !isTemplateDoc(runtime.config)
  const [template, setTemplate] = useState<AppliedTemplate | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    appliedTemplate(runtime, id)
      .then((found) => {
        if (!cancelled) setTemplate(found)
      })
      .catch(() => {
        // No notice when the check fails: the start options still show.
      })
    return () => {
      cancelled = true
    }
  }, [enabled, runtime, id])
  return enabled ? template : null
}

export function EmptyStart() {
  const runtime = useRuntime()
  const empty = useEditor(runtime.store, (s) => s.layout.blocks.length === 0)
  const dragging = useValueSelector(runtime.drag, (drag) => drag !== null)
  const template = useAppliedTemplate(runtime, empty)
  // "Add blocks here anyway" on a document with a template.
  const [ignoreTemplate, setIgnoreTemplate] = useState(false)
  const titleId = useId()
  if (!empty || dragging) return null
  return (
    <div className="builder-empty-start">
      <section className="builder-empty-start__card" aria-labelledby={titleId}>
        {template && !ignoreTemplate ? (
          <TemplateNotice template={template} titleId={titleId} onIgnore={() => setIgnoreTemplate(true)} />
        ) : (
          <StartOptions titleId={titleId} />
        )}
      </section>
    </div>
  )
}

function TemplateNotice({ template, titleId, onIgnore }: { template: AppliedTemplate; titleId: string; onIgnore: () => void }) {
  const runtime = useRuntime()
  const {
    config: { routes, collections },
  } = useConfig()
  const singular = collections.find((c) => c.slug === runtime.config.collection)?.labels?.singular
  const noun = typeof singular === 'string' ? singular.toLowerCase() : 'document'
  const templates = runtime.config.templates
  return (
    <>
      <span className="builder-empty-start__icon">
        <Icon name="template" size={20} />
      </span>
      <h2 id={titleId} className="builder-empty-start__title">
        This {noun} uses the template “{template.name}”
      </h2>
      <p className="builder-empty-start__text">
        The site shows this {noun} through the template. Blocks you add here do not show while a template applies.
      </p>
      <div className="builder-empty-start__actions">
        {templates && (
          <Button el="link" url={builderViewPath(routes.admin, templates.collection, template.id)} buttonStyle="primary" size="small" margin={false}>
            Open the template
          </Button>
        )}
        <Button buttonStyle="secondary" size="small" margin={false} onClick={onIgnore}>
          Add blocks here anyway
        </Button>
      </div>
    </>
  )
}

function StartOptions({ titleId }: { titleId: string }) {
  const runtime = useRuntime()
  const picks = useMemo(() => suggestions(runtime.config.sections ?? []), [runtime.config.sections])
  const insert = (section: SectionDefinition) => {
    if (insertBlocks(runtime, section.blocks, sectionPosition(runtime))) runtime.notify(`Added ${section.label}`)
  }
  return (
    <>
      <h2 id={titleId} className="builder-empty-start__title">
        Start this page
      </h2>
      <p className="builder-empty-start__text">
        {picks.length > 0 ? 'Add a section to begin, or build the page block by block.' : 'Add blocks from the Blocks tab, or drag them onto the canvas.'}
      </p>
      {picks.length > 0 && (
        <ul className="builder-empty-start__sections" aria-label="Suggested sections">
          {picks.map((section) => (
            <li key={section.id}>
              <button type="button" className="builder-editor__card builder-empty-start__section" onClick={() => insert(section)}>
                <SectionThumb section={section} />
                <span className="builder-editor__card-text">
                  <span className="builder-editor__card-label">{section.label}</span>
                  {section.category && <span className="builder-editor__card-desc">{section.category}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="builder-empty-start__actions">
        {picks.length > 0 && (
          <Button buttonStyle="secondary" size="small" margin={false} onClick={() => selectLeftTab(runtime, 'sections', { focus: true })}>
            Browse sections
          </Button>
        )}
        <Button buttonStyle="secondary" size="small" margin={false} onClick={() => selectLeftTab(runtime, 'blocks', { focus: true })}>
          Add a block
        </Button>
        {runtime.assistant && (
          <Button buttonStyle="secondary" size="small" margin={false} icon={<Icon name="sparkle" size={14} />} iconPosition="left" onClick={() => runtime.toggleAssistant(true)}>
            Ask the assistant
          </Button>
        )}
      </div>
    </>
  )
}

'use client'

import { useDraggable } from '@dnd-kit/core'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import type { Block, BlockDefinition, SectionDefinition } from '../../core/types'
import { insertBlocks, insertPosition, sectionPosition } from './actions'
import { BlockIcon, Icon } from './icons'
import { useRuntime, type DragData } from './runtime'

const BLOCK_CATEGORIES = ['Layout', 'Content', 'Media', 'Interactive']
const SECTION_CATEGORIES = ['Heroes', 'Features', 'Content', 'Social proof', 'Calls to action', 'Contact', 'Navigation']
const OTHER = 'Other'

/** Groups items by category: known categories in `order` first, then the rest A–Z, then "Other". */
function groupBy<T extends { category?: string }>(items: T[], order: string[]): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = item.category?.trim() || OTHER
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const rank = (name: string) => {
    const i = order.indexOf(name)
    if (i >= 0) return i
    return name === OTHER ? order.length + 1 : order.length
  }
  return [...groups].toSorted(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
}

const matches = (query: string, ...texts: (string | undefined)[]) => {
  const q = query.trim().toLowerCase()
  return !q || texts.some((t) => t?.toLowerCase().includes(q))
}

type Tab = 'blocks' | 'sections'

/**
 * The insert panel: blocks and ready-made sections. Drag an item onto the canvas or the outline,
 * or click it to insert it at the selection.
 */
export function Library() {
  const { config } = useRuntime()
  const [tab, setTab] = useState<Tab>('blocks')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(true)
  const sectionCount = config.sections?.length ?? 0

  return (
    <div className={`builder-editor__insert${open ? '' : ' builder-editor__insert--closed'}`}>
      <div className="builder-editor__panel-head">
        <button
          type="button"
          className="builder-editor__panel-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          <span className="builder-editor__panel-title">
            <Icon name="plus" size={14} /> Add
          </span>
        </button>
        <div className="builder-editor__segmented builder-editor__segmented--small" role="tablist" aria-label="Library">
          {(['blocks', 'sections'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className="builder-editor__segment"
              onClick={() => {
                setTab(id)
                setOpen(true)
              }}
            >
              {id === 'blocks' ? 'Blocks' : 'Sections'}
              {id === 'sections' && sectionCount > 0 && <span className="builder-editor__segment-count">{sectionCount}</span>}
            </button>
          ))}
        </div>
      </div>
      {open && (
        <>
          <label className="builder-editor__search">
            <Icon name="search" size={14} />
            <input
              type="search"
              placeholder={tab === 'blocks' ? 'Search blocks' : 'Search sections'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('')
              }}
            />
          </label>
          <div className="builder-editor__insert-body">
            {tab === 'blocks' ? <BlockList query={query} /> : <SectionList query={query} />}
          </div>
        </>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="builder-editor__group-block">
      <h4 className="builder-editor__group-title">{title}</h4>
      {children}
    </section>
  )
}

function NoMatches({ query }: { query: string }) {
  return <p className="builder-editor__hint builder-editor__hint--center">Nothing matches “{query.trim()}”.</p>
}

function BlockList({ query }: { query: string }) {
  const { config } = useRuntime()
  const groups = useMemo(
    () =>
      groupBy(
        config.blocks.filter((def) => matches(query, def.label, def.type, def.category, def.ai?.description)),
        BLOCK_CATEGORIES,
      ),
    [config.blocks, query],
  )
  if (groups.length === 0) return <NoMatches query={query} />
  return groups.map(([category, defs]) => (
    <Group key={category} title={category}>
      <div className="builder-editor__tiles">
        {defs.map((def) => (
          <BlockTile key={def.type} def={def} />
        ))}
      </div>
    </Group>
  ))
}

function BlockTile({ def }: { def: BlockDefinition }) {
  const runtime = useRuntime()
  const icon = def.icon ?? def.type
  const data: DragData = { source: { kind: 'new', blockType: def.type }, label: def.label, icon }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `library:${def.type}`, data })

  const insert = () => {
    const block = runtime.createBlock(def.type)
    if (!block) return
    runtime.store.apply({ type: 'insert', block, to: insertPosition(runtime, def.type) }, { select: block.id })
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="builder-editor__tile"
      title={def.ai?.description ?? `Add ${def.label}`}
      onClick={insert}
      {...listeners}
      {...attributes}
    >
      <span className="builder-editor__tile-icon">
        <BlockIcon name={icon} size={18} />
      </span>
      <span className="builder-editor__tile-label">{def.label}</span>
    </button>
  )
}

function SectionList({ query }: { query: string }) {
  const { config } = useRuntime()
  const sections = useMemo(() => config.sections ?? [], [config.sections])
  const groups = useMemo(
    () => groupBy(sections.filter((s) => matches(query, s.label, s.description, s.category)), SECTION_CATEGORIES),
    [sections, query],
  )
  if (sections.length === 0) {
    return (
      <div className="builder-editor__empty">
        <Icon name="section" size={20} />
        <p>No sections yet.</p>
        <p className="builder-editor__hint">
          Pass ready-made sections to the plugin with the <code>sections</code> option.
        </p>
      </div>
    )
  }
  if (groups.length === 0) return <NoMatches query={query} />
  return groups.map(([category, list]) => (
    <Group key={category} title={category}>
      <div className="builder-editor__cards">
        {list.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </div>
    </Group>
  ))
}

function SectionCard({ section }: { section: SectionDefinition }) {
  const runtime = useRuntime()
  const root = section.blocks[0]
  const data: DragData = {
    // Drop rules check the root block's type.
    source: { kind: 'new', blockType: root?.type ?? 'stack' },
    label: section.label,
    icon: 'section',
    blocks: section.blocks,
  }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `section:${section.id}`, data, disabled: !root })

  const insert = () => {
    if (insertBlocks(runtime, section.blocks, sectionPosition(runtime))) runtime.notify(`Added ${section.label}`)
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="builder-editor__card"
      title={`Add ${section.label}`}
      onClick={insert}
      {...listeners}
      {...attributes}
    >
      <span className="builder-editor__thumb" aria-hidden="true">
        <span className="builder-editor__thumb-inner">
          {section.blocks.map((block) => (
            <Wire key={block.id} block={block} />
          ))}
        </span>
      </span>
      <span className="builder-editor__card-text">
        <span className="builder-editor__card-label">{section.label}</span>
        {section.description && <span className="builder-editor__card-desc">{section.description}</span>}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Wireframe thumbnails: a tiny abstract drawing of a block tree, built from the block types and
// a few layout classes (row/column, grid columns, centering, background).
// ---------------------------------------------------------------------------

function classTokens(block: Block): string[] {
  return (block.className ?? '').split(/\s+/).map((c) => c.replace(/^(sm|md|lg|xl|2xl):/, ''))
}

function Wire({ block }: { block: Block }) {
  const tokens = classTokens(block)
  const has = (c: string) => tokens.includes(c)
  const children = Object.values(block.slots ?? {}).flat()
  const center = has('text-center') || has('items-center')

  switch (block.type) {
    case 'heading': {
      const level = Number(block.props?.level ?? 2)
      return <span className="wf-heading" data-level={level <= 1 ? 1 : level === 2 ? 2 : 3} data-center={center || undefined} />
    }
    case 'text':
      return <span className="wf-text" data-center={center || undefined} />
    case 'quote':
      return (
        <span className="wf-card">
          <span className="wf-text" />
          <span className="wf-text wf-text--short" />
        </span>
      )
    case 'richText':
      return (
        <span className="wf-lines">
          <span className="wf-text" />
          <span className="wf-text" />
          <span className="wf-text wf-text--short" />
        </span>
      )
    case 'list':
      return (
        <span className="wf-lines">
          <span className="wf-text wf-text--short" />
          <span className="wf-text wf-text--short" />
          <span className="wf-text wf-text--short" />
        </span>
      )
    case 'button':
      return <span className="wf-button" data-primary={has('bg-primary') || undefined} />
    case 'image':
    case 'video':
      return <span className="wf-media" style={has('order-last') ? { order: 1 } : undefined} />
    case 'divider':
      return <span className="wf-divider" />
    case 'spacer':
      return <span className="wf-spacer" />
    case 'form':
      return (
        <span className="wf-form">
          <span className="wf-field" />
          <span className="wf-field" />
          <span className="wf-button" data-primary />
        </span>
      )
    case 'link':
      return children.length > 0 ? (
        <span className="wf-row wf-inline">
          {children.map((child) => (
            <Wire key={child.id} block={child} />
          ))}
        </span>
      ) : (
        <span className="wf-text wf-text--short" />
      )
    default: {
      const cols = Math.max(0, ...tokens.map((t) => Number(/^grid-cols-(\d+)$/.exec(t)?.[1] ?? 0)))
      const row = has('flex-row')
      const style: CSSProperties | undefined = cols > 1 ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined
      const kind = cols > 1 ? 'wf-grid' : row ? 'wf-row' : 'wf-col'
      const tone = has('bg-muted') ? 'muted' : has('bg-primary') ? 'primary' : undefined
      return (
        <span
          className={`wf-box ${kind}`}
          style={style}
          data-center={center || undefined}
          data-between={has('justify-between') || undefined}
          data-tone={tone}
          data-pad={tokens.some((t) => /^p[xy]?-\d/.test(t)) || undefined}
        >
          {children.map((child) => (
            <Wire key={child.id} block={child} />
          ))}
        </span>
      )
    }
  }
}

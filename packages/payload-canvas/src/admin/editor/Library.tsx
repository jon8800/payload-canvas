'use client'

import { useDraggable } from '@dnd-kit/core'
import { useConfig, useRouteTransition } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import type { Block, BlockDefinition, SectionDefinition } from '../../core/types'
import { builderViewPath } from '../../plugin/links'
import { insertBlocks, insertNewBlock, sectionPosition } from './actions'
import { BlockIcon, Icon } from './icons'
import { MenuButton } from './menu/Menu'
import { useRuntime, type DragData } from './runtime'
import { requestDeleteSection, requestRenameSection } from './sections/SectionDialog'
import { useSectionThumbnail } from './sections/useThumbnail'
import { useValue } from './valueStore'

const BLOCK_CATEGORIES = ['Layout', 'Content', 'Media', 'Interactive', 'Dynamic']
const SECTION_CATEGORIES = ['Heroes', 'Features', 'Content', 'Social proof', 'Calls to action', 'Contact', 'Navigation']
const OTHER = 'Other'
/** Group of the sections people saved. Listed first. */
const SAVED = 'Saved'

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

/**
 * A library tab of the left panel: blocks or ready-made sections, with a search field. Drag an
 * item onto the canvas (or the Layers tab, which opens the tree), or click it to insert it at the
 * selection.
 */
export function Library({ kind }: { kind: 'blocks' | 'sections' }) {
  const [query, setQuery] = useState('')
  // The input updates at once; the filtered lists follow in a deferred render.
  const listQuery = useDeferredValue(query)
  const label = kind === 'blocks' ? 'Search blocks' : 'Search sections'

  return (
    <div className="builder-editor__insert">
      <label className="builder-editor__search">
        <Icon name="search" size={14} />
        <input
          type="search"
          aria-label={label}
          placeholder={label}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
        />
      </label>
      <div className="builder-editor__insert-body">{kind === 'blocks' ? <BlockList query={listQuery} /> : <SectionList query={listQuery} />}</div>
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

const BlockList = memo(function BlockList({ query }: { query: string }) {
  const { config } = useRuntime()
  const groups = useMemo(
    () =>
      groupBy(
        // Blocks with `parents` (e.g. a list item) only fit inside their parent: the "+" picker
        // offers them there, so the library leaves them out.
        config.blocks.filter(
          (def) => !def.parents && matches(query, def.label, def.type, def.category, def.ai?.description),
        ),
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
})

function BlockTile({ def }: { def: BlockDefinition }) {
  const runtime = useRuntime()
  const icon = def.icon ?? def.type
  const data: DragData = { source: { kind: 'new', blockType: def.type }, label: def.label, icon }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `library:${def.type}`, data })

  const insert = () => insertNewBlock(runtime, def.type)

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="builder-editor__tile"
      data-tooltip={def.ai?.description ?? `Add ${def.label}`}
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

const SectionList = memo(function SectionList({ query }: { query: string }) {
  const { config, sections: controller } = useRuntime()
  const saved = useValue(controller.saved)
  const builtIn = useMemo(() => config.sections ?? [], [config.sections])
  // A section edited in another tab: coming back to this one shows its new content and picture.
  useEffect(() => {
    if (!controller.enabled) return
    const reload = () => void controller.load(true)
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [controller])
  const groups = useMemo(() => {
    const own = (saved ?? []).filter((s) => matches(query, s.label, s.category, SAVED))
    const rest = groupBy(builtIn.filter((s) => matches(query, s.label, s.description, s.category)), SECTION_CATEGORIES)
    return own.length > 0 ? ([[SAVED, own], ...rest] as [string, SectionDefinition[]][]) : rest
  }, [builtIn, saved, query])
  if (builtIn.length === 0 && (saved?.length ?? 0) === 0) {
    return (
      <div className="builder-editor__empty">
        <Icon name="section" size={20} />
        <p>No sections yet.</p>
        <p className="builder-editor__hint">
          {controller.enabled ? 'Select a block on the canvas, open its menu and choose “Save as section…”. ' : ''}
          Apps pass ready-made sections to the plugin with the <code>sections</code> option.
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
})

/** A section's real thumbnail, made once it scrolls into view. A wireframe shows until then (or when it fails). */
export function SectionThumb({ section }: { section: SectionDefinition }) {
  const thumbRef = useRef<HTMLSpanElement>(null)
  const picture = useSectionThumbnail(section, thumbRef)
  return (
    <span ref={thumbRef} className={`builder-editor__thumb${picture ? ' builder-editor__thumb--picture' : ''}`} aria-hidden="true">
      {picture ? (
        <img className="builder-editor__thumb-img" src={picture} alt="" draggable={false} />
      ) : (
        <span className="builder-editor__thumb-inner">
          {section.blocks.map((block) => (
            <Wire key={block.id} block={block} />
          ))}
        </span>
      )}
    </span>
  )
}

function SectionCard({ section }: { section: SectionDefinition }) {
  const runtime = useRuntime()
  const root = section.blocks[0]
  const isSaved = section.savedId !== undefined
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
    <div className="builder-editor__card-wrap">
      <button
        ref={setNodeRef}
        type="button"
        className="builder-editor__card"
        data-tooltip={`Add ${section.label}`}
        onClick={insert}
        {...listeners}
        {...attributes}
      >
        <SectionThumb section={section} />
        <span className="builder-editor__card-text">
          <span className="builder-editor__card-label">{section.label}</span>
          {isSaved && section.category && <span className="builder-editor__card-desc">{section.category}</span>}
          {!isSaved && section.description && <span className="builder-editor__card-desc">{section.description}</span>}
        </span>
      </button>
      {isSaved && <SavedSectionMenu section={section} />}
    </div>
  )
}

/** The builder URL that edits a saved section, with `from` (this page) for its Back button. */
export function editSectionPath(adminRoute: string, collection: string, id: string | number, from: string): string {
  return `${builderViewPath(adminRoute, collection, id)}?from=${encodeURIComponent(from)}`
}

/** Edit, rename and delete for a saved section. */
function SavedSectionMenu({ section }: { section: SectionDefinition }) {
  const runtime = useRuntime()
  const router = useRouter()
  const { startRouteTransition } = useRouteTransition()
  const {
    config: { routes },
  } = useConfig()
  const collection = runtime.config.savedSections?.collection
  // Opens the section in the full-screen builder, like a page. Pages that use it keep their copy.
  const edit = () => {
    if (!collection || section.savedId === undefined) return
    const href = editSectionPath(routes.admin, collection, section.savedId, `${window.location.pathname}${window.location.search}`)
    startRouteTransition(() => router.push(href))
  }
  return (
    <MenuButton
      className="builder-editor__icon-button builder-editor__icon-button--small builder-editor__card-more"
      triggerLabel={`Actions for ${section.label}`}
      tooltip="Edit, rename or delete"
      label="Saved section actions"
      footer="Pages that use this section keep their own copy."
      items={() => [
        ...(collection ? [{ icon: 'compose' as const, label: 'Edit section', run: edit }] : []),
        { icon: 'rename', label: 'Rename…', ownFocus: true, run: () => requestRenameSection(runtime, section) },
        { icon: 'delete', label: 'Delete…', ownFocus: true, danger: true, run: () => requestDeleteSection(runtime, section) },
      ]}
    >
      <Icon name="more" size={14} />
    </MenuButton>
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
      const text = typeof block.props?.text === 'string' ? block.props.text.trim() : ''
      // Real words make sections easy to tell apart; the bar stands in for an empty heading.
      if (text) {
        return (
          <span className="wf-heading-text" data-level={level <= 1 ? 1 : level === 2 ? 2 : 3} data-center={center || undefined}>
            {text}
          </span>
        )
      }
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

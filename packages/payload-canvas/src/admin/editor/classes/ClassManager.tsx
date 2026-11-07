'use client'

// The class manager: every shared class in one list, with search, where each one is used (links
// to the pages), Rename, Duplicate and Delete, and "Remove unused classes". A Payload drawer opened
// from the Classes menu of the Styles panel ("Manage classes…"). Rename, Delete and Remove unused
// open the class dialogs (ClassDialog.tsx); the server changes every layout through its live session.

import { Drawer, useConfig, useModal } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

import { plural, type BuilderClass, type ClassUsage } from '../../../classes/shared'
import { filterClasses, usageOf } from './managerModel'
import { builderViewPath } from '../../../plugin/links'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import './manager.scss'

export const CLASS_MANAGER_SLUG = 'builder-class-manager'

/** Mounted with the Styles panel. Renders the drawer; `openModal(CLASS_MANAGER_SLUG)` opens it. */
export function ClassManager() {
  const runtime = useRuntime()
  const classes = runtime.classes!
  const list = useValue(classes.list)
  const usage = useValue(classes.usage)
  const { isModalOpen } = useModal()
  const open = isModalOpen(CLASS_MANAGER_SLUG)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Fresh counts each time the drawer opens.
  useEffect(() => {
    if (open) void classes.loadUsage()
  }, [open, classes])

  const shown = useMemo(() => filterClasses(list, query), [list, query])
  const unused = usage ? list.filter((c) => usageOf(c, usage)?.blocks === 0) : []

  const removeUnused = () => classes.dialog.set({ kind: 'remove-unused', names: unused.map((c) => c.name) })

  return (
    <Drawer slug={CLASS_MANAGER_SLUG} title="Classes" className="builder-class-manager">
      {open && (
        <div className="builder-class-manager__body">
          <div className="builder-class-manager__toolbar">
            <label className="builder-class-manager__search">
              <Icon name="search" size={14} />
              <input
                type="search"
                value={query}
                placeholder="Search classes"
                aria-label="Search classes"
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- the drawer opens for this
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button type="button" className="builder-class-manager__button" disabled={unused.length === 0} onClick={removeUnused}>
              {unused.length > 0 ? `Remove ${plural(unused.length, 'unused class', 'unused classes')}` : 'No unused classes'}
            </button>
          </div>
          <p className="builder-class-manager__summary">
            {plural(list.length, 'class', 'classes')}
            {usage ? (unused.length > 0 ? ` · ${unused.length} unused` : '') : ' · counting where they are used…'}
          </p>
          {list.length === 0 ? (
            <p className="builder-class-manager__empty">No shared classes yet. Select a block, then choose “New class from these styles” in the Classes menu.</p>
          ) : shown.length === 0 ? (
            <p className="builder-class-manager__empty">No class matches “{query.trim()}”.</p>
          ) : (
            <ul className="builder-class-manager__list">
              {shown.map((item) => (
                <ClassRow
                  key={item.id}
                  item={item}
                  usage={usageOf(item, usage)}
                  expanded={expanded === String(item.id)}
                  onToggle={() => setExpanded(expanded === String(item.id) ? null : String(item.id))}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Drawer>
  )
}

function ClassRow({ item, usage, expanded, onToggle }: { item: BuilderClass; usage: ClassUsage | null; expanded: boolean; onToggle: () => void }) {
  const runtime = useRuntime()
  const classes = runtime.classes!
  const {
    config: {
      collections,
      routes: { admin },
    },
  } = useConfig()
  const collectionLabel = (slug: string) => {
    const label = collections.find((c) => c.slug === slug)?.labels?.singular
    return typeof label === 'string' ? label : slug
  }
  const used = usage ? usage.blocks > 0 : false
  const detailsId = `builder-class-${String(item.id)}-used`

  const duplicate = () =>
    void classes.duplicate(item.id).then((result) => {
      if (typeof result === 'string') runtime.warn(`.${item.name} was not duplicated: ${result}`)
      else runtime.notify(`Created .${result.name}, a copy of .${item.name}.`)
    })

  return (
    <li className="builder-class-manager__row" data-expanded={expanded ? '' : undefined}>
      <div className="builder-class-manager__line">
        <button type="button" className="builder-class-manager__main" aria-expanded={expanded} aria-controls={detailsId} disabled={!used} onClick={onToggle}>
          <span className="builder-class-manager__name">.{item.name}</span>
          {item.label ? <span className="builder-class-manager__label">{item.label}</span> : null}
          <span className="builder-class-manager__usage" data-unused={usage && !used ? '' : undefined}>
            {usage ? (used ? `${plural(usage.blocks, 'block')} · ${plural(usage.documents.length, 'page')}` : 'Unused') : '…'}
          </span>
          {item.status === 'draft' ? <span className="builder-class-manager__badge">Draft</span> : null}
        </button>
        <span className="builder-class-manager__actions">
          <button type="button" aria-label={`Rename .${item.name}`} data-tooltip="Rename" onClick={() => classes.dialog.set({ kind: 'rename', id: item.id })}>
            <Icon name="rename" size={14} />
          </button>
          <button type="button" aria-label={`Duplicate .${item.name}`} data-tooltip="Duplicate" onClick={duplicate}>
            <Icon name="duplicate" size={14} />
          </button>
          <button type="button" aria-label={`Delete .${item.name}`} data-tooltip="Delete" data-danger="" onClick={() => classes.dialog.set({ kind: 'delete', id: item.id })}>
            <Icon name="delete" size={14} />
          </button>
        </span>
      </div>
      {expanded && usage && used ? (
        <ul id={detailsId} className="builder-class-manager__docs" aria-label={`Pages that use .${item.name}`}>
          {usage.documents.map((doc) => (
            <li key={`${doc.collection}:${doc.id}`}>
              <a href={builderViewPath(admin, doc.collection, doc.id)} target="_blank" rel="noreferrer">
                <span className="builder-class-manager__doc-title">{doc.title}</span>
                <span className="builder-class-manager__doc-meta">
                  {collectionLabel(doc.collection)} · {plural(doc.blocks, 'block')}
                </span>
                <Icon name="external" size={12} />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

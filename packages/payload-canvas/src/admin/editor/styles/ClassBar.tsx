'use client'

// The top of the Styles panel: the one classes field of the block (or part), its "⋯" menu, and
// while the controls edit an editable class, a short banner with how far a change reaches and
// Publish, Rename and Delete. `ClassChips` (RawClasses.tsx) draws the field.

import { useModal } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { plural, usageText, type BuilderClass } from '../../../classes/shared'
import { CLASS_MANAGER_SLUG } from '../classes/ClassManager'
import { Icon } from '../icons'
import { MenuButton, type MenuEntry } from '../menu/Menu'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import { useStyles, writeClassName } from './context'
import { ResetIcon } from './icons'
import { ClassChips, ClassText } from './RawClasses'
import './classes.scss'

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`

/** `className`: the block's (or part's) own classes. `own`: the editable classes among them. */
export function ClassBar({ className, own }: { className: string; own: BuilderClass[] }) {
  const runtime = useRuntime()
  const classes = runtime.classes
  const { blockId, part, editingClass: editing, tokens } = useStyles()
  const [asText, setAsText] = useState(false)
  const { openModal } = useModal()
  const owner = part ? 'this part' : 'this block'
  const label = part ? 'Classes of this part' : 'Classes of this block'
  const write = (next: string, mergeKey?: string) => writeClassName(runtime, { blockId, part }, next, mergeKey)
  // Code classes (`@utility` in the site's CSS) that are not editable classes yet.
  const codeOnly = classes ? (tokens.siteClasses ?? []).filter((c) => !classes.byName(c.name)).length : 0

  const menu = (): MenuEntry[] => [
    ...(classes
      ? ([
          {
            label: 'New class from these styles…',
            icon: 'plus',
            ownFocus: true,
            run: () => classes.dialog.set({ kind: 'new', blockId, part }),
          },
          { label: 'Manage classes…', icon: 'list', ownFocus: true, run: () => openModal(CLASS_MANAGER_SLUG) },
          {
            label: codeOnly > 0 ? `Import ${plural(codeOnly, 'class', 'classes')} from the site’s CSS` : 'Import from the site’s CSS',
            icon: 'paste',
            disabled: codeOnly === 0,
            run: () =>
              void classes.importSite().then((result) => {
                if (typeof result === 'string') runtime.warn(`The classes were not imported: ${result}`)
                else runtime.notify(`Imported ${plural(result.created, 'class', 'classes')}. Their @utility rules in the site’s CSS can go now.`)
              }),
          },
          'separator',
        ] satisfies MenuEntry[])
      : []),
    { label: 'Edit as text', icon: 'compose', checked: asText, run: () => setAsText(!asText) },
  ]

  return (
    <div className="builder-classes" data-editing={editing ? '' : undefined}>
      <div className="builder-classes__head">
        <span className="builder-styles__raw-label" aria-hidden="true">
          Classes
        </span>
        <MenuButton className="builder-classes__menu" triggerLabel="Class actions" tooltip="New class, manage classes, import, edit as text" label="Classes" items={menu}>
          <Icon name="more" size={14} />
        </MenuButton>
      </div>
      {asText ? (
        <ClassText value={className} onChange={write} label={label} />
      ) : (
        <ClassChips
          value={className}
          onChange={(next) => write(next)}
          label={label}
          owner={owner}
          editable={own}
          selected={editing}
          onSelect={(item) => classes?.target.set(item?.id ?? null)}
        />
      )}
      {editing && classes && <ClassBanner item={editing} />}
    </div>
  )
}

/** While the controls edit a class: what a change reaches, its save state, Publish and the class actions. */
function ClassBanner({ item }: { item: BuilderClass }) {
  const runtime = useRuntime()
  const classes = runtime.classes!
  const usage = useValue(classes.usage)
  const save = useValue(classes.saving).get(String(item.id))
  // Fresh counts each time a class is chosen.
  const id = item.id
  useEffect(() => {
    if (id !== null) void classes.loadUsage()
  }, [classes, id])

  const used = usage ? sentence(usageText(usage[item.name])) : 'Counting where it is used…'
  const publish = () =>
    void classes.publish(item.id).then((result) => {
      if (result === true) runtime.notify(`Published .${item.name}. The live site uses it now.`)
      else runtime.warn(`.${item.name} was not published: ${result}`)
    })

  return (
    <section className="builder-classes__banner" aria-label={`Editing class .${item.name}`}>
      <div className="builder-classes__banner-head">
        <p className="builder-classes__title">
          Editing <code>.{item.name}</code>
        </p>
        <button
          type="button"
          className="builder-classes__close"
          aria-label="Stop editing the class"
          data-tooltip="Back to this block"
          onClick={() => classes.target.set(null)}
        >
          <ResetIcon />
        </button>
      </div>
      <p className="builder-classes__text">{used}</p>
      <div className="builder-classes__foot">
        <output className="builder-classes__state" data-state={save?.status ?? item.status}>
          {save?.status === 'saving' ? (
            'Saving draft…'
          ) : save?.status === 'error' ? (
            <>
              Not saved: {save.error}{' '}
              <button type="button" className="builder-styles__link" onClick={() => classes.retry(item.id)}>
                Retry
              </button>
            </>
          ) : item.status === 'draft' ? (
            <span data-tooltip="The live site gets the changes when you publish the class or a page that uses it.">Draft</span>
          ) : (
            'Published'
          )}
        </output>
        <button type="button" className="builder-styles__button builder-styles__button--primary" disabled={item.status === 'published' && !save} onClick={publish}>
          Publish class
        </button>
        <MenuButton
          className="builder-styles__icon-button"
          triggerLabel="More class actions"
          label="Class actions"
          items={() => [
            { label: 'Rename…', icon: 'rename', ownFocus: true, run: () => classes.dialog.set({ kind: 'rename', id: item.id }) },
            { label: 'Delete…', icon: 'delete', danger: true, ownFocus: true, run: () => classes.dialog.set({ kind: 'delete', id: item.id }) },
          ]}
        >
          <Icon name="more" size={14} />
        </MenuButton>
      </div>
    </section>
  )
}

/**
 * Under the controls while they edit a class: the classes in the class that no control shows,
 * in the same chips as the block's field.
 */
export function ClassExtras({ item }: { item: BuilderClass }) {
  const runtime = useRuntime()
  return (
    <div className="builder-classes__extras">
      <span className="builder-styles__raw-label" aria-hidden="true">
        More classes in .{item.name}
      </span>
      <ClassChips
        value={item.styles ?? ''}
        onChange={(next) => runtime.classes?.edit(item.id, 'styles', next || null)}
        label={`More classes in .${item.name}`}
        owner={`.${item.name}`}
      />
    </div>
  )
}

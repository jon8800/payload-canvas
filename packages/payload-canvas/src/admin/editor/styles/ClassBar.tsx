'use client'

// The top of the Styles panel: what the controls change. "This block" (the block's own classes,
// the default) or one of the editable classes the block uses. With a class chosen, a banner says
// how far a change reaches, and offers Publish, Rename and Delete.

import { useEffect } from 'react'

import { classPreview, plural, usageText, type BuilderClass } from '../../../classes/shared'
import { Icon } from '../icons'
import { MenuButton, type MenuEntry } from '../menu/Menu'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import { useStyles } from './context'
import './classes.scss'

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`

export function ClassBar({ part, own }: { part: string | null; own: BuilderClass[] }) {
  const runtime = useRuntime()
  const classes = runtime.classes!
  const { blockId, editingClass: editing, tokens } = useStyles()
  // Code classes (`@utility` in the site's CSS) that are not editable classes yet.
  const codeOnly = (tokens.siteClasses ?? []).filter((c) => !classes.byName(c.name)).length

  const menu = (): MenuEntry[] => [
    {
      label: part ? 'New class from this part’s styles…' : 'New class from this block’s styles…',
      icon: 'plus',
      ownFocus: true,
      run: () => classes.dialog.set({ kind: 'new', blockId, part }),
    },
    {
      label: codeOnly > 0 ? `Import ${plural(codeOnly, 'class', 'classes')} from the site’s CSS` : 'Import classes from the site’s CSS',
      icon: 'paste',
      disabled: codeOnly === 0,
      run: () =>
        void classes.importSite().then((result) => {
          if (typeof result === 'string') runtime.warn(`The classes were not imported: ${result}`)
          else runtime.notify(`Imported ${plural(result.created, 'class', 'classes')}. Their @utility rules in the site’s CSS can go now.`)
        }),
    },
  ]

  return (
    <div className="builder-classes" data-editing={editing ? '' : undefined}>
      <fieldset className="builder-classes__row" aria-label="What the styles change">
        <button
          type="button"
          className="builder-classes__chip"
          aria-pressed={!editing}
          data-tooltip={part ? 'Styles of this part only' : 'Styles of this block only'}
          onClick={() => classes.target.set(null)}
        >
          {part ? 'This part' : 'This block'}
        </button>
        {own.map((item) => (
          <button
            key={item.id}
            type="button"
            className="builder-classes__chip builder-classes__chip--class"
            aria-pressed={editing?.id === item.id}
            data-tooltip={`Edit the class${item.label ? ` “${item.label}”` : ''} for every block that uses it. ${classPreview(item, 120)}`.trim()}
            onClick={() => classes.target.set(item.id)}
          >
            <span className="builder-classes__chip-name">.{item.name}</span>
            {item.status === 'draft' && <span className="builder-classes__draft-dot" aria-label="unpublished changes" />}
          </button>
        ))}
        <MenuButton className="builder-classes__add" triggerLabel="New class or import" tooltip="New class, import" label="Classes" items={menu}>
          <Icon name="plus" size={14} />
        </MenuButton>
      </fieldset>
      {editing && <ClassBanner item={editing} />}
    </div>
  )
}

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
    <div className="builder-classes__banner">
      <p className="builder-classes__title">
        Editing class <code>.{item.name}</code>
        {item.label ? <span className="builder-classes__label"> · {item.label}</span> : null}
      </p>
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
            'Draft: the live site gets it when you publish the class or a page that uses it.'
          ) : (
            'Published'
          )}
        </output>
        <button type="button" className="builder-styles__button builder-styles__button--primary" disabled={item.status === 'published' && !save} onClick={publish}>
          Publish class
        </button>
        <MenuButton
          className="builder-styles__icon-button"
          triggerLabel="Class actions"
          label="Class actions"
          items={() => [
            { label: 'Rename…', icon: 'rename', ownFocus: true, run: () => classes.dialog.set({ kind: 'rename', id: item.id }) },
            { label: 'Delete…', icon: 'delete', danger: true, ownFocus: true, run: () => classes.dialog.set({ kind: 'delete', id: item.id }) },
            'separator',
            { label: 'Edit this block instead', icon: 'back', run: () => classes.target.set(null) },
          ]}
        >
          <Icon name="more" size={14} />
        </MenuButton>
      </div>
    </div>
  )
}

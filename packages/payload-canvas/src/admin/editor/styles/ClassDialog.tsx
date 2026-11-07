'use client'

// The class dialogs: "New class from this block's styles", Rename, Delete and Remove unused. Payload's own
// ConfirmationModal and TextInput, as the saved section dialogs. A refused name (taken, a Tailwind
// class) opens the dialog again with the name and the reason.

import { ConfirmationModal, TextInput, useModal } from '@payloadcms/ui'
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react'

import { bareClass, classNameProblem, classTokens, plural, type ClassUsage } from '../../../classes/shared'
import { findBlock } from '../../../core'
import type { ClassDialog as Dialog } from '../classes/controller'
import { useRuntime, type Runtime } from '../runtime'
import { useModalA11y } from '../ui/modalA11y'
import { useValue } from '../valueStore'

const MODAL_SLUG = 'builder-class-dialog'

/** Mounted with the Styles panel. Opens Payload's modal whenever a class dialog is requested. */
export function ClassDialog() {
  const runtime = useRuntime()
  const dialog = useValue(runtime.classes!.dialog)
  const { openModal } = useModal()

  useEffect(() => {
    if (dialog) openModal(MODAL_SLUG)
  }, [dialog, openModal])

  if (!dialog) return null
  // A new request (or the same one with an error) starts with fresh fields.
  return <DialogContent key={`${dialog.kind}:${'id' in dialog ? dialog.id : 'blockId' in dialog ? dialog.blockId : ''}:${dialog.error ?? ''}`} dialog={dialog} />
}

/** The block's (or part's) classes, split into editable classes (they stay) and the rest (they move into the new class). */
function splitBlockClasses(runtime: Runtime, blockId: string, part: string | null) {
  const block = findBlock(runtime.store.getState().layout, blockId)
  const current = (part ? block?.partClassName?.[part] : block?.className) ?? ''
  const keep: string[] = []
  const move: string[] = []
  for (const token of classTokens(current)) (runtime.classes?.byName(bareClass(token)) ? keep : move).push(token)
  return { keep, move }
}

/** "Home", "About" and 3 more. */
function pagesText(usage: ClassUsage | undefined): string {
  const docs = usage?.documents ?? []
  const names = docs.slice(0, 3).map((d) => `“${d.title}”`)
  return docs.length > 3 ? `${names.join(', ')} and ${docs.length - 3} more` : names.join(', ')
}

function DialogContent({ dialog }: { dialog: Dialog }) {
  const runtime = useRuntime()
  const classes = runtime.classes!
  const usage = useValue(classes.usage)
  const { closeModal } = useModal()
  const item = 'id' in dialog ? classes.byId(dialog.id) : undefined
  const [name, setName] = useState(dialog.name ?? (dialog.kind === 'rename' ? (item?.name ?? '') : ''))
  const [label, setLabel] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  useModalA11y(MODAL_SLUG, { alert: dialog.kind === 'delete' || dialog.kind === 'remove-unused' })

  useEffect(() => {
    const frame = requestAnimationFrame(() => nameRef.current?.select())
    return () => cancelAnimationFrame(frame)
  }, [])

  const close = () => classes.dialog.set(null)
  /** Opens the dialog again after Payload's modal closes, with the name and the reason. */
  const again = (error: string): void => {
    window.setTimeout(() => classes.dialog.set({ ...dialog, name, error }), 0)
  }

  /** Runs the action. Never throws: Payload's modal would stay stuck on its busy label. */
  const confirm = async () => {
    if (busy.current) return
    busy.current = true
    try {
      if (dialog.kind === 'remove-unused') {
        close()
        const result = await classes.removeUnused()
        if (typeof result === 'string') runtime.warn(`The unused classes were not removed: ${result}`)
        else runtime.notify(`Deleted ${plural(result.deleted.length, 'unused class', 'unused classes')}${result.failed > 0 ? `. ${plural(result.failed, 'class', 'classes')} could not be deleted` : ''}.`)
        return
      }
      if (dialog.kind === 'delete') {
        close()
        if (!item) return
        const result = await classes.remove(item.id)
        if (typeof result === 'string') runtime.warn(`.${item.name} was not deleted: ${result}`)
        else runtime.notify(`Deleted .${item.name}${result.blocks > 0 ? ` and removed it from ${plural(result.blocks, 'block')}` : ''}.`)
        return
      }
      const next = name.trim()
      const problem = classNameProblem(next) ?? (classes.byName(next) && classes.byName(next) !== item ? `A class named “${next}” already exists.` : null)
      if (problem) {
        again(problem)
        return
      }
      if (dialog.kind === 'rename') {
        if (!item || next === item.name) return close()
        const result = await classes.rename(item.id, next)
        if (typeof result === 'string') return again(result)
        close()
        runtime.notify(`Renamed to .${next} on ${plural(result.blocks, 'block')}${result.failed > 0 ? `. ${plural(result.failed, 'page')} could not be changed` : ''}.`)
        return
      }
      // New class from the block's styles: its utilities move into the class; the block gets the class.
      const { keep, move } = splitBlockClasses(runtime, dialog.blockId, dialog.part)
      const created = await classes.create({ name: next, label: label.trim() || null, styles: move.join(' ') })
      if (typeof created === 'string') return again(created)
      const className = [...keep, created.name].join(' ')
      const op = dialog.part
        ? ({ type: 'update', id: dialog.blockId, partClassName: { [dialog.part]: className } } as const)
        : ({ type: 'update', id: dialog.blockId, className } as const)
      runtime.store.apply(op)
      classes.target.set(created.id)
      close()
      runtime.notify(`Created .${created.name}. Add it to other blocks in their Classes box.`)
    } finally {
      busy.current = false
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void confirm().then(() => closeModal(MODAL_SLUG))
  }

  const error = dialog.error ? (
    <p className="builder-classes__dialog-error" role="alert">
      {dialog.error}
    </p>
  ) : null

  if (dialog.kind === 'remove-unused') {
    const names = dialog.names.map((n) => `.${n}`)
    return (
      <ConfirmationModal
        modalSlug={MODAL_SLUG}
        heading={`Delete ${plural(names.length, 'unused class', 'unused classes')}?`}
        body={`No page uses ${names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more` : names.join(', ')}. A class still on a published page stays.`}
        confirmLabel="Delete classes"
        confirmingLabel="Deleting…"
        onConfirm={confirm}
        onCancel={close}
      />
    )
  }

  if (dialog.kind === 'delete') {
    const used = item ? usage?.[item.name] : undefined
    return (
      <ConfirmationModal
        modalSlug={MODAL_SLUG}
        heading={`Delete .${item?.name ?? 'class'}?`}
        body={
          used && used.blocks > 0
            ? `It is removed from ${plural(used.blocks, 'block')} on ${plural(used.documents.length, 'page')} (${pagesText(used)}), in their drafts. Published pages lose these styles now.`
            : 'No block uses it. Its version history is deleted too.'
        }
        confirmLabel="Delete class"
        confirmingLabel="Deleting…"
        onConfirm={confirm}
        onCancel={close}
      />
    )
  }

  const renaming = dialog.kind === 'rename'
  const used = renaming && item ? usage?.[item.name] : undefined
  const styles = renaming ? [] : splitBlockClasses(runtime, dialog.blockId, dialog.part).move
  return (
    <ConfirmationModal
      modalSlug={MODAL_SLUG}
      className="builder-classes__dialog"
      heading={renaming ? `Rename .${item?.name ?? 'class'}` : 'New class'}
      body={
        <div className="builder-classes__dialog-fields">
          <p className="builder-classes__dialog-intro">
            {renaming
              ? used && used.blocks > 0
                ? `Renames it on ${plural(used.blocks, 'block')} on ${plural(used.documents.length, 'page')}, in their drafts. Published pages keep their look until they are published again.`
                : 'No block uses it yet.'
              : styles.length > 0
                ? `Moves this ${dialog.part ? 'part' : 'block'}’s classes into the new class, and gives it the class. Use the class on other blocks to share the look.`
                : 'Starts an empty class and gives it to this block. Its styles change every block that uses it.'}
          </p>
          {!renaming && styles.length > 0 && <code className="builder-classes__dialog-styles">{styles.join(' ')}</code>}
          <TextInput
            path="builderClassName"
            label="Class name"
            required
            placeholder="For example card or btn-primary"
            value={name}
            inputRef={nameRef as RefObject<HTMLInputElement>}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {error}
          {!renaming && (
            <TextInput
              path="builderClassLabel"
              label="Label (optional)"
              placeholder="For example Feature card"
              value={label}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
              onKeyDown={onKeyDown}
            />
          )}
        </div>
      }
      confirmLabel={renaming ? 'Rename' : 'Create class'}
      confirmingLabel={renaming ? 'Renaming…' : 'Creating…'}
      onConfirm={confirm}
      onCancel={close}
    />
  )
}

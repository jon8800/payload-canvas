'use client'

// The saved section dialogs: "Save as section…" (name and category), rename and delete.
// Payload's own ConfirmationModal and TextInput, so they look like the rest of the admin.

import { ConfirmationModal, TextInput, useModal } from '@payloadcms/ui'
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react'

import type { Block, SectionDefinition } from '../../../core/types'
import { blockName } from '../names'
import { useRuntime, type Runtime } from '../runtime'
import { useModalA11y } from '../ui/modalA11y'
import { useValue } from '../valueStore'
import type { SectionDialog as Dialog } from './controller'

const MODAL_SLUG = 'builder-section-dialog'

/** Opens "Save as section…" for a block (with everything inside it). */
export function requestSaveSection(runtime: Runtime, block: Block) {
  runtime.sections.dialog.set({ kind: 'save', block, name: blockName(block, runtime.blockLabel(block.type)) })
}

export function requestRenameSection(runtime: Runtime, section: SectionDefinition) {
  runtime.sections.dialog.set({ kind: 'rename', section })
}

export function requestDeleteSection(runtime: Runtime, section: SectionDefinition) {
  runtime.sections.dialog.set({ kind: 'delete', section })
}

/** Mounted once in the editor. Opens Payload's modal whenever a dialog is requested. */
export function SectionDialog() {
  const runtime = useRuntime()
  const dialog = useValue(runtime.sections.dialog)
  const { openModal } = useModal()

  useEffect(() => {
    if (dialog) openModal(MODAL_SLUG)
  }, [dialog, openModal])

  if (!dialog) return null
  // A new request starts with fresh fields.
  return <DialogContent key={dialogKey(dialog)} dialog={dialog} />
}

function dialogKey(dialog: Dialog): string {
  return dialog.kind === 'save' ? `save:${dialog.block.id}:${dialog.name}` : `${dialog.kind}:${dialog.section.id}`
}

function DialogContent({ dialog }: { dialog: Dialog }) {
  const runtime = useRuntime()
  const { closeModal } = useModal()
  const initial = dialog.kind === 'save' ? dialog.name : dialog.section.label
  const [name, setName] = useState(initial)
  const [category, setCategory] = useState(dialog.kind === 'save' ? '' : (dialog.section.category ?? ''))
  const nameRef = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  // Named by its heading; Delete is an alert dialog.
  useModalA11y(MODAL_SLUG, { alert: dialog.kind === 'delete' })

  useEffect(() => {
    // After the modal's open animation starts.
    const frame = requestAnimationFrame(() => nameRef.current?.select())
    return () => cancelAnimationFrame(frame)
  }, [])

  const close = () => {
    runtime.sections.dialog.set(null)
  }

  /** Runs the dialog's action. Never throws: Payload's modal would stay stuck on "Saving…". */
  const confirm = async () => {
    if (busy.current) return
    busy.current = true
    try {
      if (dialog.kind === 'save') {
        const result = await runtime.sections.save(dialog.block, name, category)
        if (typeof result === 'string') runtime.warn(`The section was not saved: ${result}`)
        else runtime.notify(`Saved “${result.label}”. It is in the Sections tab, under Saved.`)
      } else if (dialog.kind === 'rename') {
        const result = await runtime.sections.rename(dialog.section, name, category)
        if (typeof result === 'string') runtime.warn(`The section was not renamed: ${result}`)
        else runtime.notify(`Renamed to “${result.label}”`)
      } else {
        const result = await runtime.sections.remove(dialog.section)
        if (result === true) runtime.notify(`Deleted “${dialog.section.label}”`)
        else runtime.warn(`The section was not deleted: ${result}`)
      }
    } finally {
      busy.current = false
      close()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void confirm().then(() => closeModal(MODAL_SLUG))
  }

  if (dialog.kind === 'delete') {
    return (
      <ConfirmationModal
        modalSlug={MODAL_SLUG}
        heading="Delete this section?"
        body={`“${dialog.section.label}” is removed from Saved sections for everyone. Pages that already use it keep their copy.`}
        confirmLabel="Delete"
        confirmingLabel="Deleting…"
        onConfirm={confirm}
        onCancel={close}
      />
    )
  }

  const saving = dialog.kind === 'save'
  return (
    <ConfirmationModal
      modalSlug={MODAL_SLUG}
      className="builder-section-dialog"
      heading={saving ? 'Save as section' : 'Rename section'}
      body={
        <div className="builder-section-dialog__fields">
          {saving && (
            <p className="builder-section-dialog__intro">
              Saves a copy of this block and everything inside it. Everyone who edits pages finds it in the Sections tab, under Saved.
            </p>
          )}
          <TextInput
            path="builderSectionName"
            label="Name"
            required
            value={name}
            inputRef={nameRef as RefObject<HTMLInputElement>}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <TextInput
            path="builderSectionCategory"
            label="Category (optional)"
            placeholder="For example Heroes or Pricing"
            value={category}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCategory(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      }
      confirmLabel={saving ? 'Save section' : 'Rename'}
      confirmingLabel={saving ? 'Saving…' : 'Renaming…'}
      onConfirm={confirm}
      onCancel={close}
    />
  )
}

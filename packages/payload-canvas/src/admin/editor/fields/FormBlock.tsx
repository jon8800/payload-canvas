'use client'

// Forms on pages, in the inspector:
// - `FormBlockActions` (`admin.custom.builderFormActions` on the Form block): for a saved form,
//   "Edit form" (the form builder) and "Move into this page" (its fields become blocks inside this
//   Form block); for a form built here, where its answers go.
// - `FieldNameNote` (`admin.custom.builderFieldName` on a form field's `name`): renaming a field of
//   a form that has submissions warns that the old submissions keep the old name.

import { Button, useConfig } from '@payloadcms/ui'
import { useEffect, useState, type ReactNode } from 'react'

import { uniquePropValuesAt, withUniqueProps } from '../../../core/uniqueProps'
import { findBlock } from '../../../core/tree'
import type { Block, Operation } from '../../../core/types'
import { FORM_SLOT, formBlockMode, formIdOf } from '../../../forms/pageForms'
import { formSourceOf, movedFormLook } from '../../../forms/pageSync'
import { getBlockDefinition } from '../../../core/blocks'
import { builderViewPath } from '../../../plugin/links'
import { withNewIds } from '../actions'
import { propPathOf } from '../live/field'
import { useRuntime, type Runtime } from '../runtime'
import { useEditor } from '../store'
import { formBlockAround } from './FormFieldName'

export { FIELD_NAME_MARKER } from '../../../forms/blocks'

/** Path of the claim endpoint under the live path (plugin/formsSync.ts). */
const FORM_CLAIM_PATH = 'form-claim'

type ClaimResponse = { ok: true; kept: boolean; props: Record<string, unknown>; children: Block[] } | { ok: false; error: string }

/** The number of submissions of a form, or null while it loads or when it cannot be read. */
function useSubmissionCount(runtime: Runtime, formId: string | number | null): number | null {
  const submissions = runtime.config.forms?.submissions ?? null
  const [count, setCount] = useState<{ id: string | number; total: number } | null>(null)
  useEffect(() => {
    if (formId === null || !submissions) return
    const controller = new AbortController()
    const url = `${runtime.api}/${submissions}?where[form][equals]=${encodeURIComponent(String(formId))}&limit=1&depth=0`
    fetch(url, { credentials: 'include', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { totalDocs?: unknown } | null) => {
        if (typeof body?.totalDocs === 'number') setCount({ id: formId, total: body.totalDocs })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [formId, submissions, runtime.api])
  return count && formId !== null && count.id === formId ? count.total : null
}

/** "Move into this page": the saved form's fields and settings become this Form block's own. One undo step. */
async function moveIntoPage(runtime: Runtime, blockId: string, formId: string | number): Promise<void> {
  const { collection, id } = runtime.doc.meta.get()
  let body: ClaimResponse
  try {
    const response = await fetch(`${runtime.config.liveEndpoint}/${collection}/${encodeURIComponent(id)}/${FORM_CLAIM_PATH}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block: blockId, form: formId }),
    })
    body = (await response.json()) as ClaimResponse
  } catch {
    runtime.warn('The form could not be moved. Check your connection and try again.')
    return
  }
  if (!body.ok) {
    runtime.warn(body.error)
    return
  }
  const { layout } = runtime.store.getState()
  const form = findBlock(layout, blockId)
  if (!form) return
  // New ids (two blocks may move the same form in), and names free among the fields already here.
  const taken = uniquePropValuesAt(layout, blockId, runtime.config.blocks)
  const children = body.children.map((child) => withUniqueProps(withNewIds(child), runtime.config.blocks, taken))
  const start = form.slots?.[FORM_SLOT]?.length ?? 0
  const unset = body.kept ? [] : ['form']
  // A block that was only a box around the saved form gets the Form block's layout and part classes.
  const look = movedFormLook(form, getBlockDefinition(runtime.config.blocks, form.type))
  const ops: Operation[] = [
    { type: 'update', id: blockId, props: body.props, ...(unset.length > 0 ? { unsetProps: unset } : {}), ...look },
    ...children.map((block, i): Operation => ({ type: 'insert', block, to: { parentId: blockId, slot: FORM_SLOT, index: start + i } })),
  ]
  if (!runtime.store.apply(ops, { select: blockId })) return
  runtime.notify(
    body.kept
      ? 'The form is now part of this page. Publish the page to save changes to it; its submissions stay.'
      : 'Copied the form into this page. Other pages use the saved form, so this page gets its own form when you publish.',
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="builder-field-note">{children}</p>
}

/** The Form block's actions, under its mode. */
export function FormBlockActions({ path }: { path: string }) {
  const runtime = useRuntime()
  const { config } = useConfig()
  const blockId = propPathOf(path)?.blockId ?? ''
  const block = useEditor(runtime.store, (s) => findBlock(s.view, blockId))
  const mode = formBlockMode(block?.props)
  const formId = formIdOf(block?.props?.form)
  const count = useSubmissionCount(runtime, formId)
  const [busy, setBusy] = useState(false)
  const forms = runtime.config.forms
  if (!block || !forms) return null
  const admin = config.routes.admin === '/' ? '' : config.routes.admin
  const answers =
    count === null ? null : count === 0 ? 'No submissions yet.' : `${count} ${count === 1 ? 'submission' : 'submissions'} so far.`
  const submissionsLink =
    formId !== null && forms.submissions ? `${admin}/collections/${forms.submissions}?where[form][equals]=${encodeURIComponent(String(formId))}` : null

  if (mode === 'build') {
    return (
      <div className="builder-form-actions">
        <Note>
          {formId === null
            ? 'Visitors can send this form once the page is published. Publishing saves it to Forms.'
            : `Publishing the page saves changes to this form (Forms #${String(formId)}). ${answers ?? ''}`}
        </Note>
        {submissionsLink && count ? (
          <Button el="link" url={submissionsLink} newTab buttonStyle="secondary" size="small" margin={false}>
            View submissions
          </Button>
        ) : null}
      </div>
    )
  }
  if (formId === null) return null
  return (
    <div className="builder-form-actions">
      {answers ? <Note>{answers}</Note> : null}
      <div className="builder-form-actions__row">
        <Button el="link" url={builderViewPath(config.routes.admin, forms.collection, formId)} newTab buttonStyle="secondary" size="small" margin={false}>
          Edit form
        </Button>
        <Button
          buttonStyle="secondary"
          size="small"
          margin={false}
          disabled={busy}
          tooltip="Its fields become blocks in this form, so you edit them here"
          onClick={() => {
            setBusy(true)
            void moveIntoPage(runtime, blockId, formId).finally(() => setBusy(false))
          }}
        >
          Move into this page
        </Button>
      </div>
    </div>
  )
}

/**
 * Under a form field's name: renaming a field of a form with submissions keeps the old
 * submissions under the old name. Compares with the name the field had when it was selected.
 */
export function FieldNameNote({ path, value, children }: { path: string; value: unknown; children: ReactNode }) {
  const runtime = useRuntime()
  const blockId = propPathOf(path)?.blockId ?? ''
  // The name when the field was selected (the inspector remounts per block).
  const [first] = useState(value)
  const form = useEditor(runtime.store, (s) => formBlockAround(s.view, blockId))
  const forms = runtime.config.forms
  // On a page: the Form block's form. In the form builder: the open form itself.
  const meta = runtime.doc.meta.get()
  const formId = form ? formIdOf(form.props?.form) : forms && meta.collection === forms.collection ? meta.id : null
  const count = useSubmissionCount(runtime, formId)
  const renamed = typeof first === 'string' && first !== '' && value !== first
  return (
    <>
      {children}
      {renamed && count ? (
        <p className="builder-field-note builder-field-note--warning">
          This form has {count} {count === 1 ? 'submission' : 'submissions'}. They keep the old name “{String(first)}”; new ones use the new name.
        </p>
      ) : null}
    </>
  )
}

type SourceInfo = { collection: string; document: string; title: string | null }

/**
 * In the form builder: a form built on a page says so, with a link to that page, because the
 * page's next publish of a change to the form writes its own version over changes made here.
 */
export function FormSourceNote() {
  const runtime = useRuntime()
  const { config } = useConfig()
  const forms = runtime.config.forms
  const meta = runtime.doc.meta.get()
  const isForm = Boolean(forms && meta.collection === forms.collection)
  const [source, setSource] = useState<SourceInfo | null>(null)
  useEffect(() => {
    if (!isForm || !forms) return
    const controller = new AbortController()
    const load = async () => {
      const response = await fetch(`${runtime.api}/${forms.collection}/${encodeURIComponent(meta.id)}?depth=0`, { credentials: 'include', signal: controller.signal })
      const doc = response.ok ? ((await response.json()) as Record<string, unknown>) : null
      const own = doc ? formSourceOf(doc) : null
      if (!own) return
      const page = await fetch(`${runtime.api}/${own.collection}/${encodeURIComponent(own.document)}?depth=0&draft=true`, { credentials: 'include', signal: controller.signal })
      const pageDoc = page.ok ? ((await page.json()) as Record<string, unknown>) : null
      const title = typeof pageDoc?.title === 'string' && pageDoc.title ? pageDoc.title : null
      setSource({ collection: own.collection, document: own.document, title })
    }
    load().catch(() => {})
    return () => controller.abort()
  }, [isForm, forms, meta.id, runtime.api])
  if (!source) return null
  return (
    <div className="builder-form-actions builder-form-actions--source">
      <p className="builder-field-note builder-field-note--warning">
        This form is built on the page {source.title ? `“${source.title}”` : `#${source.document}`}. Edit it there: when that page publishes a change to this form, it replaces changes made here.
      </p>
      <Button el="link" url={builderViewPath(config.routes.admin, source.collection, source.document)} buttonStyle="secondary" size="small" margin={false}>
        Open the page
      </Button>
    </div>
  )
}

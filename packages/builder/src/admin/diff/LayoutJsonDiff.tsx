'use client'
// "Show JSON" under the builder layout diff: Payload's own word diff of both layouts as pretty
// JSON, old on the left and new on the right. Built only when someone opens it.

import { escapeDiffHTML, getHTMLDiffComponents, unescapeDiffHTML } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

import './layoutDiff.scss'

function jsonHTML(value: unknown): string {
  return `<p><pre>${escapeDiffHTML(JSON.stringify(value ?? null, null, 2))}</pre></p>`
}

export function LayoutJsonDiff({ from, to }: { from: unknown; to: unknown }) {
  const [open, setOpen] = useState(false)
  const diff = useMemo(
    () =>
      open
        ? getHTMLDiffComponents({ fromHTML: jsonHTML(from), toHTML: jsonHTML(to), postProcess: unescapeDiffHTML, tokenizeByCharacter: false })
        : null,
    [open, from, to],
  )
  return (
    <details className="layout-diff__json" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="layout-diff__json-summary">Show JSON</summary>
      {diff ? (
        <div className="layout-diff__json-content">
          {diff.From}
          {diff.To}
        </div>
      ) : null}
    </details>
  )
}

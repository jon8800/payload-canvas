'use client'

import type { DefaultCellComponentProps } from 'payload'

// Payload's list view sends `changed` for a published document with newer draft changes.
const LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  changed: 'Changed',
}

/** The Status column in list views: a coloured badge for Draft, Published or Changed. */
export function StatusCell({ cellData }: DefaultCellComponentProps) {
  const status = typeof cellData === 'string' ? cellData : null
  if (!status) return null
  // The wrapper keeps Payload's line clamp for spans in list cells off the badge.
  return (
    <div className="status-cell">
      <span className={`status-badge status-badge--${status}`}>{LABELS[status] ?? status}</span>
    </div>
  )
}

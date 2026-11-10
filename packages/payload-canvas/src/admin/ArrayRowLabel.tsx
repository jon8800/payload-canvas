'use client'

import { useRowLabel, useTranslation } from '@payloadcms/ui'
import type { ClientField } from 'payload'

import { textOf } from '../core/fields'
import { rowLabel } from '../core/rowLabel'

type Props = {
  /** The array field, sent by Payload to every RowLabel component. */
  readonly field?: ClientField
}

/**
 * A row label for any Payload array field: the row's most telling value ("Sales team (sales)"),
 * else "Item 1" with the field's singular label. The same rule names rows in the builder's
 * inspector (`rowLabel` in `payload-canvas/core`). Set it as `admin.components.RowLabel`.
 */
export function ArrayRowLabel({ field }: Props) {
  const { data, rowNumber } = useRowLabel<Record<string, unknown>>()
  const { i18n } = useTranslation()
  const fields = field && 'fields' in field ? field.fields : []
  const labels = field && 'labels' in field ? field.labels : undefined
  const singular = labels?.singular as unknown
  // A label is a string or one string per language.
  const name = typeof singular === 'object' && singular ? ((singular as Record<string, unknown>)[i18n.language] ?? singular) : singular
  // Payload's row number here is the 0-based row index.
  return (
    <span className="row-label" style={{ pointerEvents: 'none' }}>
      {rowLabel(data, fields, rowNumber ?? 0, textOf(name))}
    </span>
  )
}

'use client'

import { Link, useConfig, useTranslation } from '@payloadcms/ui'
import { Check } from 'lucide-react'
import type { ClientBlock, ClientField, DefaultCellComponentProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import type { ReactNode } from 'react'

import { countText, excerpt, formatCellDate, jsonSummary, labelText, richTextExcerpt, type DateAppearance } from './cells'

type Option = string | { label: unknown; value: string }

function Empty() {
  return (
    <span className="field-cell-empty" aria-label="Empty">
      —
    </span>
  )
}

function Chips({ items }: { readonly items: string[] }) {
  return (
    <span className="field-cell-chips">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="field-cell-chip">
          {item}
        </span>
      ))}
    </span>
  )
}

const toList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value])

/** The option labels of a select or radio value. Unknown values show as they are. */
function optionLabels(options: readonly Option[] | undefined, value: unknown, language: string): string[] {
  return toList(value).map((item) => {
    const option = options?.find((entry) => (typeof entry === 'string' ? entry : entry.value) === item)
    if (option === undefined) return String(item)
    return typeof option === 'string' ? option : labelText(option.label, language) || option.value
  })
}

/** "3 links" from the field's labels, or "3 rows". */
function rowCount(field: ClientField, count: number, language: string): string {
  const labels = 'labels' in field ? field.labels : undefined
  return countText(count, labelText(labels?.singular, language) || 'row', labelText(labels?.plural, language) || 'rows')
}

function CellContent({ cellData, field }: { readonly cellData: unknown; readonly field: ClientField }) {
  const { i18n } = useTranslation()
  const { config } = useConfig()

  switch (field.type) {
    case 'checkbox':
      return cellData === true ? (
        <span className="field-cell-check" title="Yes">
          <Check aria-hidden size={16} strokeWidth={2.25} />
          <span className="field-cell-sr">Yes</span>
        </span>
      ) : (
        <span className="field-cell-empty" title="No">
          —<span className="field-cell-sr">No</span>
        </span>
      )
    case 'select':
    case 'radio': {
      const labels = optionLabels(field.options as Option[], cellData, i18n.language)
      return labels.length ? <Chips items={labels} /> : <Empty />
    }
    case 'date': {
      const appearance = ((field.admin as { date?: { pickerAppearance?: DateAppearance } } | undefined)?.date?.pickerAppearance ?? 'dayAndTime')
      const text = formatCellDate(cellData, appearance, i18n.language)
      if (!text) return <Empty />
      return (
        <time className="field-cell-date" dateTime={String(cellData)} title={formatCellDate(cellData, 'dayAndTime', i18n.language)} suppressHydrationWarning>
          {text}
        </time>
      )
    }
    case 'array': {
      const count = Array.isArray(cellData) ? cellData.length : 0
      return count ? <span className="field-cell-count">{rowCount(field, count, i18n.language)}</span> : <Empty />
    }
    case 'blocks': {
      const rows = Array.isArray(cellData) ? (cellData as Array<{ blockType?: string }>) : []
      if (!rows.length) return <Empty />
      const shared = config.blocksMap as Record<string, ClientBlock | undefined> | undefined
      const blocks = [...(field.blocks ?? []), ...(field.blockReferences ?? []).map((slug) => (typeof slug === 'string' ? shared?.[slug] : slug))]
      const names = [...new Set(rows.map((row) => blocks.find((block) => block?.slug === row.blockType)))]
        .map((block) => (block ? labelText(block.labels?.singular, i18n.language) || block.slug : ''))
        .filter(Boolean)
      return (
        <span className="field-cell-count">
          {rowCount(field, rows.length, i18n.language)}
          {names.length > 0 && <span className="field-cell-muted">{excerpt(names.join(', '), 60)}</span>}
        </span>
      )
    }
    case 'json': {
      const text = jsonSummary(cellData)
      return text ? <span className="field-cell-muted">{text}</span> : <Empty />
    }
    case 'richText': {
      const text = richTextExcerpt(cellData)
      return text ? <span className="field-cell-text">{text}</span> : <Empty />
    }
    case 'point': {
      const [lng, lat] = Array.isArray(cellData) ? cellData : []
      return typeof lng === 'number' && typeof lat === 'number' ? <span>{`${lat}, ${lng}`}</span> : <Empty />
    }
    case 'text':
    case 'number':
    case 'email': {
      const items = toList(cellData).map(String).filter((item) => item.trim())
      if (!items.length) return <Empty />
      return Array.isArray(cellData) ? <Chips items={items} /> : <span>{items[0]}</span>
    }
    default:
      return cellData === null || cellData === undefined || cellData === '' ? <Empty /> : <span>{String(cellData)}</span>
  }
}

/**
 * A list cell for common field types, in place of Payload's stock cells that show raw values
 * (`true` in a code font, JSON text, rich text with `[upload]` markers). `listCells()` sets it on
 * every field of those types that has no Cell of its own. The first column links to the document.
 */
export function FieldCell({ cellData, collectionSlug, field, link, linkURL, rowData, viewType }: DefaultCellComponentProps) {
  const { config } = useConfig()
  const content: ReactNode = <CellContent cellData={cellData} field={field} />
  // A div: Payload clamps spans and links placed directly in a list cell, which breaks chips and counts.
  if (!link) return <div className="field-cell">{content}</div>
  const href =
    linkURL ??
    formatAdminURL({
      adminRoute: config.routes.admin,
      path: `/collections/${collectionSlug}${viewType === 'trash' ? '/trash' : ''}/${encodeURIComponent(String(rowData.id))}`,
    })
  return (
    <div className="field-cell">
      <Link href={href} prefetch={false}>
        {content}
      </Link>
    </div>
  )
}

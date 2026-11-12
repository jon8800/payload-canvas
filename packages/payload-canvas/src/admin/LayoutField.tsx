'use client'

import { Button, FieldLabel, useConfig, useDocumentDrawerContext, useDocumentInfo, useField } from '@payloadcms/ui'
import type { JSONFieldClientProps } from 'payload'
import { use } from 'react'

import { normalizeLayout, walkBlocks } from '../core'
import type { BuilderClientConfig } from '../core/types'
import { builderViewPath } from '../plugin/links'
import { blockSummary } from './editor/names'
import { SettingsDrawerSlug } from './editor/topbar/settingsDrawer'
import { forgetForm } from './formChoice'
import './layoutField.css'

/** Top-level blocks named in the summary. */
const SUMMARY_SECTIONS = 5

function readConfig(props: JSONFieldClientProps): BuilderClientConfig | null {
  const custom = props.field.admin?.custom as { builder?: BuilderClientConfig } | undefined
  return custom?.builder ?? null
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Field component of the layout JSON field: the page's sections in a box, with an "Open builder"
 * button. The builder itself opens full screen (`{admin}/builder/:collection/:id`). Inside the
 * builder's own settings drawer it renders nothing: the builder is already open.
 */
export function LayoutField(props: JSONFieldClientProps) {
  const settingsSlug = use(SettingsDrawerSlug)
  const { drawerSlug } = useDocumentDrawerContext()
  if (settingsSlug !== null && drawerSlug === settingsSlug) return null
  return <LayoutSummary {...props} />
}

function LayoutSummary(props: JSONFieldClientProps) {
  const config = readConfig(props)
  const path = props.path ?? config?.field ?? props.field.name
  const { value } = useField<unknown>({ path })
  const { id, collectionSlug } = useDocumentInfo()
  const {
    config: { routes },
  } = useConfig()
  const label = typeof props.field.label === 'string' ? props.field.label : 'Layout'

  if (!config) {
    return <p className="builder-summary__error">Builder config missing on field “{props.field.name}” (admin.custom.builder).</p>
  }

  const layout = normalizeLayout(value)
  let total = 0
  walkBlocks(layout, () => {
    total++
  })
  const labelOf = (type: string) => config.blocks.find((b) => b.type === type)?.label ?? type
  const names = layout.blocks.slice(0, SUMMARY_SECTIONS).map((block) => blockSummary(block, labelOf(block.type)))
  const more = layout.blocks.length - names.length
  const saved = id !== undefined && id !== null && id !== ''
  const collection = collectionSlug ?? config.collection

  return (
    <div className="field-type builder-summary">
      <FieldLabel label={label} path={path} />
      <div className="builder-summary__box">
        <div className="builder-summary__head">
          <p className="builder-summary__count">
            {total === 0
              ? 'No blocks yet'
              : `${count(layout.blocks.length, 'section', 'sections')} · ${count(total, 'block', 'blocks')}`}
          </p>
          {saved && (
            <Button
              buttonStyle="primary"
              el="link"
              size="medium"
              margin={false}
              url={builderViewPath(routes.admin, collection, id)}
              onClick={() => forgetForm(collection, id)}
            >
              Open builder
            </Button>
          )}
        </div>
        {names.length > 0 && (
          <ol className="builder-summary__list">
            {names.map((name, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- names can repeat; the order is the identity
              <li key={i}>{name}</li>
            ))}
          </ol>
        )}
        {more > 0 && <p className="builder-summary__more">and {count(more, 'more section', 'more sections')}</p>}
      </div>
      {!saved && <p className="field-description">Save the document first. Then you can open the builder.</p>}
    </div>
  )
}

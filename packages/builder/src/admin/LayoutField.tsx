'use client'

import { Button, FieldLabel, useConfig, useDocumentDrawerContext, useDocumentInfo, useField } from '@payloadcms/ui'
import type { JSONFieldClientProps } from 'payload'
import { use } from 'react'

import { normalizeLayout, walkBlocks } from '../core'
import type { BuilderClientConfig } from '../core/types'
import { builderViewPath } from '../plugin/links'
import { blockSummary } from './editor/names'
import { SettingsDrawerSlug } from './editor/topbar/settingsDrawer'
import './editor/editor.scss'

/** Top-level blocks named in the summary. */
const SUMMARY_SECTIONS = 4

function readConfig(props: JSONFieldClientProps): BuilderClientConfig | null {
  const custom = props.field.admin?.custom as { builder?: BuilderClientConfig } | undefined
  return custom?.builder ?? null
}

/**
 * Field component of the layout JSON field: a compact summary of the page and an "Open builder"
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
  const label = typeof props.field.label === 'string' ? props.field.label : 'Layout'

  return (
    <div className="field-type builder-summary">
      <FieldLabel label={label} path={path} />
      <div className="builder-summary__box">
        <div className="builder-summary__body">
          <p className="builder-summary__text">
            {total === 0
              ? 'The page is empty.'
              : `${layout.blocks.length} ${layout.blocks.length === 1 ? 'section' : 'sections'}, ${total} ${total === 1 ? 'block' : 'blocks'} in total.`}
          </p>
          {names.length > 0 && (
            <ul className="builder-summary__list">
              {names.map((name, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- names can repeat; the order is the identity
                <li key={i}>{name}</li>
              ))}
              {more > 0 && <li className="builder-summary__more">and {more} more</li>}
            </ul>
          )}
        </div>
        {saved ? (
          <Button buttonStyle="primary" el="link" size="medium" margin={false} url={builderViewPath(routes.admin, collectionSlug ?? config.collection, id)}>
            Open builder
          </Button>
        ) : (
          <p className="builder-summary__text">Save the document first. Then you can open the builder.</p>
        )}
      </div>
    </div>
  )
}

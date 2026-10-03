'use client'

import { Button, FieldLabel, useConfig, useDocumentInfo, useField } from '@payloadcms/ui'
import { use } from 'react'
import type { JSONFieldClientProps } from 'payload'

import { normalizeLayout, walkBlocks } from '../core'
import type { BuilderClientConfig } from '../core/types'
import { BuilderTabContext } from './context'
import { Editor } from './editor/Editor'
import './editor/editor.scss'

function readConfig(props: JSONFieldClientProps): BuilderClientConfig | null {
  const custom = props.field.admin?.custom as { builder?: BuilderClientConfig } | undefined
  return custom?.builder ?? null
}

/**
 * Field component of the layout JSON field.
 * In the builder tab it renders the full editor. In the normal Edit tab it renders a compact,
 * read-only summary with a link to the builder tab.
 */
export function LayoutField(props: JSONFieldClientProps) {
  const inBuilderTab = use(BuilderTabContext)
  const config = readConfig(props)
  const path = props.path ?? config?.field ?? props.field.name

  if (!config) {
    return <p className="builder-summary__error">Builder config missing on field “{props.field.name}” (admin.custom.builder).</p>
  }
  if (inBuilderTab) {
    return (
      <div className="builder-layout-field">
        <Editor config={config} path={path} />
      </div>
    )
  }
  return <LayoutSummary config={config} label={props.field.label} path={path} />
}

function LayoutSummary({ config, label, path }: { config: BuilderClientConfig; label: unknown; path: string }) {
  const { value } = useField<unknown>({ path })
  const { id, collectionSlug } = useDocumentInfo()
  const {
    config: { routes },
  } = useConfig()
  const layout = normalizeLayout(value)

  const counts = new Map<string, number>()
  let total = 0
  walkBlocks(layout, (block) => {
    total++
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1)
  })
  const labelOf = (type: string) => config.blocks.find((b) => b.type === type)?.label ?? type
  const builderUrl = id ? `${routes.admin}/collections/${collectionSlug ?? config.collection}/${id}/builder` : null

  return (
    <div className="field-type builder-summary">
      <FieldLabel label={typeof label === 'string' ? label : 'Layout'} path={path} />
      <div className="builder-summary__box">
        <p className="builder-summary__text">
          {total === 0
            ? 'No blocks yet.'
            : `${total} ${total === 1 ? 'block' : 'blocks'}: ${[...counts]
                .map(([type, count]) => `${count} × ${labelOf(type)}`)
                .join(', ')}`}
        </p>
        {builderUrl ? (
          <Button buttonStyle="secondary" el="link" size="small" url={builderUrl}>
            Open builder
          </Button>
        ) : (
          <p className="builder-summary__text">Save the document to open the builder.</p>
        )}
      </div>
    </div>
  )
}

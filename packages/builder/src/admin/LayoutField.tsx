'use client'

import { Button, FieldLabel, useConfig, useDocumentInfo, useField } from '@payloadcms/ui'
import type { JSONFieldClientProps } from 'payload'

import { normalizeLayout, walkBlocks } from '../core'
import type { BuilderClientConfig } from '../core/types'
import { builderViewPath } from '../plugin/links'
import './editor/editor.scss'

function readConfig(props: JSONFieldClientProps): BuilderClientConfig | null {
  const custom = props.field.admin?.custom as { builder?: BuilderClientConfig } | undefined
  return custom?.builder ?? null
}

/**
 * Field component of the layout JSON field: a compact summary of the blocks and an "Open builder"
 * button. The builder itself opens full screen (`{admin}/builder/:collection/:id`).
 */
export function LayoutField(props: JSONFieldClientProps) {
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

  const counts = new Map<string, number>()
  let total = 0
  walkBlocks(normalizeLayout(value), (block) => {
    total++
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1)
  })
  const labelOf = (type: string) => config.blocks.find((b) => b.type === type)?.label ?? type
  const saved = id !== undefined && id !== null && id !== ''
  const label = typeof props.field.label === 'string' ? props.field.label : 'Layout'

  return (
    <div className="field-type builder-summary">
      <FieldLabel label={label} path={path} />
      <div className="builder-summary__box">
        <p className="builder-summary__text">
          {total === 0
            ? 'No blocks yet.'
            : `${total} ${total === 1 ? 'block' : 'blocks'}: ${[...counts]
                .map(([type, count]) => `${count} × ${labelOf(type)}`)
                .join(', ')}`}
        </p>
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

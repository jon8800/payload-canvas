'use client'

import { useConfig } from '@payloadcms/ui'
import type { ClientField } from 'payload'
import type { ReactNode } from 'react'

import type { BuilderClientConfig } from '../../core/types'
import type { BuilderDocMeta } from '../../live/types'
import { Editor } from '../editor/Editor'
import '../editor/editor.scss'

/** The builder config the plugin put on the collection's layout field (`admin.custom.builder`). */
function builderConfigOf(fields: ClientField[]): BuilderClientConfig | null {
  for (const field of fields) {
    const custom = field.admin?.custom as { builder?: BuilderClientConfig } | undefined
    if (field.type === 'json' && custom?.builder) return custom.builder
  }
  return null
}

/** Client side of the full-screen builder view: finds the collection's builder config, then mounts the editor. */
export function BuilderScreen({ meta, icon }: { meta: BuilderDocMeta; icon: ReactNode }) {
  const { getEntityConfig } = useConfig()
  const config = builderConfigOf(getEntityConfig({ collectionSlug: meta.collection })?.fields ?? [])
  if (!config) {
    return <p className="builder-summary__error">The builder config is missing on the “{meta.collection}” collection.</p>
  }
  return <Editor config={config} meta={meta} icon={icon} />
}

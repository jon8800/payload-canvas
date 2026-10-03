// The Field block: one field of the current document, rendered by the value's type.

import {
  FIELD_VALUE_PROP,
  formatDate,
  isIsoDate,
  isMissing,
  isRichText,
  isUploadDoc,
  titleOf,
  toPlainText,
} from '@payload-toolkit/builder/core'
import type { ComponentType } from 'react'
import { defaultResolveLink } from '../render/link'
import type { BlockComponentProps, ResolveLink } from '../render/types'
import { asText, PlaceholderText } from './placeholder'
import { renderRichText } from './RichText'
import { lines } from './Text'

const isImage = (doc: Record<string, unknown>) =>
  typeof doc.mimeType !== 'string' || doc.mimeType.startsWith('image/')

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

function createField(resolveLink: ResolveLink): ComponentType<BlockComponentProps> {
  return function Field({ props, className, attributes, mode }: BlockComponentProps) {
    const value = props[FIELD_VALUE_PROP]
    if (isMissing(value)) {
      const fallback = asText(props.fallback)
      if (fallback) return <div {...attributes} className={className}>{lines(fallback)}</div>
      if (mode !== 'canvas') return null
      const path = asText(props.path)
      return (
        <div {...attributes} className={className}>
          <PlaceholderText>{path ? `{${path}}` : 'Field'}</PlaceholderText>
        </div>
      )
    }
    if (isRichText(value)) {
      return <div {...attributes} className={className}>{renderRichText(value, resolveLink)}</div>
    }
    if (isUploadDoc(value)) {
      if (!isImage(value)) {
        return (
          <a {...attributes} className={className} href={value.url}>
            {titleOf(value)}
          </a>
        )
      }
      return (
        <img
          {...attributes}
          className={className}
          src={value.url}
          alt={typeof value.alt === 'string' ? value.alt : ''}
          width={asNumber(value.width)}
          height={asNumber(value.height)}
          loading="lazy"
        />
      )
    }
    if (isIsoDate(value)) {
      return (
        <time {...attributes} className={className} dateTime={value}>
          {formatDate(value)}
        </time>
      )
    }
    const text = toPlainText(value) ?? ''
    return <div {...attributes} className={className}>{lines(text)}</div>
  }
}

const byResolver = new WeakMap<ResolveLink, ComponentType<BlockComponentProps>>()

/** One Field component per link resolver (rich text links), so React keeps the component type. */
export function fieldFor(resolveLink: ResolveLink): ComponentType<BlockComponentProps> {
  let component = byResolver.get(resolveLink)
  if (!component) {
    component = createField(resolveLink)
    byResolver.set(resolveLink, component)
  }
  return component
}

/** The Field component with the default link resolver. */
export const Field = fieldFor(defaultResolveLink)

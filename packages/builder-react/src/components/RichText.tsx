// The only default component that imports Payload code: Payload's Lexical JSX converter.
// `RichText` from `@payloadcms/richtext-lexical/react` has no hooks and no client-only code, so it
// renders in server components and inside the client canvas.

import { LinkJSXConverter, RichText as LexicalRichText } from '@payloadcms/richtext-lexical/react'
import type { ComponentType, ReactNode } from 'react'
import { defaultResolveLink } from '../render/link'
import type { BlockComponentProps, ResolveLink } from '../render/types'
import { PlaceholderText } from './placeholder'

type Node = { type?: unknown; text?: unknown; children?: unknown }
type EditorState = { root: Node }

function isEditorState(value: unknown): value is EditorState {
  return typeof value === 'object' && value !== null && typeof (value as { root?: unknown }).root === 'object'
}

function hasContent(node: Node): boolean {
  if (node.type === 'text') return typeof node.text === 'string' && node.text.trim() !== ''
  if (node.type === 'linebreak' || node.type === 'tab') return false
  const children = Array.isArray(node.children) ? (node.children as Node[]) : null
  // Element nodes without children (paragraphs) are empty; leaf nodes (upload, horizontalrule) are content.
  if (!children) return node.type !== 'root' && node.type !== 'paragraph'
  return children.some(hasContent)
}

/** True when the editor holds no text and no non-text node (image, rule, block…). */
export function isEmptyRichText(value: unknown): boolean {
  return !isEditorState(value) || !hasContent(value.root)
}

type LinkNode = { fields?: { doc?: { relationTo?: unknown; value?: unknown } | null } }

function converters(resolveLink: ResolveLink) {
  return ({ defaultConverters }: { defaultConverters: Record<string, unknown> }) => ({
    ...defaultConverters,
    // Internal links use the same resolver as buttons and link blocks.
    ...LinkJSXConverter({
      internalDocToHref: ({ linkNode }: { linkNode: LinkNode }) => {
        const doc = linkNode.fields?.doc
        const reference = doc && typeof doc.relationTo === 'string' ? { relationTo: doc.relationTo, value: doc.value } : null
        return resolveLink({ type: 'reference', reference }) ?? '#'
      },
    }),
  })
}

const convertersByResolver = new WeakMap<ResolveLink, ReturnType<typeof converters>>()

/** Lexical rich text as React elements, with internal links resolved by `resolveLink`. No wrapper. */
export function renderRichText(content: unknown, resolveLink: ResolveLink): ReactNode {
  let rendererConverters = convertersByResolver.get(resolveLink)
  if (!rendererConverters) {
    rendererConverters = converters(resolveLink)
    convertersByResolver.set(resolveLink, rendererConverters)
  }
  return <LexicalRichText data={content as never} disableContainer converters={rendererConverters as never} />
}

/**
 * Makes the built-in rich text component for one link resolver. RenderLayout calls it with its
 * `resolveLink`, so the resolver stays in a closure and never becomes a component prop.
 * Lexical rich text, wrapped in a `<div>` that takes the block's `className` (e.g. "prose").
 */
function createRichText(resolveLink: ResolveLink): ComponentType<BlockComponentProps> {
  return function RichText({ props, className, attributes, mode }: BlockComponentProps) {
    const content = props.content
    if (isEmptyRichText(content)) {
      if (mode !== 'canvas') return null
      return (
        <div {...attributes} className={className}>
          <p>
            <PlaceholderText>Rich text</PlaceholderText>
          </p>
        </div>
      )
    }
    return (
      <div {...attributes} className={className}>
        {renderRichText(content, resolveLink)}
      </div>
    )
  }
}

const byResolver = new WeakMap<ResolveLink, ComponentType<BlockComponentProps>>()

/** One component per resolver, so React keeps the same component type between renders. */
export function richTextFor(resolveLink: ResolveLink): ComponentType<BlockComponentProps> {
  let component = byResolver.get(resolveLink)
  if (!component) {
    component = createRichText(resolveLink)
    byResolver.set(resolveLink, component)
  }
  return component
}

/** The rich text component with the default link resolver. */
export const RichText = richTextFor(defaultResolveLink)

// The only default component that imports Payload code: Payload's Lexical JSX converter.
// `RichText` from `@payloadcms/richtext-lexical/react` has no hooks and no client-only code, so it
// renders in server components and inside the client canvas.

import { LinkJSXConverter, RichText as LexicalRichText } from '@payloadcms/richtext-lexical/react'
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

/** Lexical rich text. Wraps the content in a `<div>` that takes the block's `className` (e.g. "prose"). */
export function RichText({ props, className, attributes, mode, resolveLink }: BlockComponentProps) {
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
      <LexicalRichText
        data={content as never}
        disableContainer
        converters={converters(resolveLink) as never}
      />
    </div>
  )
}

// Small helpers that build canonical layout blocks (new ids, no empty props or slots).
// The ready-made sections in this folder use them.
import { createId, type Block } from '@payload-toolkit/builder/core'

/** A link group value as stored in block props. */
export type LinkInput =
  | { type: 'url'; url: string; newTab?: boolean }
  | { type: 'reference'; reference: { relationTo: 'pages' | 'posts'; value: number | string }; newTab?: boolean }

export type StackTag = 'div' | 'section' | 'header' | 'footer' | 'main' | 'nav' | 'article' | 'aside'
export type HeadingLevel = '1' | '2' | '3' | '4' | '5' | '6'

/**
 * A ready-made section: a named block tree that AI tools and the seed can insert.
 * `create` returns a new tree with fresh ids on every call.
 */
export type Section<Input> = {
  name: string
  description: string
  create: (input: Input) => Block
}

/** A label and where it goes. Used for buttons and nav links. */
export type Action = { label: string; link: LinkInput }

export const url = (href: string): LinkInput => ({ type: 'url', url: href })
export const pageLink = (id: number | string): LinkInput => ({ type: 'reference', reference: { relationTo: 'pages', value: id } })
export const postLink = (id: number | string): LinkInput => ({ type: 'reference', reference: { relationTo: 'posts', value: id } })

/** Class sets shared by the sections. Theme colors come from the ThemeSettings variables. */
export const styles = {
  buttonPrimary:
    'inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90',
  buttonOutline:
    'inline-flex items-center justify-center rounded-md border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted',
  buttonInverted:
    'inline-flex items-center justify-center rounded-md bg-primary-foreground px-5 py-3 text-sm font-medium text-primary transition-opacity hover:opacity-90',
  section: 'px-6 py-20',
  container: 'mx-auto flex w-full max-w-6xl flex-col gap-12',
  sectionTitle: 'text-3xl font-bold tracking-tight md:text-4xl',
  lead: 'text-lg text-muted-foreground',
  muted: 'text-muted-foreground',
}

function block(type: string, props?: Record<string, unknown>, className?: string, children?: Block[]): Block {
  const result: Block = { id: createId(), type }
  if (props && Object.keys(props).length > 0) result.props = props
  if (className) result.className = className
  if (children && children.length > 0) result.slots = { children }
  return result
}

export const stack = (as: StackTag, className: string, children: Block[]) => block('stack', { as }, className, children)
export const grid = (className: string, children: Block[]) => block('grid', undefined, className, children)
export const heading = (text: string, level: HeadingLevel, className?: string) => block('heading', { text, level }, className)
export const text = (value: string, className?: string) => block('text', { text: value }, className)
export const richText = (content: unknown, className?: string) => block('richText', { content }, className)
export const image = (id: number | string, alt: string, className?: string) => block('image', { image: id, alt }, className)
export const button = (action: Action, className: string = styles.buttonPrimary) =>
  block('button', { label: action.label, link: action.link }, className)
export const link = (target: LinkInput, className: string, children: Block[]) => block('link', { link: target }, className, children)
export const list = (items: string[], ordered: boolean, className?: string) =>
  block('list', { items: items.map((item) => ({ text: item })), ordered }, className)
export const quote = (value: string, cite: string, className?: string) => block('quote', { quote: value, cite }, className)
export const divider = (className?: string) => block('divider', undefined, className)
export const spacer = (className?: string) => block('spacer', undefined, className)
export const form = (id: number | string, className?: string) => block('form', { form: id }, className)

// Readable layout problems for editors: "Image: choose an image", with the block id so the editor
// can point at the block. The raw path stays in `path` for developers and AI tools.

import { blockName, getBlockDefinition } from './blocks'
import { textOf } from './fields'
import { indexLayout, isPlainObject } from './tree'
import type { BlockDefinition, Layout } from './types'
import type { LayoutError } from './validate'

/** A layout problem with a readable `message`. `where` names the block's parents, e.g. "Hero › Grid". */
export type LayoutIssue = LayoutError & { where?: string }

type LooseField = { name?: unknown; type?: unknown; label?: unknown; fields?: unknown; hasMany?: unknown }

function humanize(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/** "Source URL" -> "source URL", "Image" -> "image", "URL" stays. */
function lowerFirst(text: string): string {
  if (text.length > 1 && text[1] === text[1].toUpperCase() && /[A-Z]/.test(text[1])) return text
  return text.charAt(0).toLowerCase() + text.slice(1)
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** The field at a prop path such as "link.url" or "items[2].label" (through groups and arrays). */
function fieldAt(fields: readonly unknown[], propPath: string): LooseField | undefined {
  let list = fields
  let found: LooseField | undefined
  for (const key of propPath.replace(/\[\d+\]/g, '').split('.')) {
    found = flatFields(list).find((f) => f.name === key)
    if (!found) return undefined
    list = Array.isArray(found.fields) ? found.fields : []
  }
  return found
}

/** Named fields, with rows, collapsibles and unnamed tabs flattened. */
function flatFields(list: readonly unknown[]): LooseField[] {
  const out: LooseField[] = []
  for (const item of list) {
    if (!isPlainObject(item)) continue
    if (typeof item.name === 'string') out.push(item as LooseField)
    else if (Array.isArray(item.fields)) out.push(...flatFields(item.fields))
    else if (Array.isArray(item.tabs)) for (const tab of item.tabs) if (isPlainObject(tab) && Array.isArray(tab.fields)) out.push(...flatFields(tab.fields))
  }
  return out
}

function labelOf(field: LooseField | undefined, fallback: string): string {
  const name = typeof field?.name === 'string' ? field.name : fallback
  return textOf(field?.label as never) ?? humanize(name)
}

/** What to do about an empty required field: "choose an image", "pick a level", "fill in source URL". */
function requiredAction(field: LooseField | undefined, label: string): string {
  const word = lowerFirst(label)
  switch (field?.type) {
    case 'upload':
    case 'relationship':
      return field.hasMany ? `choose ${word}` : `choose ${article(word)} ${word}`
    case 'select':
    case 'radio':
      return `pick ${article(word)} ${word}`
    case 'array':
    case 'blocks':
      return `add ${word}`
    default:
      return `fill in ${word}`
  }
}

/** The prop path after the block's last `.props.` segment, or null for block-level paths. */
function propPathOf(path: string): string | null {
  const at = path.lastIndexOf('.props.')
  return at === -1 ? null : path.slice(at + '.props.'.length)
}

/**
 * Rewrites validation errors as readable messages, one per problem, without duplicates:
 * - required: "Image: choose an image", "Video: fill in source URL"
 * - wrong values: "Collection list: Number of items must be at most 100"
 * - format: "Video: this YouTube link does not point to a video"
 * - nesting: "Form cannot go inside Link"
 * - bindings: "Button: a link can use only the page URL or a URL field (bound to "title")"
 * Errors without a block (a damaged layout) keep their message. `path` and `code` stay as they are.
 */
export function describeLayoutErrors(layout: Layout, errors: readonly LayoutError[], blocks: readonly BlockDefinition[]): LayoutIssue[] {
  const index = indexLayout(layout)
  const seen = new Set<string>()
  const out: LayoutIssue[] = []
  for (const error of errors) {
    const entry = error.blockId ? index.get(error.blockId) : undefined
    let message = error.message
    let where: string | undefined
    if (entry) {
      const name = blockName(entry.block, blocks)
      const parents: string[] = []
      for (let id = entry.parentId; id !== null; ) {
        const parent = index.get(id)
        if (!parent) break
        parents.unshift(blockName(parent.block, blocks))
        id = parent.parentId
      }
      if (parents.length > 0) where = parents.join(' › ')
      const definition = getBlockDefinition(blocks, entry.block.type)
      const propPath = propPathOf(error.path)
      if (error.code === 'nesting') {
        message = error.message
      } else if (error.code === 'format') {
        // The format message is a full sentence for the editor: "Video: this YouTube link …".
        message = `${name}: ${lowerFirst(error.message)}`
      } else if (error.code === 'binding') {
        const match = /^Cannot bind "[^"]*" to "([^"]*)": (.*)$/.exec(error.message)
        message = match ? `${name}: ${match[2]} (bound to "${match[1]}")` : `${name}: ${error.message}`
      } else if (propPath && definition) {
        const field = fieldAt(definition.fields as unknown[], propPath)
        const label = labelOf(field, propPath.split('.').at(-1) ?? propPath)
        if (error.code === 'required') message = `${name}: ${requiredAction(field, label)}`
        else if (error.message.startsWith('Must ')) message = `${name}: ${label} ${lowerFirst(error.message)}`
        else message = `${name}: ${label}: ${lowerFirst(error.message)}`
      } else {
        message = `${name}: ${lowerFirst(error.message)}`
      }
    }
    const key = `${error.blockId ?? ''}\0${message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...error, message, ...(where ? { where } : {}) })
  }
  return out
}

/** "Title", "Title and Slug", "Title, Slug and 2 blocks". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * One line for a toast: "3 blocks need attention.", "Title and Slug need attention.",
 * "Title and 1 block need attention." `fields` are the labels of document fields with problems.
 */
export function summarizeProblems(args: { blockIds: readonly (string | undefined)[]; fields?: readonly string[]; layoutDamaged?: boolean }): string {
  const blockCount = new Set(args.blockIds.filter(Boolean)).size
  const names = [...new Set(args.fields ?? [])]
  if (blockCount > 0) names.push(`${blockCount} ${blockCount === 1 ? 'block' : 'blocks'}`)
  if (args.layoutDamaged && blockCount === 0) names.push('the layout')
  if (names.length === 0) return 'The document could not be saved.'
  const single = names.length === 1 && blockCount <= 1 && !names[0].endsWith('blocks')
  return `${joinNames(names)} ${single ? 'needs' : 'need'} attention.`
}

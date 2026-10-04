// Prompts for the editor's AI assistant.
// The system prompt is STABLE: built once per server from the blocks, sections and theme, with no
// per-request data, so it caches (tools + system are the cached prefix). Everything that changes per
// request (layout, selection, canvas width, template sample) goes into the context message.

import { isRichText, richTextToPlain } from '../core/bindings'
import type { BlockDefinition, Layout, SectionDefinition, StyleTokens, TemplateContext, ThemeToken } from '../core/types'
import { BINDINGS_GUIDE, describeBlock, layoutGuide, outline } from '../mcp/shared'

export type PromptCatalog = {
  blocks: BlockDefinition[]
  sections: SectionDefinition[]
  /** Theme tokens from the app's Tailwind entry. Null when they could not be read. */
  tokens: StyleTokens | null
  /** True when bindings exist (templates or collection lists): the bindings guide is added. */
  bindings: boolean
  /** Extra instructions from the plugin option `ai.instructions`. */
  instructions?: string
}

/** Default Tailwind palette colors (red-500 …) and keywords. The prompt lists only theme colors. */
const PALETTE = /-\d{2,3}$/
const KEYWORDS = new Set(['black', 'white', 'transparent', 'current', 'inherit'])

function names(tokens: ThemeToken[] | undefined, limit = 40): string {
  return (tokens ?? []).map((t) => t.name).slice(0, limit).join(', ')
}

/** Breakpoint widths in px from `--breakpoint-*` values (rem/em count 16 px). */
export function breakpointsPx(tokens: StyleTokens | null): Array<{ name: string; px: number }> {
  const list = tokens?.breakpoints ?? []
  const out: Array<{ name: string; px: number }> = []
  for (const token of list) {
    const match = /^([\d.]+)(px|rem|em)$/.exec(token.value.trim())
    if (!match) continue
    const value = Number(match[1])
    out.push({ name: token.name, px: match[2] === 'px' ? value : value * 16 })
  }
  return out.toSorted((a, b) => a.px - b.px)
}

function stylingGuide(tokens: StyleTokens | null): string {
  const lines = [
    'STYLING',
    "- Blocks have no built-in styles. All styling comes from each block's className: Tailwind CSS v4 utility classes. Use real Tailwind classes. Prefer the theme scale over arbitrary values like w-[37rem].",
    '- In an "update" operation, className REPLACES all classes. Send the full list: the current classes from the layout, changed as needed.',
    '- Mobile first: classes without a prefix apply at every width. sm:, md:, lg:, xl:, 2xl: apply from that breakpoint up.',
    '- Keep spacing, widths and type sizes consistent with the sections already on the page.',
  ]
  if (!tokens) return lines.join('\n')
  const colors = tokens.colors.filter((c) => !PALETTE.test(c.name) && !KEYWORDS.has(c.name))
  const breakpoints = breakpointsPx(tokens)
  if (breakpoints.length > 0) lines.push(`- Breakpoints: ${breakpoints.map((b) => `${b.name} ${b.px}px`).join(', ')}.`)
  if (colors.length > 0) {
    lines.push(
      `- Theme colors (use them so the site keeps its look; e.g. bg-primary, text-muted-foreground, border-border): ${names(colors, 60)}. Put a background together with its -foreground color (bg-primary text-primary-foreground). Use the default palette (red-500 …) only when the user asks for a specific color.`,
    )
  }
  if (tokens.fonts.length > 0) lines.push(`- Font families (font-<name>): ${names(tokens.fonts)}.`)
  if (tokens.radius.length > 0) lines.push(`- Radius (rounded-<name>): ${names(tokens.radius)}.`)
  if (tokens.shadows.length > 0) lines.push(`- Shadows (shadow-<name>): ${names(tokens.shadows)}.`)
  if (tokens.containers.length > 0) lines.push(`- Container widths (max-w-<name>): ${names(tokens.containers)}.`)
  return lines.join('\n')
}

function sectionCatalog(sections: SectionDefinition[]): string {
  if (sections.length === 0) return 'SECTION CATALOG\nThis site has no ready-made sections. Build from blocks.'
  const entries = sections.map((s) => {
    const head = `## ${s.id}: ${s.label}${s.category ? ` (${s.category})` : ''}`
    const description = s.description ? `\n${s.description}` : ''
    return `${head}${description}\n${outline(s.blocks).join('\n')}`
  })
  return [
    'SECTION CATALOG. Ready-made, designed sections. Insert one with insertSection { sectionId }. The outline shows its blocks (type and start of the text). listSections { full: true } returns the full JSON.',
    ...entries,
  ].join('\n\n')
}

/** The stable system prompt. Same input, same bytes: keep it free of request data. */
export function systemPrompt(catalog: PromptCatalog): string {
  const parts = [
    `You are the AI assistant inside a visual website builder for Payload CMS. The user has one page open in the editor and asks you to change it: add sections, write or rewrite text, restyle blocks, reorder or remove them. You make those changes with your tools.

HOW YOUR EDITS WORK
- Your tools edit the page the user has open. Each successful change appears on the user's canvas at once. You never save or publish: the editor saves the page as usual, and the user can undo your whole reply in one step.
- Each user message comes with an <editor_context> block: the current layout JSON with every block id, the selected block, the canvas width and, for templates, the sample document. It shows the page when the user sent the message, including the user's own unsaved edits. The newest context block is the truth; older ones are history.
- "this", "it" and "the selected block" mean the selected block.
- Change only what the user asked for. Keep existing content unless the user asks you to replace it.

HOW TO WORK
1. Start with one short sentence that says what you are going to do.
2. To build page parts (hero, features, pricing, testimonials, FAQ, call to action, contact, footer), PREFER a ready-made section from the section catalog: insertSection, then adjust its text, images and classes with applyOperations "update". Build from single blocks only when no section fits, or for small additions.
3. Put related changes into one applyOperations call. Operations apply in order, all or nothing.
4. When a tool returns an error, read it, fix the input and try again. Do not repeat a call that failed.
5. When you are done, say in one or two plain sentences what you changed. Do not list block ids or JSON. If you could not do something, say so.
- If the request is unclear, or it would delete a lot of content, ask one short question instead of guessing.

WRITING COPY
- Keep copy short, concrete and on-brand: match the tone, names and facts already on the page.
- Headings: a few words. Body text: one to three sentences.
- Do not invent prices, statistics, customer names, quotes or contact details as if they were real. When the user wants example content, make it clearly a placeholder.

IMAGES
- Image and upload props hold the ID of a document in the media library. Find images with searchMedia. Never invent IDs or URLs. When nothing fits, keep the current image and tell the user.

RICH TEXT
- Rich text props hold Lexical JSON. Call getBlockSchema for the block before you write one.`,
    stylingGuide(catalog.tokens),
    layoutGuide('the block catalog'),
    ...(catalog.bindings ? [BINDINGS_GUIDE] : []),
    `BLOCK CATALOG (JSON). Every block type you can use, with its props, slots, description and an example. getBlockSchema returns the exact JSON Schema of one type.\n${JSON.stringify(catalog.blocks.map(describeBlock))}`,
    sectionCatalog(catalog.sections),
  ]
  const extra = catalog.instructions?.trim()
  if (extra) parts.push(`INSTRUCTIONS FROM THE SITE OWNER\n${extra}`)
  return parts.join('\n\n')
}

// ---------------------------------------------------------------------------
// Per-request context
// ---------------------------------------------------------------------------

export type ContextInput = {
  collection: string
  id: string | number
  title?: string
  layout: Layout
  selectedId?: string | null
  /** Ids from the root to the selected block, with types, e.g. ["section b_1", "heading b_2"]. */
  selectedPath?: string[]
  canvasWidth?: number | null
  breakpoints: Array<{ name: string; px: number }>
  /** Template mode: the collection this template renders. */
  templateTarget?: string | null
  /** Template mode: the sample document. */
  sample?: TemplateContext | null
}

const MAX_STRING = 160
const MAX_ITEMS = 5
const MAX_DEPTH = 3

/** A short, JSON-safe summary of a document: strings cut, rich text as plain text, few array items. */
export function summarizeDoc(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (isRichText(value)) return summarizeDoc(richTextToPlain(value), depth)
  if (depth >= MAX_DEPTH) return Array.isArray(value) ? `[${value.length} items]` : '{…}'
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => summarizeDoc(item, depth + 1))
    return value.length > MAX_ITEMS ? [...items, `…${value.length - MAX_ITEMS} more`] : items
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === 'function') continue
      out[key] = summarizeDoc(item, depth + 1)
    }
    return out
  }
  return String(value)
}

function canvasLine(width: number | null | undefined, breakpoints: ContextInput['breakpoints']): string | null {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null
  const px = Math.round(width)
  if (breakpoints.length === 0) return `Canvas width: ${px}px.`
  const active = breakpoints.filter((b) => b.px <= px).map((b) => `${b.name}:`)
  const inactive = breakpoints.filter((b) => b.px > px).map((b) => `${b.name}:`)
  return (
    `Canvas width: ${px}px. The user sees classes without a prefix` +
    (active.length > 0 ? ` and ${active.join(', ')} classes` : '') +
    (inactive.length > 0 ? `. ${inactive.join(', ')} classes do not apply at this width.` : '.') +
    ' Changes for "mobile" or "on this screen" need the matching prefix.'
  )
}

/** The text of the context message sent after the user's message. */
export function contextText(input: ContextInput): string {
  const lines: string[] = ['<editor_context>']
  const title = input.title ? ` "${input.title}"` : ''
  if (input.templateTarget) {
    lines.push(
      `Open document: TEMPLATE${title} (collection "${input.collection}", id ${String(input.id)}). It renders every "${input.templateTarget}" document. Bind block props to the document's fields (getBindingSources { collection: "${input.templateTarget}" }) instead of writing fixed text where the content comes from the document.`,
    )
    if (input.sample?.doc) {
      lines.push(`Sample "${input.sample.collection}" document shown in the preview (summary): ${JSON.stringify(summarizeDoc(input.sample.doc))}`)
    }
  } else {
    lines.push(`Open document: collection "${input.collection}", id ${String(input.id)}${title}.`)
  }
  const canvas = canvasLine(input.canvasWidth, input.breakpoints)
  if (canvas) lines.push(canvas)
  if (input.selectedId) {
    const path = input.selectedPath?.length ? ` Path from the page root: ${input.selectedPath.join(' > ')}.` : ' (not found in the layout)'
    lines.push(`Selected block: ${input.selectedId}.${path}`)
  } else {
    lines.push('Selected block: none.')
  }
  lines.push(`Current layout (${input.layout.blocks.length} top-level blocks):`, JSON.stringify(input.layout), '</editor_context>')
  return lines.join('\n')
}

// Prompts for the editor's AI assistant.
// The system prompt is STABLE: built once per server from the blocks, sections and theme, with no
// per-request data, so it caches (tools + system are the cached prefix). Everything that changes per
// request (layout, selection, canvas width, template sample) goes into the context message.

import { isRichText, richTextToPlain } from '../core/bindings'
import { localeLabel } from '../core/locale'
import { sectionVersions } from '../core/sections'
import type { BlockDefinition, Layout, LocaleSettings, SectionDefinition, StyleTokens, TemplateContext, ThemeToken } from '../core/types'
import { BINDINGS_GUIDE, describeBlock, layoutGuide, outline } from '../mcp/shared'
import { componentProperties } from '../core/components'
import { formFieldTypes, FORM_FIELDS_GUIDE } from '../forms/fieldOps'

export type PromptCatalog = {
  blocks: BlockDefinition[]
  sections: SectionDefinition[]
  /** Theme tokens from the app's Tailwind entry. Null when they could not be read. */
  tokens: StyleTokens | null
  /** True when bindings exist (templates or collection lists): the bindings guide is added. */
  bindings: boolean
  /** Extra instructions from the plugin option `ai.instructions`. */
  instructions?: string
  /** Saved sections are on: the prompt says where they are listed (the list itself is per request). */
  savedSections?: boolean
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
    '- In an "update" operation, className REPLACES all classes: send the full list, the current classes from the layout, changed as needed. To add or remove a few classes, use addClassName and removeClassName (space-separated) instead.',
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
  const variables = tokens.variables ?? []
  if (variables.length > 0) {
    const list = variables.slice(0, 60).map((v) => `${v.name} (${v.type}: ${v.value}${v.darkValue ? `, dark ${v.darkValue}` : ''})`)
    lines.push(
      `- Design variables (the site's named colors, sizes and fonts; prefer them over raw values): ${list.join(', ')}. Colors: bg-<name>, text-<name>, border-<name>. Sizes: p-<name>, m-<name>, gap-<name>, w-<name>. Fonts: font-<name>.`,
    )
  }
  const site = tokens.siteClasses ?? []
  if (site.length > 0) {
    const list = site.slice(0, 80).map((c) => (c.label ? `${c.name} (${c.group ? `${c.group}: ` : ''}${c.label})` : c.name))
    lines.push(`- The site's own classes (its look; prefer them over rebuilding the same look from utilities): ${list.join(', ')}.`)
  }
  return lines.join('\n')
}

/** When and how to use animations. The presets and options are in the layout guide (MOTION), generated from the core list. */
const ANIMATIONS_GUIDE = [
  'ANIMATIONS',
  '- Blocks can animate through "motion" (kinds, presets and options: see MOTION in the layout model). Add animations only when the user asks for them or for a lively page. Keep them subtle: short distances, 400-900 ms.',
  '- One entrance per section: put "enter" on the section block (or on one block of it), not on every block inside. "fade-up" is the safe default.',
  '- The first section on the page (the hero) uses enter { trigger: "load" }, so it plays at once. Sections further down use the default trigger "view".',
  '- Grids and lists of cards: "enter" with stagger 60-120 on the grid or list block. The card blocks then play in turn, so give the cards no motion of their own.',
  '- Cards that link, and buttons: hover { preset: "lift" } and press { preset: "shrink" }.',
  '- scroll "parallax" only on decorative images. "loop" (float, pulse) rarely, on one small decorative block.',
  '- Stacked cards: give each card the classes "sticky top-24 origin-top" and scroll { preset: "recede" }, except the last card.',
  '- In "update", `motion` merges per kind: a kind you send replaces that kind, null removes a kind, kinds you leave out stay. motion: null removes all animations. To remove an animation the user dislikes, send null for its kind.',
].join('\n')

const SAVED_SECTIONS_NOTE =
  'Sections people saved on this site are not in this catalog. When there are any, <editor_context> lists them. Insert them with insertSection { sectionId: "saved:<id>" } like catalog sections.'

function sectionCatalog(sections: SectionDefinition[], saved: boolean): string {
  if (sections.length === 0) {
    return saved
      ? `SECTION CATALOG\nThis site has no ready-made sections. ${SAVED_SECTIONS_NOTE} Otherwise build from blocks.`
      : 'SECTION CATALOG\nThis site has no ready-made sections. Build from blocks.'
  }
  const entries = sections.map((s) => {
    const head = `## ${s.id}: ${s.label}${s.category ? ` (${s.category})` : ''}`
    const description = s.description ? `\n${s.description}` : ''
    // Variants follow their section, each with its own outline.
    const variants = sectionVersions(s)
      .slice(1)
      .map((v) => `\n### variant ${v.variant}: ${v.label}${v.description && v.description !== s.description ? `\n${v.description}` : ''}\n${outline(v.blocks).join('\n')}`)
    return `${head}${description}\n${outline(s.blocks).join('\n')}${variants.join('')}`
  })
  return [
    'SECTION CATALOG. Ready-made, designed sections. Insert one with insertSection { sectionId }. The outline shows its blocks (type and start of the text). A "### variant" under a section is another version of it: pick the one that fits and insert it with insertSection { sectionId, variant }. listSections { full: true } returns the full JSON.' +
      (saved ? `\n${SAVED_SECTIONS_NOTE}` : ''),
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
- Image and upload props hold the ID of a document in the media library. Find images with searchMedia. Never invent IDs or URLs.
- generateImage makes a new image and saves it in the media library (it costs money). Use it when the user asks for a new or generated image, or when nothing in the library fits and the user wants an image. With blockId it puts the image straight into that block. If it says image generation is not set up, keep the current image and tell the user.

RICH TEXT
- Rich text props hold Lexical JSON. Call getBlockSchema for the block before you write one.`,
    stylingGuide(catalog.tokens),
    layoutGuide('the block catalog'),
    ANIMATIONS_GUIDE,
    ...(catalog.bindings ? [BINDINGS_GUIDE] : []),
    `BLOCK CATALOG (JSON). Every block type you can use, with its props, slots, description and an example. getBlockSchema returns the exact JSON Schema of one type.\n${JSON.stringify(catalog.blocks.map(describeBlock))}`,
    sectionCatalog(catalog.sections, catalog.savedSections === true),
  ]
  const extra = catalog.instructions?.trim()
  if (extra) parts.push(`INSTRUCTIONS FROM THE SITE OWNER\n${extra}`)
  return parts.join('\n\n')
}

/**
 * The system prompt of the form builder (`websiteBuilder({ forms })`): the assistant edits a
 * form's fields, not a page. `blocks` are the form's field types.
 */
export function formSystemPrompt(catalog: { blocks: BlockDefinition[]; instructions?: string }): string {
  const parts = [
    `You are the AI assistant inside a form builder for Payload CMS. The user has one form open (a contact form, a booking request, a survey) and asks you to change its fields: add, rename, reorder or remove questions, make them required, set their width, options and display conditions. You make those changes with your tools.

HOW YOUR EDITS WORK
- editFormFields changes the open form. Each change appears in the form builder at once. You never save: the builder saves as usual, and the user can undo your whole reply in one step.
- Each user message comes with an <editor_context> block: the form's fields as a layout JSON (each block is one field; its type is "form" plus the field type, e.g. "formEmail"; its props are the field's values). The newest context block is the truth. getForm returns the fields in a simpler shape.
- "this" and "the selected field" mean the selected block.
- You cannot change the form's settings (title, submit button, confirmation message, emails, spam protection). When the user asks for one, tell them to click an empty spot of the canvas: the right panel then shows the form settings.

HOW TO WORK
1. Start with one short sentence that says what you are going to do.
2. Put related changes into one editFormFields call. Changes apply in order, all or nothing.
3. Ask people only for what you need: keep forms short, mark only the needed fields required, and use the field type that fits (email for addresses, textarea for messages, select or radio for a fixed list of choices, checkbox to accept terms).
4. Labels are short questions or nouns ("Your name", "Email", "How can we help?"). Names are short, lowercase, with _ ("company_size").
5. When a tool returns an error, read it, fix the input and try again. Do not repeat a call that failed.
6. When you are done, say in one or two plain sentences what you changed. Do not list ids or JSON.`,
    FORM_FIELDS_GUIDE,
    `FIELD TYPES (JSON). The types this form offers, with their props.\n${JSON.stringify(formFieldTypes(catalog.blocks))}`,
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
  /** Saved sections the user can read (people made them on this site). Not in the cached system prompt. */
  savedSections?: SectionDefinition[]
  /** The editable classes (the classes collection). They change at any time, so they go here, not in the cached prompt. */
  classes?: Array<{ name: string; label?: string; group?: string }>
  /** Localized layouts: the locale the user edits, and how many props still show the fallback language. */
  locale?: { settings: LocaleSettings; locale: string; untranslated: number } | null
  /** Content mode: the user may change only content (core/contentMode.ts). */
  contentOnly?: boolean
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

/** At most this many saved sections are listed in the context message. */
export const CONTEXT_SAVED_SECTIONS = 30
const OUTLINE_MAX = 160

/** One line per saved section: id, name, category and a condensed outline of its blocks. */
/** What the assistant must know when the user edits one locale of a localized layout. */
function localeLines(input: { settings: LocaleSettings; locale: string; untranslated: number }): string[] {
  const { settings, locale, untranslated } = input
  const name = `${localeLabel(settings, locale)} (${locale})`
  const fallback = `${localeLabel(settings, settings.defaultLocale)} (${settings.defaultLocale})`
  if (locale === settings.defaultLocale) {
    return [
      `Language: the page has several languages (${settings.locales.join(', ')}). The user edits ${name}, the default language. Write text in ${localeLabel(settings, locale)}. Blocks, order and classes are the same in every language.`,
    ]
  }
  return [
    `Language: the user edits ${name}. The layout below shows the ${localeLabel(settings, locale)} values; text props that are not translated yet show the ${fallback} text.`,
    `Write every text you add or change in ${localeLabel(settings, locale)}. Your "update" props go to ${localeLabel(settings, locale)} only (localized props). Text of blocks you insert is ${localeLabel(settings, locale)} only: the ${fallback} text stays empty until someone writes it (sections keep their own text). Inserts, moves, removals, classes and props that are not localized change the structure of EVERY language, so prefer translating text over changing the structure.`,
    ...(untranslated > 0 ? [`${untranslated} props still show the ${fallback} text. When the user asks to translate, update them with ${localeLabel(settings, locale)} text.`] : []),
  ]
}

function savedSectionsBlock(sections: SectionDefinition[] | undefined): string[] {
  if (!sections || sections.length === 0) return []
  const lines = sections.slice(0, CONTEXT_SAVED_SECTIONS).map((s) => {
    const condensed = outline(s.blocks).map((line) => line.trim()).join(', ')
    const short = condensed.length > OUTLINE_MAX ? `${condensed.slice(0, OUTLINE_MAX)}…` : condensed
    const propertyNames = componentProperties(s.blocks, []).map((p) => p.name)
    const component = propertyNames.length > 0 ? ` [component, properties: ${propertyNames.join(', ')}; insertSection with values]` : ''
    return `- ${s.id}: ${s.label}${s.category ? ` (${s.category})` : ''}${component}: ${short}`
  })
  const more = sections.length - CONTEXT_SAVED_SECTIONS
  if (more > 0) lines.push(`- …and ${more} more. listSections lists them all.`)
  return ['Saved sections (made by people on this site). Insert with insertSection { sectionId }:', ...lines]
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
  lines.push(...savedSectionsBlock(input.savedSections))
  if (input.classes && input.classes.length > 0) {
    const list = input.classes.slice(0, 80).map((c) => (c.label ? `${c.name} (${c.group ? `${c.group}: ` : ''}${c.label})` : c.name))
    lines.push(
      `Editable classes (stored in the CMS; they win over a code class with the same name). Prefer them in className over rebuilding the same look from utilities: ${list.join(', ')}.`,
    )
  }
  if (input.locale) lines.push(...localeLines(input.locale))
  if (input.contentOnly) {
    lines.push(
      'CONTENT MODE: this user may change only text, images and links (text, textarea, rich text, upload and link props). Do not add, move, delete or restyle blocks, and do not change classes, motion, visibility, bindings or other settings: such operations are refused. Inside a block with "editableItems": true you may duplicate, delete and reorder its direct children. If the user asks for a design change, say that a designer has to make it.',
    )
  }
  lines.push(`Current layout (${input.layout.blocks.length} top-level blocks):`, JSON.stringify(input.layout), '</editor_context>')
  return lines.join('\n')
}

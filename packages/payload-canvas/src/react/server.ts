// Server-only helpers: `payload-canvas/react/server`. They call Payload's Local API, so
// keep them out of client components (the main entry stays client-safe).

import type { Payload } from 'payload'
import { siteCssConfigOf } from '../plugin'
import { collectClasses, type Layout } from '../core'
import { compileClasses } from '../css'
import { withThemeVariables } from '../theme/server'
import { loadClassesSheet } from './classes/ClassesStyle'
import { builderConfigOf } from '../live/document'
import { savedFormIds, savedFormsClasses } from '../forms/pageSync'

export { loadLayoutData, type LoadLayoutOptions } from './render/resolve'
export { loadTemplate, type LoadedTemplate, type LoadTemplateArgs } from './render/templates'
export { loadedLists, type LoadedList } from './render/lists'
export { localeArgs, localizeLayout, type RenderLocale } from './render/locale'
export { createCanvasServer, type CanvasFrameArgs, type CanvasServerOptions, type PageDataArgs } from './render/canvasServer'
export { siteRegion, type RegionMark } from './render/regions'
export type { CanvasServerRequest, CanvasServerResponse } from './render/canvasServerTypes'
export { loadTheme, ThemeStyle, type LoadedTheme, type ThemeStyleProps } from './theme/ThemeStyle'
export { ClassesStyle, CLASSES_PRECEDENCE, loadClassesSheet, type ClassesStyleProps } from './classes/ClassesStyle'

/** One layout rendered on a page, with the CSS stored for it (used when the compile is not possible). */
export type PageCssPart = { layout: Layout; css?: string | null } | null | undefined

/**
 * One stylesheet for every layout a page renders (for example header, page or template, footer).
 *
 * Each layout's stored CSS is complete on its own, but several `<style>` tags on one page break
 * Tailwind's order: a later sheet's `text-lg` beats an earlier sheet's `md:text-xl`. Compiling
 * the union of the classes once keeps every variant after its base class, as on the canvas.
 *
 * Uses the plugin's CSS options (the Tailwind entry and plugins) from the Payload config. The
 * result is cached by class set, so a page costs one compile per distinct set of classes.
 * Without the plugin, or when the compile fails, it returns the stored CSS of the parts joined.
 * `null` when there is nothing to output.
 */
export async function compilePageCss(payload: Payload, parts: readonly PageCssPart[]): Promise<string | null> {
  const present = parts.filter((part): part is NonNullable<PageCssPart> => Boolean(part))
  const stored = () => present.map((part) => part.css ?? '').filter(Boolean).join('\n') || null
  const config = siteCssConfigOf(payload)
  if (!config) return stored()
  const classes = new Set<string>()
  for (const part of present) for (const name of collectClasses(part.layout, config.blocks)) classes.add(name)
  // A Form block that shows a saved form renders that form's fields: their classes count too.
  for (const name of await savedFormClasses(payload, present.map((part) => part.layout))) classes.add(name)
  if (classes.size === 0) return null
  try {
    // Editable classes come from their own stylesheet (`ClassesStyle`): the page leaves them out.
    const sheet = await loadClassesSheet(payload).catch(() => null)
    return (await compileClasses([...classes], await withThemeVariables(payload, config.css), { exclude: sheet?.names ?? [] })) || null
  } catch (error) {
    payload.logger.error({ err: error, msg: '[builder] Page CSS compile failed. Using the stored CSS of each layout.' })
    return stored()
  }
}

/** The classes of the fields of the saved forms the layouts show ("Use a saved form"). One query. */
async function savedFormClasses(payload: Payload, layouts: readonly Layout[]): Promise<string[]> {
  const forms = builderConfigOf(payload)?.pageForms?.collection
  const ids = savedFormIds(layouts)
  if (!forms || ids.length === 0) return []
  try {
    const { docs } = await payload.find({ collection: forms as never, where: { id: { in: ids } }, depth: 0, limit: ids.length, pagination: false, select: { fields: true } as never })
    return savedFormsClasses(docs as unknown as Array<Record<string, unknown>>)
  } catch {
    return []
  }
}

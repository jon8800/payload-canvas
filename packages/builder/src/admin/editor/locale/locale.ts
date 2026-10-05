'use client'

// Localization in the editor: which locale the editor shows, which props still show the fallback
// language, and the "copy from" / "clear translation" actions. The store keeps the locale and the
// resolved view (store.ts); the operations carry the locale (core/locale.ts).

import { useMemo } from 'react'

import { findBlock, getBlockDefinition, localeLabel, localeWithValue, localizedKeys, missingDefaultKeys, untranslatedKeys, walkBlocks } from '../../../core'
import type { Block, BlockDefinition, Layout, LocaleSettings } from '../../../core/types'
import type { Runtime } from '../runtime'
import { useEditor } from '../store'

const NONE: ReadonlyMap<string, string[]> = new Map()

/**
 * Per settings and locale: the props of each stored block object that need text in the locale.
 * Blocks keep their identity while unchanged.
 */
const caches = new WeakMap<LocaleSettings, Map<string, WeakMap<Block, string[]>>>()

function untranslatedOf(block: Block, blocks: readonly BlockDefinition[], settings: LocaleSettings, locale: string): string[] {
  let byLocale = caches.get(settings)
  if (!byLocale) caches.set(settings, (byLocale = new Map()))
  let cache = byLocale.get(locale)
  if (!cache) byLocale.set(locale, (cache = new WeakMap()))
  let keys = cache.get(block)
  if (!keys) {
    keys = locale === settings.defaultLocale ? missingDefaultKeys(block, blocks, settings) : untranslatedKeys(block, blocks, settings, locale)
    cache.set(block, keys)
  }
  return keys
}

/**
 * The props of every block that need text in `locale`, by block id (only blocks that have some).
 * Another locale: props that show the fallback language (not translated). The default locale:
 * props it does not have while another locale does (a block written in another language first).
 */
export function untranslatedMap(layout: Layout, blocks: readonly BlockDefinition[], settings: LocaleSettings, locale: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  walkBlocks(layout, (block) => {
    const keys = untranslatedOf(block, blocks, settings, locale)
    if (keys.length > 0) out.set(block.id, keys)
  })
  return out
}

/** The props that need text in the editor's locale, per block id (see `untranslatedMap`). */
export function useUntranslated(runtime: Runtime): ReadonlyMap<string, string[]> {
  const layout = useEditor(runtime.store, (s) => s.layout)
  const locale = useEditor(runtime.store, (s) => s.locale)
  const settings = runtime.store.localization
  return useMemo(
    () => (settings && locale ? untranslatedMap(layout, runtime.config.blocks, settings, locale) : NONE),
    [layout, locale, settings, runtime],
  )
}

/** How the outline and the switcher name props that need text: "not translated", or "missing in English" in the default locale. */
export function missingWords(runtime: Runtime, locale: string | null): string {
  const settings = runtime.store.localization
  return settings && locale === settings.defaultLocale ? `missing in ${defaultLocaleName(runtime)}` : 'not translated'
}

/** The editor's locale when it is not the default one, else null. */
export function useOtherLocale(runtime: Runtime): string | null {
  const settings = runtime.store.localization
  return useEditor(runtime.store, (s) => (settings && s.locale && s.locale !== settings.defaultLocale ? s.locale : null))
}

/** "Deutsch", or the code in capitals. */
export function localeName(runtime: Runtime, code: string): string {
  return localeLabel(runtime.store.localization, code)
}

/** The default locale's name ("English"), or an empty string without localization. */
export function defaultLocaleName(runtime: Runtime): string {
  const settings = runtime.store.localization
  return settings ? localeLabel(settings, settings.defaultLocale) : ''
}

/**
 * Copies the default locale's values of `keys` (default: every untranslated prop) into the
 * editor's locale, so they count as translated. One undo step. False when nothing changed.
 */
export function copyFromDefault(runtime: Runtime, id: string, keys?: readonly string[]): boolean {
  const settings = runtime.store.localization
  const { layout, locale } = runtime.store.getState()
  if (!settings || !locale || locale === settings.defaultLocale) return false
  const block = findBlock(layout, id)
  if (!block) return false
  const names = keys ?? untranslatedKeys(block, runtime.config.blocks, settings, locale)
  const props: Record<string, unknown> = {}
  for (const key of names) {
    const value = block.props?.[key]
    if (value !== undefined) props[key] = structuredClone(value)
  }
  if (Object.keys(props).length === 0) return false
  return runtime.store.apply({ type: 'update', id, props, locale }, { stampLocale: false })
}

/**
 * In the default locale: copies another locale's own values of `keys` (default: every prop the
 * default locale is missing, see `missingDefaultKeys`) into the default locale. Each prop comes from
 * the first locale that has it. One undo step. False when nothing changed.
 */
export function copyIntoDefault(runtime: Runtime, id: string, keys?: readonly string[]): boolean {
  const settings = runtime.store.localization
  const { layout, locale } = runtime.store.getState()
  if (!settings || locale !== settings.defaultLocale) return false
  const block = findBlock(layout, id)
  if (!block) return false
  const names = keys ?? missingDefaultKeys(block, runtime.config.blocks, settings)
  const props: Record<string, unknown> = {}
  for (const key of names) {
    const from = localeWithValue(block, key, settings)
    const value = from ? block.locales?.[from]?.[key] : undefined
    if (value !== undefined) props[key] = structuredClone(value)
  }
  if (Object.keys(props).length === 0) return false
  return runtime.store.apply({ type: 'update', id, props }, { stampLocale: false })
}

/** Removes the translations of `keys` in the editor's locale: they show the fallback language again. */
export function clearTranslation(runtime: Runtime, id: string, keys: readonly string[]): boolean {
  const settings = runtime.store.localization
  const { locale } = runtime.store.getState()
  if (!settings || !locale || locale === settings.defaultLocale || keys.length === 0) return false
  return runtime.store.apply({ type: 'update', id, unsetProps: [...keys], locale }, { stampLocale: false })
}

/**
 * Shows and edits another locale. The address keeps it (`?locale=`, Payload's convention), so a
 * reload opens the same locale, and Payload stores it as the user's locale preference.
 */
export function switchLocale(runtime: Runtime, code: string): void {
  runtime.store.setLocale(code)
  const { locale } = runtime.store.getState()
  if (!locale) return
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('locale', locale)
    window.history.replaceState(window.history.state, '', url)
  } catch {
    // No history API: the locale lasts until the page reloads.
  }
}

/** True when the block type has localized props (with localization on). */
export function hasLocalizedFields(runtime: Runtime, type: string): boolean {
  return Boolean(runtime.store.localization) && localizedKeys(getBlockDefinition(runtime.config.blocks, type)).size > 0
}

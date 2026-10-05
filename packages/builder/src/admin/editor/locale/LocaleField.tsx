'use client'

// The inspector's language marks:
// - `LocaleNote` above the tabs: which language you edit, what changes every language, and
//   "Copy N fields from English" for the selected block. In the default language it shows only
//   when the block has text in another language that the default language does not have.
// - `LocaleFieldsProvider` + `LocaleFieldFrame` around each top-level field. In another language:
//   "Not translated" (the input shows the fallback greyed, or as a placeholder for text) with
//   "Copy English", or "Translated" with "Use English" (removes the translation), or "Missing in
//   English" (the block was written in this language first). In the default language: "Missing
//   in English" with "Copy German".

import { createContext, use, useMemo, type ReactNode } from 'react'

import { findBlock, getBlockDefinition, localeWithValue, localizedKeys, missingDefaultKeys } from '../../../core'
import type { Block } from '../../../core/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { clearTranslation, copyFromDefault, copyIntoDefault, defaultLocaleName, localeName } from './locale'
import './locale.scss'

type FieldsLocale = {
  /** Path prefix of the block's top-level fields: `builder.<id>.` */
  prefix: string
  blockId: string
  /** True when the editor shows the default locale. */
  isDefault: boolean
  localized: ReadonlySet<string>
  untranslated: ReadonlySet<string>
  /** Props with an own value in the locale. */
  translated: ReadonlySet<string>
  /** Props the default locale does not have while another locale does, with that locale's code. */
  missingDefault: ReadonlyMap<string, string>
  /** Text shown as the placeholder of an untranslated text field, by prop name. */
  placeholders: ReadonlyMap<string, string>
  defaultName: string
}

const FieldsLocaleContext = createContext<FieldsLocale | null>(null)

const NO_PROPS: Record<string, unknown> = {}
const NO_KEYS: ReadonlySet<string> = new Set()
const NO_PLACEHOLDERS: ReadonlyMap<string, string> = new Map()

/** Text and textarea fields show an untranslated value as a placeholder, so typing starts empty. */
const PLACEHOLDER_TYPES = new Set(['text', 'textarea'])

/**
 * The props the inspector shows for a block in the editor's locale: untranslated text props are
 * left out (their fallback shows as the placeholder). Same object without localization.
 */
export function useInspectorProps(block: Block): Record<string, unknown> {
  const locale = useFieldsLocale(block)
  const props = block.props
  return useMemo(() => {
    if (!locale || locale.placeholders.size === 0) return props ?? NO_PROPS
    const out = { ...props }
    for (const key of locale.placeholders.keys()) delete out[key]
    return out
  }, [locale, props])
}

function useFieldsLocale(block: Block): FieldsLocale | null {
  const runtime = useRuntime()
  const settings = runtime.store.localization
  const locale = useEditor(runtime.store, (s) => s.locale)
  // The stored block: which props have their own value in each locale.
  const stored = useEditor(runtime.store, (s) => (settings ? findBlock(s.layout, block.id) : null))
  return useMemo(() => {
    if (!settings || !locale || !stored) return null
    const def = getBlockDefinition(runtime.config.blocks, block.type)
    const localized = localizedKeys(def)
    if (localized.size === 0) return null
    const missingDefault = new Map<string, string>()
    for (const key of missingDefaultKeys(stored, runtime.config.blocks, settings)) {
      const from = localeWithValue(stored, key, settings)
      if (from) missingDefault.set(key, from)
    }
    const base = { prefix: `builder.${block.id}.`, blockId: block.id, localized, missingDefault, defaultName: defaultLocaleName(runtime) }
    if (locale === settings.defaultLocale) {
      if (missingDefault.size === 0) return null
      return { ...base, isDefault: true, untranslated: NO_KEYS, translated: NO_KEYS, placeholders: NO_PLACEHOLDERS }
    }
    const own = stored.locales?.[locale] ?? {}
    const translated = new Set(Object.keys(own).filter((key) => localized.has(key)))
    const untranslated = new Set<string>()
    const placeholders = new Map<string, string>()
    for (const key of localized) {
      if (translated.has(key)) continue
      const value = block.props?.[key]
      if (value === undefined || value === null || value === '') continue
      untranslated.add(key)
      const field = def?.fields.find((f) => 'name' in f && f.name === key)
      if (field && PLACEHOLDER_TYPES.has(field.type) && typeof value === 'string') placeholders.set(key, value)
    }
    return { ...base, isDefault: false, untranslated, translated, placeholders }
  }, [settings, locale, stored, block, runtime])
}

export function LocaleFieldsProvider({ block, children }: { block: Block; children: ReactNode }) {
  const value = useFieldsLocale(block)
  return <FieldsLocaleContext value={value}>{children}</FieldsLocaleContext>
}

/** The placeholder of an untranslated text field at `path`, or undefined. */
export function useLocalePlaceholder(path: string): string | undefined {
  const ctx = use(FieldsLocaleContext)
  if (!ctx || !path.startsWith(ctx.prefix)) return undefined
  return ctx.placeholders.get(path.slice(ctx.prefix.length))
}

type FieldStatus = 'untranslated' | 'translated' | 'missing' | 'empty'

function statusOf(ctx: FieldsLocale, name: string): FieldStatus {
  if (ctx.isDefault) return ctx.missingDefault.has(name) ? 'missing' : 'empty'
  if (ctx.untranslated.has(name)) return 'untranslated'
  if (!ctx.translated.has(name)) return 'empty'
  // Written in this language first: the default language has no value to go back to.
  return ctx.missingDefault.has(name) ? 'missing' : 'translated'
}

/** Marks a top-level localized field: "Not translated", "Translated" or "Missing in English", with its action. */
export function LocaleFieldFrame({ path, name, children }: { path: string; name: string; children: ReactNode }) {
  const runtime = useRuntime()
  const ctx = use(FieldsLocaleContext)
  if (!ctx || path !== `${ctx.prefix}${name}` || !ctx.localized.has(name)) return children
  const status = statusOf(ctx, name)
  if (status === 'empty') return children
  const language = localeName(runtime, runtime.store.getState().locale ?? '')
  const source = ctx.missingDefault.get(name)
  return (
    <div className="builder-locale-field" data-locale-status={status}>
      {children}
      <div className="builder-locale-field__mark">
        {status === 'untranslated' && (
          <>
            <span className="builder-locale-field__state">Not translated · shows {ctx.defaultName}</span>
            <button
              type="button"
              className="builder-locale-field__action"
              data-tooltip={`Copy the ${ctx.defaultName} value into ${language}, then change it`}
              onClick={() => copyFromDefault(runtime, ctx.blockId, [name])}
            >
              Copy {ctx.defaultName}
            </button>
          </>
        )}
        {status === 'translated' && (
          <>
            <span className="builder-locale-field__state">Translated</span>
            <button
              type="button"
              className="builder-locale-field__action"
              data-tooltip={`Remove the ${language} value: the field shows ${ctx.defaultName} again`}
              onClick={() => clearTranslation(runtime, ctx.blockId, [name])}
            >
              Use {ctx.defaultName}
            </button>
          </>
        )}
        {status === 'missing' && (
          <>
            <span className="builder-locale-field__state" data-tooltip={`Publishing needs ${ctx.defaultName} text when the field is required`}>
              Missing in {ctx.defaultName}
            </span>
            {ctx.isDefault && source && (
              <button
                type="button"
                className="builder-locale-field__action"
                data-tooltip={`Copy the ${localeName(runtime, source)} value into ${ctx.defaultName}, then change it`}
                onClick={() => copyIntoDefault(runtime, ctx.blockId, [name])}
              >
                Copy {localeName(runtime, source)}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The name of the language the missing props come from, or "other languages" when they differ. */
function sourceName(runtime: ReturnType<typeof useRuntime>, sources: Iterable<string>): string {
  const codes = new Set(sources)
  const [only] = codes
  return codes.size === 1 && only ? localeName(runtime, only) : 'other languages'
}

/**
 * Above the inspector tabs. In a locale other than the default: which language you edit and what
 * changes every language; on the Content tab, "Copy N fields from English" fills every
 * untranslated prop of the block at once. In the default locale: only when the block has text in
 * another language that the default language does not have, with "Copy N fields from German".
 */
export function LocaleNote({ blockId, tab }: { blockId: string; tab: 'content' | 'styles' | 'motion' }) {
  const runtime = useRuntime()
  const settings = runtime.store.localization
  const locale = useEditor(runtime.store, (s) => s.locale)
  const block = useEditor(runtime.store, (s) => (settings ? findBlock(s.layout, blockId) : null))
  const isDefault = Boolean(settings && locale === settings.defaultLocale)
  const missing = useMemo(() => {
    if (!locale || !block || !settings || isDefault) return 0
    const keys = localizedKeys(getBlockDefinition(runtime.config.blocks, block.type))
    let count = 0
    for (const key of keys) {
      if (Object.hasOwn(block.locales?.[locale] ?? {}, key)) continue
      const value = block.props?.[key]
      if (value !== undefined && value !== null && value !== '') count++
    }
    return count
  }, [locale, block, settings, isDefault, runtime])
  const missingDefault = useMemo(
    () => (block && settings && isDefault ? missingDefaultKeys(block, runtime.config.blocks, settings) : []),
    [block, settings, isDefault, runtime],
  )
  if (!settings || !locale || !block) return null
  const fallback = defaultLocaleName(runtime)

  if (isDefault) {
    if (tab !== 'content' || missingDefault.length === 0) return null
    const from = sourceName(runtime, missingDefault.flatMap((key) => localeWithValue(block, key, settings) ?? []))
    const count = missingDefault.length
    return (
      <div className="builder-locale-note" role="note">
        <Icon name="globe" size={14} />
        <div>
          <p>
            {count} {count === 1 ? 'field has' : 'fields have'} text in {from} but not in {fallback}. Publishing needs {fallback} text for required fields.
          </p>
          <button type="button" className="builder-locale-field__action" onClick={() => copyIntoDefault(runtime, blockId)}>
            Copy {count} {count === 1 ? 'field' : 'fields'} from {from}
          </button>
        </div>
      </div>
    )
  }

  const language = localeName(runtime, locale)
  return (
    <div className="builder-locale-note" role="note">
      <Icon name="globe" size={14} />
      <div>
        <p>
          {tab === 'styles'
            ? `Styles change every language, not only ${language}.`
            : tab === 'motion'
              ? `Animations change every language, not only ${language}.`
            : `Editing ${language}. Translated fields change ${language} only; other fields, blocks and styles change every language.`}
        </p>
        {tab === 'content' && missing > 0 && (
          <button type="button" className="builder-locale-field__action" onClick={() => copyFromDefault(runtime, blockId)}>
            Copy {missing} {missing === 1 ? 'field' : 'fields'} from {fallback}
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

// The inspector in a locale other than the default:
// - `LocaleNote` above the tabs: which language you edit, what changes every language, and
//   "Copy N fields from English" for the selected block.
// - `LocaleFieldsProvider` + `LocaleFieldFrame` around each top-level field: "Not translated"
//   (the input shows the fallback greyed, or as a placeholder for text) with "Copy English", or
//   "Translated" with "Use English" (removes the translation).

import { createContext, use, useMemo, type ReactNode } from 'react'

import { findBlock, getBlockDefinition, localizedKeys } from '../../../core'
import type { Block } from '../../../core/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { clearTranslation, copyFromDefault, defaultLocaleName, localeName, useOtherLocale } from './locale'
import './locale.scss'

type FieldsLocale = {
  /** Path prefix of the block's top-level fields: `builder.<id>.` */
  prefix: string
  blockId: string
  localized: ReadonlySet<string>
  untranslated: ReadonlySet<string>
  /** Props with an own value in the locale. */
  translated: ReadonlySet<string>
  /** Text shown as the placeholder of an untranslated text field, by prop name. */
  placeholders: ReadonlyMap<string, string>
  defaultName: string
}

const FieldsLocaleContext = createContext<FieldsLocale | null>(null)

const NO_PROPS: Record<string, unknown> = {}

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
  const other = useOtherLocale(runtime)
  // The stored block: which props have their own value in the locale.
  const stored = useEditor(runtime.store, (s) => (other ? findBlock(s.layout, block.id) : null))
  return useMemo(() => {
    if (!other || !stored) return null
    const def = getBlockDefinition(runtime.config.blocks, block.type)
    const localized = localizedKeys(def)
    if (localized.size === 0) return null
    const own = stored.locales?.[other] ?? {}
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
    return {
      prefix: `builder.${block.id}.`,
      blockId: block.id,
      localized,
      untranslated,
      translated,
      placeholders,
      defaultName: defaultLocaleName(runtime),
    }
  }, [other, stored, block, runtime])
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

/** Marks a top-level localized field: "Not translated" or "Translated", with its action. */
export function LocaleFieldFrame({ path, name, children }: { path: string; name: string; children: ReactNode }) {
  const runtime = useRuntime()
  const ctx = use(FieldsLocaleContext)
  if (!ctx || path !== `${ctx.prefix}${name}` || !ctx.localized.has(name)) return children
  const status = ctx.untranslated.has(name) ? 'untranslated' : ctx.translated.has(name) ? 'translated' : 'empty'
  const language = localeName(runtime, runtime.store.getState().locale ?? '')
  return (
    <div className="builder-locale-field" data-locale-status={status}>
      {children}
      {status !== 'empty' && (
        <div className="builder-locale-field__mark">
          {status === 'untranslated' ? (
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
          ) : (
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
        </div>
      )}
    </div>
  )
}

/**
 * Above the inspector tabs, in a locale other than the default: which language you edit and what
 * changes every language. On the Content tab, "Copy N fields from English" fills every
 * untranslated prop of the block at once.
 */
export function LocaleNote({ blockId, tab }: { blockId: string; tab: 'content' | 'styles' }) {
  const runtime = useRuntime()
  const other = useOtherLocale(runtime)
  const settings = runtime.store.localization
  const block = useEditor(runtime.store, (s) => (other ? findBlock(s.layout, blockId) : null))
  const missing = useMemo(() => {
    if (!other || !block || !settings) return 0
    const keys = localizedKeys(getBlockDefinition(runtime.config.blocks, block.type))
    let count = 0
    for (const key of keys) {
      if (Object.hasOwn(block.locales?.[other] ?? {}, key)) continue
      const value = block.props?.[key]
      if (value !== undefined && value !== null && value !== '') count++
    }
    return count
  }, [other, block, settings, runtime])
  if (!other || !block) return null
  const language = localeName(runtime, other)
  const fallback = defaultLocaleName(runtime)
  return (
    <div className="builder-locale-note" role="note">
      <Icon name="globe" size={14} />
      <div>
        <p>
          {tab === 'styles'
            ? `Styles change every language, not only ${language}.`
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

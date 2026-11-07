// The theme's design variables on the server: read once per Payload instance (a theme save clears
// the cache), and added to the CSS options of every Tailwind compile. Server-only, no Next imports.

import type { Payload } from 'payload'

import type { StyleTokens } from '../core/types'
import { getStyleTokens, type CssOptions } from '../css'
import { themeConfigOf } from './config'
import { cleanVariables, variablesThemeCss, variableTokens, type ThemeVariable } from './variables'

/** On the Payload instance (not a module map), so every copy of this module shares it. */
const CACHE = Symbol.for('payload-canvas.themeVariables')
/** Other server processes see a theme save after at most this long. */
const TTL_MS = 10_000

type Holder = { [CACHE]?: { at: number; value: Promise<ThemeVariable[]> } }

/** The theme's usable variables. Empty with `theme: false` or when the global cannot be read. */
export function themeVariablesOf(payload: Payload): Promise<ThemeVariable[]> {
  // A stub without a config (some unit tests call hooks with one) has no theme.
  const config = payload?.config ? themeConfigOf(payload) : null
  if (!config) return Promise.resolve([])
  const holder = payload as unknown as Holder
  const cached = holder[CACHE]
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  const value = payload
    .findGlobal({ slug: config.slug as never, depth: 0, overrideAccess: true })
    .then((doc) => cleanVariables((doc as { variables?: unknown } | null)?.variables))
    .catch(() => [] as ThemeVariable[])
  holder[CACHE] = { at: Date.now(), value }
  return value
}

/** Forgets the cached variables (after a theme save). */
export function forgetThemeVariables(payload: Payload): void {
  delete (payload as unknown as Holder)[CACHE]
}

/**
 * The CSS options with the theme's variables registered (`themeCss`), so the compile knows
 * `bg-brand`, `p-gutter` and `font-display`. The options as they are without variables.
 */
export async function withThemeVariables(payload: Payload, css: CssOptions): Promise<CssOptions> {
  const themeCss = variablesThemeCss(await themeVariablesOf(payload))
  return themeCss ? { ...css, themeCss } : css
}

/** The Styles panel's tokens with the theme's variables: their names in the token lists, and `variables`. */
export async function themeStyleTokens(payload: Payload, css: CssOptions): Promise<StyleTokens> {
  const [variables, tokens] = await Promise.all([themeVariablesOf(payload), withThemeVariables(payload, css).then(getStyleTokens)])
  return variables.length > 0 ? { ...tokens, variables: variableTokens(variables) } : tokens
}

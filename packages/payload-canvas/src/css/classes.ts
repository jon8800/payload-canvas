// The stylesheet of the editable classes (`builder-classes`). Browser-safe: the server compiles the
// published classes for the site, and the canvas compiles the latest drafts with the same code.
//
// Each class becomes `@utility pc-db-class-<n> { @apply <styles>; <css> }`, appended to the site's
// CSS entry, so variants (`md:`, `hover:`), theme tokens and plugins work as in the site's own
// CSS. The internal name means a code `@utility` with the same name never adds its rules: the
// classes stylesheet holds the editable class alone. Its rules are renamed back to `.card` after
// the build. Classes that use other editable classes in their styles get those classes' rules.
//
// Cascade: the rules stay in `@layer utilities`, unscoped. Load the stylesheet after the site's CSS
// (it overrides a code `@utility` with the same name) and before the page's generated CSS (a
// block's own utilities beat its class). See the README section "Editable classes".

import { classNameProblem, classTokens, cssProblem, INTERNAL_CLASS_PREFIX, splitClassToken, type ClassStyleSource } from '../classes/shared'
import type { CanvasCssInput, TailwindPlugins } from './index'
import { compileFromInput, countUtilityLayers, extractUtilities, splitTopLevel } from './shared'

export type ClassSheet = {
  /** The stylesheet: `@layer utilities { .card { … } }` plus the theme variables, `@property` and `@keyframes` rules it uses. */
  css: string
  /** Problems by class name. A class with a problem compiles without the part that failed, or is left out. */
  errors: Record<string, string>
  /** Every name the stylesheet styles: the class names and their former names. Page compiles leave these out. */
  names: string[]
}

type Entry = {
  /** The internal utility name. */
  internal: string
  /** The class name this entry outputs (a class name or a former name). */
  name: string
  /** The class's own name (an alias entry outputs the same rules under a former name). */
  owner: string
  source: ClassStyleSource
}

const INTERNAL = new RegExp(`\\.${INTERNAL_CLASS_PREFIX}(\\d+)(?![\\w-])`, 'g')
const UNKNOWN_UTILITY = /Cannot apply unknown utility class[:\s]*[`'"]?([^`'"\s]+?)[`'"]?(?:[\s.]|$)/

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).split('\n')[0]!.trim()

/** The class's custom CSS: the rule body, and the `@keyframes` that go at the top level. */
function splitCss(css: string): { body: string[]; top: string[] } {
  const value = css.trim()
  if (!value) return { body: [], top: [] }
  // A last declaration without ";" would be lost by the split.
  const closed = /[;}]$/.test(value) ? value : `${value};`
  const body: string[] = []
  const top: string[] = []
  for (const statement of splitTopLevel(closed)) (/^@keyframes\s/.test(statement) ? top : body).push(statement)
  return { body, top }
}

/**
 * Compiles the editable classes against the site's design system (the recorded CSS input).
 * Never throws: a class with a problem is compiled without its unknown Tailwind classes or its
 * broken custom CSS, or left out, and the problem goes into `errors`.
 */
export async function compileClassSheet(input: CanvasCssInput, classes: readonly ClassStyleSource[], plugins?: TailwindPlugins): Promise<ClassSheet> {
  const errors: Record<string, string> = {}
  const valid = [...classes]
    .filter((item) => {
      const problem = classNameProblem(item.name)
      if (problem) errors[item.name] = problem
      return !problem
    })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  if (valid.length === 0) return { css: '', errors, names: [] }

  // One entry per class, then one per former name that no class has as its own name.
  const own = new Set(valid.map((item) => item.name))
  const entries: Entry[] = []
  for (const source of valid) entries.push({ internal: '', name: source.name, owner: source.name, source })
  for (const source of valid) {
    for (const alias of source.previousNames ?? []) {
      if (own.has(alias) || entries.some((e) => e.name === alias) || classNameProblem(alias)) continue
      entries.push({ internal: '', name: alias, owner: source.name, source })
    }
  }
  entries.forEach((entry, index) => {
    entry.internal = `${INTERNAL_CLASS_PREFIX}${index}`
  })
  // A class (or a former name) used in another class's styles applies that class's rules.
  const internalOf = new Map(entries.map((e) => [e.name, entries.find((o) => o.name === e.owner)!.internal]))

  /** Tokens left out per class (unknown to Tailwind), and classes left out entirely. */
  const skipped = new Map<string, Set<string>>()
  const failed = new Set<string>()
  const cssFailed = new Set<string>()
  for (const source of valid) {
    const problem = cssProblem(source.css)
    if (problem) {
      cssFailed.add(source.name)
      errors[source.name] = problem
    }
  }

  const ruleOf = (entry: Entry): { rule: string; top: string[] } => {
    const skip = skipped.get(entry.owner)
    const applies: string[] = []
    for (const token of classTokens(entry.source.styles)) {
      if (skip?.has(token)) continue
      const { prefix, bare, important } = splitClassToken(token)
      const target = internalOf.get(bare)
      // A class never applies itself.
      if (bare === entry.owner) continue
      applies.push(target ? `${prefix}${target}${important ? '!' : ''}` : token)
    }
    const { body, top } = cssFailed.has(entry.owner) ? { body: [], top: [] } : splitCss(entry.source.css ?? '')
    const lines = [...(applies.length > 0 ? [`@apply ${applies.join(' ')};`] : []), ...body]
    return { rule: `@utility ${entry.internal} {\n${lines.join('\n')}\n}`, top: entry.name === entry.owner ? top : [] }
  }

  const build = async (list: Entry[], all: Entry[]): Promise<string> => {
    const rules = all.map(ruleOf)
    const extra = [...rules.flatMap((r) => r.top), ...rules.map((r) => r.rule)].join('\n')
    const compiler = await compileFromInput({ ...input, entry: `${(input as { entry: string }).entry}\n${extra}\n` }, plugins)
    const staticLayers = countUtilityLayers(compiler.build([]))
    return extractUtilities(compiler.build(list.map((e) => e.internal)), staticLayers)
  }

  /** Which class a Tailwind error is about: the class whose styles hold the unknown token. */
  const ownerOfToken = (token: string, among: Entry[]) =>
    among.find((e) => e.name === e.owner && classTokens(e.source.styles).some((t) => t === token && !skipped.get(e.owner)?.has(t)))

  const usable = () => entries.filter((e) => !failed.has(e.owner))
  let css = ''
  let done = false
  // An unknown Tailwind class stops the whole compile: leave it out of its class and try again.
  for (let attempt = 0; attempt < 12 && !done; attempt++) {
    const list = usable()
    try {
      css = list.length > 0 ? await build(list, list) : ''
      done = true
    } catch (error) {
      const unknown = UNKNOWN_UTILITY.exec(message(error))?.[1]
      const owner = unknown ? ownerOfToken(unknown, list) : undefined
      if (!unknown || !owner) break
      const skip = skipped.get(owner.owner) ?? new Set<string>()
      skip.add(unknown)
      skipped.set(owner.owner, skip)
      errors[owner.owner] = [errors[owner.owner], `“${unknown}” is not a Tailwind class, so it was left out.`].filter(Boolean).join(' ')
    }
  }

  if (!done) {
    // Another problem (a broken custom CSS rule, a class that applies itself through another):
    // compile each class alone, with the classes it uses, and leave out the ones that fail.
    for (const entry of entries) {
      if (entry.name !== entry.owner || failed.has(entry.owner)) continue
      const needed = closure(entry, entries, internalOf)
      try {
        await build([entry], needed)
      } catch (error) {
        failed.add(entry.owner)
        errors[entry.owner] = message(error)
      }
    }
    try {
      const list = usable()
      css = list.length > 0 ? await build(list, list) : ''
    } catch (error) {
      css = ''
      for (const source of valid) errors[source.name] ??= message(error)
    }
  }

  const nameOf = new Map(entries.map((e) => [e.internal, e.name]))
  const renamed = css.replace(INTERNAL, (whole, index: string) => {
    const name = nameOf.get(`${INTERNAL_CLASS_PREFIX}${index}`)
    return name ? `.${name}` : whole
  })
  return { css: renamed, errors, names: entries.filter((e) => !failed.has(e.owner)).map((e) => e.name).toSorted() }
}

/** An entry and every entry its styles use, directly or through another class. */
function closure(entry: Entry, entries: Entry[], internalOf: Map<string, string>): Entry[] {
  const byInternal = new Map(entries.filter((e) => e.name === e.owner).map((e) => [e.internal, e]))
  const out = new Map<string, Entry>([[entry.internal, entry]])
  const queue = [entry]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const token of classTokens(current.source.styles)) {
      const target = internalOf.get(splitClassToken(token).bare)
      const next = target ? byInternal.get(target) : undefined
      if (next && !out.has(next.internal)) {
        out.set(next.internal, next)
        queue.push(next)
      }
    }
  }
  return [...out.values()]
}

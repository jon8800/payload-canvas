// Class string edits of the classes field (RawClasses.tsx). Pure, so they are tested without React.

import { classTokens } from '../../../classes/shared'

/** The class string with `remove` taken out and `add` put at the end, once each. */
export function changeClasses(className: string, remove: (token: string) => boolean, add: readonly string[] = []): string {
  const kept = classTokens(className).filter((token) => !remove(token))
  for (const token of add) if (!kept.includes(token)) kept.push(token)
  return kept.join(' ')
}

/** The class string with one class replaced in place by `next` (none, one or more classes). */
export function replaceToken(className: string, token: string, next: string): string {
  const out: string[] = []
  for (const item of classTokens(className)) {
    for (const value of item === token ? classTokens(next) : [item]) if (!out.includes(value)) out.push(value)
  }
  return out.join(' ')
}

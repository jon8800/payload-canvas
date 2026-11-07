// Values of a collection list's `where` that are read when the query runs, not stored as such:
// - a date relative to now: `$now`, `$now-30d`, `$now+12h` (units d and h);
// - a field of the page's document: `$page.<path>` (the same `$page` as in bindings);
// - a URL query value: `$query.<param>` (`?category=news`).
// Pure: the condition rows (admin) write them, `listQueries` (react/render/lists.ts) reads them.

import { PAGE_PATH } from './bindings'

/** Value prefix of a URL query value: `$query.category` reads `?category=`. */
export const QUERY_PATH = '$query'

/** A date token: `$now`, optionally with a shift of days or hours. */
export const DATE_TOKEN = /^\$now(?:([+-])(\d+)([dh]))?$/

/** A date relative to now. `amount` 0 is now; `direction` -1 is in the past ("ago"). */
export type RelativeDate = { amount: number; unit: 'd' | 'h'; direction: -1 | 1 }

/** The relative date of a date token, or null for any other value. */
export function parseDateToken(value: unknown): RelativeDate | null {
  if (typeof value !== 'string') return null
  const match = DATE_TOKEN.exec(value)
  if (!match) return null
  const [, sign, amount, unit] = match
  if (!sign) return { amount: 0, unit: 'd', direction: -1 }
  return { amount: Number(amount), unit: unit === 'h' ? 'h' : 'd', direction: sign === '-' ? -1 : 1 }
}

/** The date token of a relative date: `$now` for an amount of 0. */
export function dateToken(date: RelativeDate): string {
  const amount = Math.max(0, Math.floor(date.amount))
  return amount === 0 ? '$now' : `$now${date.direction < 0 ? '-' : '+'}${amount}${date.unit}`
}

/** `$page.<path>`: the value of a field of the page's document. */
export const pageToken = (path: string): string => `${PAGE_PATH}.${path}`

/** The field path of a `$page.<path>` value, or null. */
export function pageTokenPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(`${PAGE_PATH}.`)) return null
  return value.slice(PAGE_PATH.length + 1)
}

/** `$query.<param>`: the value of a URL query parameter. */
export const queryToken = (param: string): string => `${QUERY_PATH}.${param}`

/** The parameter of a `$query.<param>` value, or null. */
export function queryTokenParam(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(`${QUERY_PATH}.`)) return null
  return value.slice(QUERY_PATH.length + 1)
}

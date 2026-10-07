// The time shown in the top bar's "Saved · …" text. A pure helper, so it has a unit test.

type SaveTimeOptions = {
  /** The current time. Default: now. */
  now?: Date
  /** A BCP 47 locale. Default: the browser's. */
  locale?: string
  /** An IANA time zone. Default: the browser's. */
  timeZone?: string
}

/**
 * Today: the time only ("23:42"). Earlier this year: the day and the time ("12 Mar, 23:42").
 * An earlier year: also the year ("12 Mar 2025, 23:42"). An empty or invalid date gives "".
 */
export function formatSaveTime(iso: string | null | undefined, { now = new Date(), locale, timeZone }: SaveTimeOptions = {}): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
  const year = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(value)
  const time = { hour: '2-digit', minute: '2-digit' } as const
  if (day(date) === day(now)) return date.toLocaleTimeString(locale, { ...time, timeZone })
  const withYear = year(date) !== year(now)
  return date.toLocaleString(locale, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), ...time, timeZone })
}

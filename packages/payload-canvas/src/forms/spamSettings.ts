// Spam protection settings of a form (`spamProtection` group on the forms collection) and the
// values the site's form sends with a submission. Client-safe: no Payload runtime imports. The
// server checks live in `spam.ts`.

/** Name of the group field on the forms collection. */
export const FORM_SPAM_FIELD = 'spamProtection'

/** The key of the submission body that carries the spam values: `{ form, submissionData, spam }`. */
export const FORM_SPAM_KEY = 'spam'

/** Name of the honeypot input. People never see it; bots that fill every input fill it. */
export const HONEYPOT_NAME = 'website'

/** The generic message a blocked visitor sees. It never says which check failed. */
export const SPAM_BLOCKED_MESSAGE = 'Your message could not be sent. Please try again later.'

/** The form's settings as stored. Every key may be missing on forms saved before the field existed. */
export type FormSpamSettingsInput = {
  honeypot?: boolean | null
  minFillSeconds?: number | null
  turnstile?: boolean | null
  rateLimit?: { max?: number | null; windowMinutes?: number | null } | null
  /** Read-only, set on read: the Turnstile site key when Turnstile is on and both keys are set. */
  turnstileSiteKey?: string | null
}

export type FormSpamSettings = {
  honeypot: boolean
  minFillSeconds: number
  turnstile: boolean
  /** At most `max` submissions per visitor (IP) and form in `windowMinutes`. `max` 0: off. */
  rateLimit: { max: number; windowMinutes: number }
}

export const SPAM_DEFAULTS: FormSpamSettings = { honeypot: true, minFillSeconds: 3, turnstile: false, rateLimit: { max: 5, windowMinutes: 10 } }

const count = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback)

/** The settings with defaults for missing values: honeypot on, 3 seconds, no Turnstile, 5 per 10 minutes. */
export function spamSettings(value: FormSpamSettingsInput | null | undefined): FormSpamSettings {
  return {
    honeypot: value?.honeypot !== false,
    minFillSeconds: count(value?.minFillSeconds, SPAM_DEFAULTS.minFillSeconds),
    turnstile: value?.turnstile === true,
    rateLimit: {
      max: count(value?.rateLimit?.max, SPAM_DEFAULTS.rateLimit.max),
      windowMinutes: count(value?.rateLimit?.windowMinutes, SPAM_DEFAULTS.rateLimit.windowMinutes),
    },
  }
}

/**
 * What the site's form sends under `spam`: the honeypot input's value, the milliseconds between
 * the form showing and the submit (measured in the browser, so clock differences do not matter),
 * and the Turnstile token.
 */
export type FormSpamValues = {
  honeypot?: string | null
  elapsedMs?: number | null
  token?: string | null
}

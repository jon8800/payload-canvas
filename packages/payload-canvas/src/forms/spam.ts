// Spam protection for the forms of `@payloadcms/plugin-form-builder`, set per form:
// - `spamProtectionField()`: the `spamProtection` group for the forms collection (`formOverrides`).
// - `formSpamProtection()`: a submissions `beforeValidate` hook that checks every submission on the
//   server (honeypot, minimum fill time, Cloudflare Turnstile, a rate limit per IP and form; the IP
//   comes from a proxy header only when `trustedIpHeader` names it). A
//   blocked submission is logged and refused with one generic message, so nothing is stored.
// Server only. The client-safe settings and constants are in `spamSettings.ts`.

import { APIError, type CollectionBeforeValidateHook, type Field, type PayloadRequest } from 'payload'

import { memoryStore, WindowCounter, type CountStore } from './rateLimit'
import {
  FORM_SPAM_FIELD,
  FORM_SPAM_KEY,
  SPAM_BLOCKED_MESSAGE,
  spamSettings,
  type FormSpamSettings,
  type FormSpamSettingsInput,
  type FormSpamValues,
} from './spamSettings'

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

type Env = Record<string, string | undefined>

/** The Turnstile keys from `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Null unless both are set. */
export function turnstileKeys(env: Env = process.env): { siteKey: string; secretKey: string } | null {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim()
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim()
  return siteKey && secretKey ? { siteKey, secretKey } : null
}

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

export type SpamProtectionFieldOptions = {
  /** Where the Turnstile keys come from. Default `process.env`. */
  env?: Env
}

/**
 * The `spamProtection` group for the form-builder plugin's forms collection:
 * `formOverrides: { fields: ({ defaultFields }) => [...defaultFields, spamProtectionField()] }`.
 * `turnstileSiteKey` is virtual and hidden: on read it holds the site key when the form uses
 * Turnstile and both keys are set, so the site's form knows whether to show the widget.
 */
export function spamProtectionField(options: SpamProtectionFieldOptions = {}): Field {
  return {
    name: FORM_SPAM_FIELD,
    type: 'group',
    label: 'Spam protection',
    admin: { description: 'Checks that run on the server for every submission. Blocked submissions are not stored.' },
    fields: [
      {
        name: 'honeypot',
        type: 'checkbox',
        label: 'Honeypot',
        defaultValue: true,
        admin: { description: 'A hidden input that people never see. Bots that fill it in are blocked.' },
      },
      {
        name: 'minFillSeconds',
        type: 'number',
        label: 'Minimum fill time (seconds)',
        defaultValue: 3,
        min: 0,
        admin: { description: 'Submissions sent faster than this after the form shows are blocked. 0 turns it off.' },
      },
      {
        name: 'turnstile',
        type: 'checkbox',
        label: 'Cloudflare Turnstile',
        defaultValue: false,
        admin: { description: 'Shows a Turnstile check. Needs TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY on the server; without them it stays off.' },
      },
      {
        name: 'rateLimit',
        type: 'group',
        label: 'Rate limit',
        admin: { description: 'At most this many submissions per visitor (IP address) in the time window.' },
        fields: [
          { name: 'max', type: 'number', label: 'Submissions', defaultValue: 5, min: 0, admin: { description: '0 turns the limit off.' } },
          { name: 'windowMinutes', type: 'number', label: 'Minutes', defaultValue: 10, min: 1 },
        ],
      },
      {
        name: 'turnstileSiteKey',
        type: 'text',
        virtual: true,
        admin: { hidden: true, readOnly: true },
        hooks: {
          afterRead: [
            ({ siblingData }) => {
              if ((siblingData as FormSpamSettingsInput | undefined)?.turnstile !== true) return null
              return turnstileKeys(options.env)?.siteKey ?? null
            },
          ],
        },
      },
    ],
  } as Field
}

// ---------------------------------------------------------------------------
// Pure checks
// ---------------------------------------------------------------------------

export type SpamReason = 'honeypot' | 'too-fast' | 'turnstile' | 'rate-limit'

/** True when the honeypot input has a value. */
export function honeypotFilled(values: FormSpamValues | null | undefined): boolean {
  return typeof values?.honeypot === 'string' && values.honeypot.trim() !== ''
}

/**
 * True when the form was sent faster than the form allows. A missing time counts as too fast. A
 * heuristic only: the visitor's browser measures the time, so a bot can send any value. The real
 * checks are the honeypot, the rate limit and Turnstile.
 */
export function filledTooFast(values: FormSpamValues | null | undefined, settings: FormSpamSettings): boolean {
  if (settings.minFillSeconds <= 0) return false
  const elapsed = values?.elapsedMs
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed)) return true
  return elapsed < settings.minFillSeconds * 1000
}

/**
 * The request header that holds the visitor's IP, set by a proxy the server trusts:
 * - `x-forwarded-for`: behind one reverse proxy (nginx, Caddy, Traefik) that appends the address it
 *   sees. The rightmost entry is used: the visitor can write the entries before it.
 * - `x-real-ip`: a proxy that sets this header to the address it sees.
 * - `cf-connecting-ip`: behind Cloudflare, when only Cloudflare can reach the server.
 */
export type TrustedIpHeader = 'x-forwarded-for' | 'x-real-ip' | 'cf-connecting-ip'

/**
 * The visitor's IP from the trusted header, or null. No header is trusted by default: any visitor
 * can send these headers, and a proxy that the server does not sit behind does not fix them.
 */
export function clientIp(headers: Pick<Headers, 'get'> | null | undefined, trusted: TrustedIpHeader | null | undefined): string | null {
  if (!headers || !trusted) return null
  const value = headers.get(trusted)
  if (!value) return null
  if (trusted !== 'x-forwarded-for') return value.trim() || null
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean)
  return entries.at(-1) ?? null
}

/** Asks Cloudflare whether a Turnstile token is valid. A network error or a bad answer counts as invalid. */
export async function verifyTurnstile(args: { token: string | null | undefined; secretKey: string; ip?: string | null; fetch?: typeof fetch }): Promise<boolean> {
  if (typeof args.token !== 'string' || args.token === '') return false
  const body = new URLSearchParams({ secret: args.secretKey, response: args.token })
  if (args.ip) body.set('remoteip', args.ip)
  try {
    const response = await (args.fetch ?? fetch)(TURNSTILE_VERIFY_URL, { method: 'POST', body })
    if (!response.ok) return false
    const result = (await response.json()) as { success?: unknown }
    return result.success === true
  } catch {
    return false
  }
}

/** A short hash of the IP, so the store never holds addresses. */
async function ipHash(ip: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`form-rate:${ip}`))
  return Buffer.from(digest).toString('hex').slice(0, 32)
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export type FormSpamProtectionOptions = {
  /** Slug of the forms collection. Default "forms". */
  forms?: string
  /** Where the Turnstile keys come from. Default `process.env`. */
  env?: Env
  /** For tests: the fetch that calls Turnstile, the clock, the rate-limit store. */
  fetch?: typeof fetch
  now?: () => number
  store?: CountStore
  /**
   * The header that holds the visitor's IP (see `TrustedIpHeader`). Default: none, so the rate
   * limit is off. Set it to what the proxy in front of the server sets.
   */
  trustedIpHeader?: TrustedIpHeader
  /** The visitor's IP, for other setups. Wins over `trustedIpHeader`. Without an IP the rate limit does not apply. */
  ipOf?: (req: PayloadRequest) => string | null
}

/**
 * `context` flag of a submission the site's no-JavaScript route sends (a native form post). The
 * fill time cannot be measured without JavaScript: that check passes. A form that uses Turnstile
 * is refused (the check needs the widget). Only server code can set `context`.
 */
export const FORM_NO_SCRIPT_CONTEXT = 'builderFormNoScript'

/** The message for a form with Turnstile sent without JavaScript. */
export const TURNSTILE_NEEDS_SCRIPT_MESSAGE = 'This form needs JavaScript for its spam check. Turn on JavaScript and send it again.'

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

type CheckArgs = {
  values: FormSpamValues | null | undefined
  settings: FormSpamSettings
  ip: string | null
  formId: string | number | null
  env: Env
  fetch?: typeof fetch
  store: CountStore
  counter: WindowCounter
}

/** Runs the checks, cheapest first. The rate limit counts only submissions that pass the others. */
export async function checkSubmission(args: CheckArgs): Promise<{ ok: true } | { ok: false; reason: SpamReason }> {
  const { settings, values } = args
  if (settings.honeypot && honeypotFilled(values)) return { ok: false, reason: 'honeypot' }
  if (filledTooFast(values, settings)) return { ok: false, reason: 'too-fast' }
  const keys = settings.turnstile ? turnstileKeys(args.env) : null
  if (keys && !(await verifyTurnstile({ token: values?.token, secretKey: keys.secretKey, ip: args.ip, fetch: args.fetch }))) {
    return { ok: false, reason: 'turnstile' }
  }
  if (args.ip && settings.rateLimit.max > 0) {
    const key = `website-builder:form-rate:${String(args.formId ?? 'none')}:${await ipHash(args.ip)}`
    const taken = await args.counter.take(args.store, key, settings.rateLimit.max, settings.rateLimit.windowMinutes * 60_000)
    if (!taken.ok) return { ok: false, reason: 'rate-limit' }
  }
  return { ok: true }
}

/**
 * The submissions hook. Put it first in the form-builder plugin's submissions hooks:
 * `formSubmissionOverrides: { hooks: { beforeValidate: [formSpamProtection(), formSubmissionConditions()] } }`.
 * Runs on create only. The site's form sends `{ form, submissionData, spam }`; `spam` is always
 * removed from the data, so it is never stored. Server code (Local API) and signed-in admin users
 * who send no `spam` values (the admin's create view) are not checked.
 */
export function formSpamProtection(options: FormSpamProtectionOptions = {}): CollectionBeforeValidateHook {
  const formsSlug = options.forms ?? 'forms'
  const counter = new WindowCounter(options.now)
  const memory = memoryStore()
  return async ({ context, data, operation, req }) => {
    if (operation !== 'create' || !data) return data
    const { [FORM_SPAM_KEY]: raw, ...rest } = data as Record<string, unknown>
    // Server code (Local API) that sends no spam values is not checked. The site's no-JavaScript route sends them.
    if (req.payloadAPI === 'local' && raw === undefined) return rest
    const adminUser = req.user && req.user.collection === req.payload.config.admin?.user
    if (adminUser && raw === undefined) return rest

    const values = raw && typeof raw === 'object' ? (raw as FormSpamValues) : null
    const formId = idOf(rest.form)
    const form =
      formId === null
        ? null
        : ((await req.payload.findByID({ collection: formsSlug as never, id: formId, depth: 0, req, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null)
    const stored = spamSettings(form?.[FORM_SPAM_FIELD] as FormSpamSettingsInput | undefined)
    const noScript = context?.[FORM_NO_SCRIPT_CONTEXT] === true
    if (noScript && stored.turnstile && turnstileKeys(options.env ?? process.env)) throw new APIError(TURNSTILE_NEEDS_SCRIPT_MESSAGE, 400, null, true)
    // Without JavaScript the fill time is not measured: that check passes. The honeypot and the rate limit stay.
    const settings = noScript ? { ...stored, minFillSeconds: 0 } : stored
    const ip = options.ipOf ? options.ipOf(req) : clientIp(req.headers, options.trustedIpHeader)
    const result = await checkSubmission({
      values,
      settings,
      ip,
      formId,
      env: options.env ?? process.env,
      fetch: options.fetch,
      store: options.store ?? (req.payload as { kv?: CountStore }).kv ?? memory,
      counter,
    })
    if (result.ok) return rest
    req.payload.logger.warn({ msg: 'Form submission blocked', form: formId, reason: result.reason, ip })
    throw new APIError(SPAM_BLOCKED_MESSAGE, result.reason === 'rate-limit' ? 429 : 400, null, true)
  }
}

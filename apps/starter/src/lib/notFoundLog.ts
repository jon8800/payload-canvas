// The 404 log (the `not-found-log` collection): which paths visitors asked for that do not exist.
// Pure helpers, shared by the site (writes) and the dashboard (reads). No server imports.

export const NOT_FOUND_LOG = 'not-found-log'

/** Longest path the log keeps. Longer ones are scanner noise. */
const MAX_PATH = 300

/** Longest referrer the log keeps. */
const MAX_REFERRER = 500

/** File types a site built with the builder never serves: requests for them are bots probing for holes. */
const JUNK_EXTENSION = /\.(php\d?|aspx?|asp|jsp|cgi|pl|env|ini|sql|bak|old|swp|log|ya?ml|config|conf|git|svn|ds_store|zip|tar|gz|rar|7z)$/i

/** Paths of other platforms and admin tools that bots scan for. */
const JUNK_PREFIX = /^\/(wp-|wordpress|wp\/|xmlrpc|cgi-bin|phpmyadmin|pma|myadmin|vendor\/|administrator|owa\/|autodiscover|actuator|boaform|hnap1|remote\/|_ignition|telescope|solr|druid|console\/)/i

/** True for paths only bots ask for: other platforms' admin pages, scripts, dot files. */
export function isJunkPath(path: string): boolean {
  if (JUNK_PREFIX.test(path) || JUNK_EXTENSION.test(path)) return true
  // Dot files and folders (`/.env`, `/.git/config`, `/.well-known/…`): never pages of the site.
  return path.split('/').some((segment) => segment.startsWith('.'))
}

/**
 * The path the log stores for a request, or null when it should not be logged: no query or hash,
 * no trailing slash, decoded where it is safe. Null for junk paths and very long ones.
 */
export function notFoundPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  let path = raw.split(/[?#]/, 1)[0] ?? ''
  try {
    path = decodeURI(path)
  } catch {
    // Keep the encoded form when it does not decode.
  }
  path = `/${path.replace(/^\/+/, '').replace(/\/{2,}/g, '/')}`
  if (path.length > 1) path = path.replace(/\/+$/, '')
  if (path.length > MAX_PATH || path.includes('\0')) return null
  return isJunkPath(path) ? null : path
}

/** The referrer the log stores: trimmed and shortened, or null. */
export function notFoundReferrer(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  return value ? value.slice(0, MAX_REFERRER) : null
}

export type NotFoundEntry = { path: string; hits: number; lastSeen: string; lastReferrer?: string | null }

/**
 * The data to save for a new hit: a new entry (one hit) or the existing one with one more hit.
 * A hit without a referrer keeps the last known referrer.
 */
export function nextNotFoundEntry(
  existing: Pick<NotFoundEntry, 'hits' | 'lastReferrer'> | null,
  hit: { path: string; referrer: string | null; now: Date },
): NotFoundEntry {
  const previous = existing && Number.isFinite(existing.hits) ? existing.hits : 0
  return {
    path: hit.path,
    hits: previous + 1,
    lastSeen: hit.now.toISOString(),
    lastReferrer: hit.referrer ?? existing?.lastReferrer ?? null,
  }
}

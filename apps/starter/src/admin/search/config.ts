/**
 * What the admin search (Ctrl+K) leaves out, and what it offers before anything is typed.
 *
 * The search reads every other collection from its own config: `admin.useAsTitle` plus
 * `admin.listSearchableFields`, the fields Payload's list view searches. To make a collection
 * findable by more fields, add them to its `listSearchableFields`.
 */

/**
 * Collections the search never reads: logs and job runs nobody opens by name, and the search
 * plugin's index (`search`), which repeats the pages and posts. Hidden collections are left out anyway.
 */
export const SEARCH_EXCLUDE: string[] = ['not-found-log', 'payload-jobs', 'search']

/** Shown under "Go to" before anything is typed, in this order. Slugs that do not exist are skipped. */
export const SEARCH_STARTERS: string[] = ['pages', 'posts', 'media', 'forms', 'site-settings']

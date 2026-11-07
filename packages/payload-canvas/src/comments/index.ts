// Comments on the canvas: a plugin collection of comment threads on blocks. Server entry.
// See the README section "Comments on the canvas".

import type { CollectionConfig } from 'payload'

import { commentsCollection } from './collection'
import type { CommentsOptions } from './config'
import { DEFAULT_COMMENTS_SLUG, type CommentsClientConfig } from './shared'

export * from './shared'
export type { CommentsOptions } from './config'
export { commentWrite, commentsCollection, type CommentWrite, type CommentWriteResult } from './collection'

export type ResolvedComments = { client: CommentsClientConfig; collection: CollectionConfig }

/**
 * The comments collection and the editor's config, from the plugin's `comments` option (on by
 * default; `false` turns it off). Throws on a slug clash.
 */
export function resolveComments(
  option: CommentsOptions | boolean | undefined,
  args: { collections: readonly { slug: string }[]; userSlug: string | undefined },
): ResolvedComments | null {
  if (option === false) return null
  const options = option === true || option === undefined ? {} : option
  const slug = options.slug ?? DEFAULT_COMMENTS_SLUG
  if (args.collections.some((c) => c.slug === slug)) {
    throw new Error(`[websiteBuilder] A collection named "${slug}" already exists. Set \`comments.slug\` to another name, or \`comments: false\`.`)
  }
  // `author` links to the admin's user collection when it exists now.
  const userSlug = args.userSlug && args.collections.some((c) => c.slug === args.userSlug) ? args.userSlug : null
  return { client: { collection: slug }, collection: commentsCollection(slug, options, { userSlug }) }
}

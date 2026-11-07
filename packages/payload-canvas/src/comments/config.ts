// Options of the comments collection. Type imports only from `payload`.

import type { CollectionConfig } from 'payload'

export type CommentsOptions = {
  /** Slug of the comments collection. Default "builder-comments". */
  slug?: string
  /**
   * Access control. Default: signed-in users read; users who may change a page comment on it,
   * reply and resolve; authors edit their own text and delete their own comments.
   * The update-access check of the page always runs (in a hook), also with your own `access`.
   */
  access?: CollectionConfig['access']
  /** Merged into the collection's `admin` options (e.g. `group`). */
  admin?: CollectionConfig['admin']
  /** Extra hooks. They run after the plugin's own hooks. */
  hooks?: CollectionConfig['hooks']
}

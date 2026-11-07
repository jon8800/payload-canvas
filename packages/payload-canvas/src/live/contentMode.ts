// Who may change the design (`websiteBuilder({ editor: { canEditDesign } })`). Users for whom it
// returns false are in content mode: every write path refuses design changes from them
// (core/contentMode.ts has the rule). Server-only.

import type { PayloadRequest } from 'payload'

import type { EditorOptions } from '../core/types'

/** Key under `config.custom` where the plugin stores `canEditDesign`. */
export const CONTENT_MODE_KEY = 'websiteBuilderContentMode'

type CanEditDesign = NonNullable<EditorOptions['canEditDesign']>

/** What the plugin stores under `CONTENT_MODE_KEY`. */
export type ContentModeConfig = { canEditDesign?: CanEditDesign }

/**
 * True when the request's user may change the design. Without a `canEditDesign` option everyone
 * may. A function that throws counts as "no": a failed check never opens design edits.
 */
export async function canEditDesign(req: PayloadRequest): Promise<boolean> {
  const check = (req.payload?.config?.custom?.[CONTENT_MODE_KEY] as ContentModeConfig | undefined)?.canEditDesign
  if (!check) return true
  try {
    return (await check({ req, user: req.user })) === true
  } catch (error) {
    req.payload.logger.error({ err: error, msg: '[websiteBuilder] editor.canEditDesign failed; the user gets content mode.' })
    return false
  }
}

type AccessFn = (args: { req: PayloadRequest } & Record<string, unknown>) => unknown
type WithAccess = { access?: Record<string, unknown> }

/**
 * The collection (or a global, with `['update']`) with write access only for users who may
 * change the design: editable classes and the theme are design, so content mode cannot change them.
 * Read access stays as it was.
 */
export function withDesignAccess<T extends WithAccess>(config: T, operations: readonly string[] = ['create', 'update', 'delete']): T {
  const access: Record<string, unknown> = { ...config.access }
  for (const operation of operations) {
    const own = access[operation] as AccessFn | undefined
    // Payload's default when an operation has no access function: any signed-in user.
    access[operation] = async (args: { req: PayloadRequest } & Record<string, unknown>) => {
      if (!(await canEditDesign(args.req))) return false
      return own ? own(args) : Boolean(args.req.user)
    }
  }
  return { ...config, access }
}

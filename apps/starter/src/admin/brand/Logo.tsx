import type { ServerProps } from 'payload'

import { BRAND } from './brand'
import { Mark } from './Mark'

/**
 * `admin.components.graphics.Logo`: the mark and the site name on the login page and the other
 * signed-out pages (forgot password, reset password, create first user).
 */
export async function Logo({ payload }: ServerProps) {
  const settings = await payload?.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch(() => null)
  const name = settings?.siteName?.trim() || BRAND.name
  return (
    <span className="brand-logo">
      <Mark size={40} />
      <span className="brand-logo__name">{name}</span>
    </span>
  )
}

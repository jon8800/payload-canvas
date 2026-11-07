import { ExternalLink, FilePlus2, ImagePlus, type LucideIcon, PenLine, SquarePen } from 'lucide-react'
import Link from 'next/link'
import { builderViewPath } from 'payload-canvas'

import { HOME_SLUG, MEDIA_COLLECTION } from '../lib'
import { can, type WidgetProps } from '../server'
import { WidgetCard } from '../WidgetCard'

type Action = { href: string; label: string; icon: LucideIcon; external?: boolean }

/** Buttons for the most common tasks. Each one shows only when the user may do it. */
export async function QuickActions({ req, permissions }: WidgetProps) {
  const adminRoute = req.payload.config.routes.admin
  const prefix = adminRoute === '/' ? '' : adminRoute
  const actions: Action[] = []

  if (can(req, permissions, 'pages', 'update')) {
    const home = await req.payload.find({
      collection: 'pages',
      depth: 0,
      draft: true,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      req,
      select: {},
      where: { slug: { equals: HOME_SLUG } },
    })
    const id = home.docs[0]?.id
    if (id !== undefined) actions.push({ href: builderViewPath(adminRoute, 'pages', id), label: 'Edit home page', icon: PenLine })
  }
  if (can(req, permissions, 'pages', 'create')) {
    actions.push({ href: `${prefix}/collections/pages/create`, label: 'New page', icon: FilePlus2 })
  }
  if (can(req, permissions, 'posts', 'create')) {
    actions.push({ href: `${prefix}/collections/posts/create`, label: 'New post', icon: SquarePen })
  }
  if (can(req, permissions, MEDIA_COLLECTION, 'create')) {
    actions.push({ href: `${prefix}/collections/${MEDIA_COLLECTION}/create`, label: 'Upload media', icon: ImagePlus })
  }
  actions.push({ href: '/', label: 'View site', icon: ExternalLink, external: true })

  return (
    <WidgetCard title="Quick actions">
      <div className="dash-actions">
        {actions.map(({ href, label, icon: Icon, external }) => {
          const content = (
            <>
              <Icon aria-hidden size={18} strokeWidth={1.75} />
              <span>{label}</span>
            </>
          )
          if (external) {
            return (
              <a className="dash-action" href={href} key={label} rel="noreferrer" target="_blank">
                {content}
              </a>
            )
          }
          return (
            <Link className="dash-action" href={href} key={label}>
              {content}
            </Link>
          )
        })}
      </div>
    </WidgetCard>
  )
}

import { getTranslation } from '@payloadcms/translations'
import { NavSidebarToggle, NavWrapper, SettingsMenuButton, UserMenu } from '@payloadcms/ui'
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { groupNavItems } from '@payloadcms/ui/shared'
import { LayoutDashboard } from 'lucide-react'
import type { PayloadRequest, ServerProps, VisibleEntities } from 'payload'
import { formatAdminURL, PREFERENCE_KEYS, EntityType } from 'payload/shared'
import type { ComponentProps, ReactNode } from 'react'

import { FALLBACK_ICON, NAV_GROUPS, NAV_ICONS } from './config'
import { groupEntities, type NavEntity } from './groups'
import { NavClient, type NavClientSection } from './NavClient'

type NavProps = ServerProps & {
  req?: PayloadRequest
  visibleEntities?: VisibleEntities
  // What Payload 4 passes its default nav for the user menu in the sidebar header.
  CustomAvatar?: ReactNode
  CustomLogoutButton?: ReactNode
  settingsItemGroups?: ComponentProps<typeof UserMenu>['settingsItemGroups']
}
type NavPreferences = { groups?: Record<string, { open?: boolean }> }

const ICON_SIZE = 16

async function navPreferences(req: PayloadRequest | undefined): Promise<NavPreferences | null> {
  if (!req?.user?.collection) return null
  const result = await req.payload.find({
    collection: 'payload-preferences',
    depth: 0,
    limit: 1,
    pagination: false,
    req,
    where: {
      and: [
        { key: { equals: PREFERENCE_KEYS.NAV } },
        { 'user.relationTo': { equals: req.user.collection } },
        { 'user.value': { equals: req.user.id } },
      ],
    },
    overrideAccess: true,
  })
  return (result.docs[0]?.value as NavPreferences | undefined) ?? null
}

/**
 * The admin sidebar: a Dashboard link, then the collections and globals in groups with icons
 * (see `config.ts`). It keeps Payload 4's nav frame (the user menu, the sidebar toggle and the
 * settings menu) and its classes, so collapse, the mobile sheet and the plugins' nav slots work as before.
 */
export async function Nav(props: NavProps) {
  const { i18n, locale, params, payload, permissions, req, searchParams, user, visibleEntities } = props
  if (!payload?.config || !i18n || !permissions || !visibleEntities) return null
  const { collections, globals, routes, admin } = payload.config
  const { afterNav, afterNavLinks, beforeNav, beforeNavLinks, settingsMenu } = admin.components

  // Payload's own grouping applies read access and labels.
  const payloadGroups = groupNavItems(
    [
      ...collections
        .filter(({ slug }) => visibleEntities.collections.includes(slug))
        .map((entity) => ({ type: EntityType.collection as const, entity })),
      ...globals
        .filter(({ slug }) => visibleEntities.globals.includes(slug))
        .map((entity) => ({ type: EntityType.global as const, entity })),
    ],
    permissions,
    i18n,
  )
  const entities: NavEntity[] = payloadGroups.flatMap((group) =>
    group.entities.map((entity) => ({
      slug: entity.slug,
      type: entity.type === EntityType.global ? ('globals' as const) : ('collections' as const),
      label: getTranslation(entity.label, i18n),
      group: group.label,
    })),
  )

  const sections: NavClientSection[] = groupEntities(entities, NAV_GROUPS).map((section) => ({
    label: section.label,
    items: section.entities.map((entity) => {
      const Icon = NAV_ICONS[entity.slug] ?? FALLBACK_ICON
      return {
        id: entity.type === 'globals' ? `nav-global-${entity.slug}` : `nav-${entity.slug}`,
        href: formatAdminURL({ adminRoute: routes.admin, path: `/${entity.type}/${entity.slug}` }),
        label: entity.label,
        icon: <Icon aria-hidden size={ICON_SIZE} strokeWidth={1.75} />,
      }
    }),
  }))

  const serverProps = { i18n, locale, params, payload, permissions, searchParams, user }
  const render = (Component: Parameters<typeof RenderServerComponent>[0]['Component'], key?: string) =>
    RenderServerComponent({ Component, importMap: payload.importMap, key, serverProps })

  return (
    <NavWrapper
      baseClass="nav"
      header={
        <div className="nav__header">
          <UserMenu CustomAvatar={props.CustomAvatar} CustomLogoutButton={props.CustomLogoutButton} settingsItemGroups={props.settingsItemGroups} showTitle />
          <NavSidebarToggle baseClass="nav" />
        </div>
      }
    >
      {render(beforeNav)}
      <nav className="nav__wrap admin-nav">
        {render(beforeNavLinks)}
        <NavClient
          dashboard={{
            href: formatAdminURL({ adminRoute: routes.admin, path: '' }),
            icon: <LayoutDashboard aria-hidden size={ICON_SIZE} strokeWidth={1.75} />,
            label: i18n.t('general:dashboard'),
          }}
          preferences={(await navPreferences(req))?.groups ?? {}}
          sections={sections}
        />
        {render(afterNavLinks)}
        <div className="nav__controls">
          <SettingsMenuButton settingsMenu={(Array.isArray(settingsMenu) ? settingsMenu : []).map((item, index) => render(item, `settings-menu-item-${index}`))} />
        </div>
      </nav>
      {render(afterNav)}
    </NavWrapper>
  )
}

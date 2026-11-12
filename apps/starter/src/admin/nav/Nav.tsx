import { getTranslation } from '@payloadcms/translations'
import { AlignJustifiedIcon, NavSidebarToggle, NavWrapper, SettingsMenuButton, SidebarTabsClient, UserMenu } from '@payloadcms/ui'
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { getNavPrefs } from '@payloadcms/ui/rsc'
import { groupNavItems } from '@payloadcms/ui/shared'
import { LayoutDashboard } from 'lucide-react'
import type { PayloadRequest, ServerProps, VisibleEntities } from 'payload'
import { formatAdminURL, EntityType } from 'payload/shared'
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

const ICON_SIZE = 16
/** Payload's slug for the sidebar tab with the collection links. */
const NAV_TAB = 'nav'

/**
 * The admin sidebar. Payload 4's default nav with one change: its links tab (`nav`) shows the
 * collections and globals in our groups with icons (see `config.ts`), after a Dashboard link.
 * Everything else is Payload's: the user menu, the sidebar toggle, the settings menu, the nav
 * slots (`beforeNav`, `beforeNavLinks`, `afterNavLinks`, `afterNav`) and the extra sidebar tabs in
 * `admin.components.sidebar.tabs`, which Payload loads on demand. Payload 4.0 beta cannot replace
 * only its links tab yet, so this replaces `Nav` and builds the same frame from Payload's parts.
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

  const preferences = req ? await getNavPrefs(req) : null
  const serverProps = { i18n, locale, params, payload, permissions, req, searchParams, user }
  const render = (Component: Parameters<typeof RenderServerComponent>[0]['Component'], key?: string) =>
    RenderServerComponent({ Component, importMap: payload.importMap, key, serverProps })

  // One box for the links tab, so its rows keep their spacing inside Payload's tab panel too.
  const linksTab = (
    <div className="admin-nav__links">
      {render(beforeNavLinks)}
      <NavClient
        dashboard={{
          href: formatAdminURL({ adminRoute: routes.admin, path: '' }),
          icon: <LayoutDashboard aria-hidden size={ICON_SIZE} strokeWidth={1.75} />,
          label: i18n.t('general:dashboard'),
        }}
        preferences={preferences?.groups ?? {}}
        sections={sections}
      />
      {render(afterNavLinks)}
    </div>
  )

  // Other tabs come from the config, the same way Payload's default nav adds them. Payload loads a
  // tab's content when it is opened (the `render-tab` server function); only the open tab renders here.
  const extraTabs = (admin.components.sidebar?.tabs ?? []).filter((tab) => !tab.disabled && tab.slug !== NAV_TAB)
  const openSlug = [NAV_TAB, ...extraTabs.map((tab) => tab.slug)].includes(preferences?.activeTab ?? '') ? preferences!.activeTab! : NAV_TAB
  const tabContents: Record<string, ReactNode> = { [NAV_TAB]: linksTab }
  const openTab = extraTabs.find((tab) => tab.slug === openSlug)
  if (openTab) tabContents[openTab.slug] = render(openTab.components.Content)
  const tabs = [
    { slug: NAV_TAB, icon: <AlignJustifiedIcon size={24} />, isDefaultActive: true, label: i18n.t('general:collections'), lazyLoadable: false },
    ...extraTabs.map((tab) => ({
      slug: tab.slug,
      icon: render(tab.components.Icon),
      isDefaultActive: tab.isDefaultActive,
      label: tab.label ? getTranslation(tab.label, i18n) : tab.slug,
      lazyLoadable: true,
    })),
  ]

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
        <SidebarTabsClient baseClass="sidebar-tabs" initialActiveTabID={openSlug} initialTabContents={tabContents} tabs={tabs} />
        <div className="nav__controls">
          <SettingsMenuButton settingsMenu={(Array.isArray(settingsMenu) ? settingsMenu : []).map((item, index) => render(item, `settings-menu-item-${index}`))} />
        </div>
      </nav>
      {render(afterNav)}
    </NavWrapper>
  )
}

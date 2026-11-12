'use client'

import { Link, NavGroup, usePathname } from '@payloadcms/ui'
import type { ReactNode } from 'react'

import { isActivePath } from './groups'
import './nav.css'

export type NavClientItem = { id?: string; href: string; label: string; icon: ReactNode }
export type NavClientSection = { label: string; items: NavClientItem[] }

type Props = {
  sections: NavClientSection[]
  dashboard: NavClientItem
  preferences: Record<string, { open?: boolean }>
}

function NavLink({ item, active, current }: { item: NavClientItem; active: boolean; current: boolean }) {
  const className = ['nav__link', 'admin-nav__link', active && 'nav__link--selected admin-nav__link--active'].filter(Boolean).join(' ')
  return (
    <div className="nav__link-wrapper">
      <Link aria-current={current ? 'page' : active ? 'location' : undefined} className={className} href={item.href} id={item.id} prefetch={false}>
        <span className="admin-nav__icon">{item.icon}</span>
        <span className="nav__link-label">{item.label}</span>
      </Link>
    </div>
  )
}

/** The sidebar links: Dashboard, then the groups with icons. Payload's nav classes and `NavGroup` keep collapse working. */
export function NavClient({ sections, dashboard, preferences }: Props) {
  const pathname = usePathname()
  return (
    <>
      <div className="admin-nav__top">
        <NavLink active={pathname === dashboard.href} current={pathname === dashboard.href} item={dashboard} />
      </div>
      {sections.map((section) => (
        <NavGroup isOpen={preferences[section.label]?.open} key={section.label} label={section.label}>
          {section.items.map((item) => (
            <NavLink active={isActivePath(pathname, item.href)} current={pathname === item.href} item={item} key={item.href} />
          ))}
        </NavGroup>
      ))}
    </>
  )
}

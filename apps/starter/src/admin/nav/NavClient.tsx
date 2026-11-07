'use client'

import { Hamburger, Link, NavGroup, useNav } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { isActivePath } from './groups'
import './nav.scss'

export type NavClientItem = { id?: string; href: string; label: string; icon: ReactNode }
export type NavClientSection = { label: string; items: NavClientItem[] }

type Props = {
  sections: NavClientSection[]
  dashboard: NavClientItem
  preferences: Record<string, { open?: boolean }>
  logout: ReactNode
  beforeNav: ReactNode
  afterNav: ReactNode
  beforeNavLinks: ReactNode
  afterNavLinks: ReactNode
}

function NavLink({ item, active, current }: { item: NavClientItem; active: boolean; current: boolean }) {
  const className = ['nav__link', 'admin-nav__link', active && 'admin-nav__link--active'].filter(Boolean).join(' ')
  const content = (
    <>
      <span className="admin-nav__icon">{item.icon}</span>
      <span className="nav__link-label">{item.label}</span>
    </>
  )
  // Payload renders the current page as plain text, not a link to itself.
  if (current) {
    return (
      <div aria-current="page" className={className} id={item.id}>
        {content}
      </div>
    )
  }
  return (
    <Link className={className} href={item.href} id={item.id} prefetch={false}>
      {content}
    </Link>
  )
}

/** The sidebar markup. Uses Payload's nav classes and `useNav`, so collapse and the mobile menu keep working. */
export function NavClient({ sections, dashboard, preferences, logout, beforeNav, afterNav, beforeNavLinks, afterNavLinks }: Props) {
  const pathname = usePathname()
  const { hydrated, navOpen, navRef, setNavOpen, shouldAnimate } = useNav()
  const className = ['nav', 'admin-nav', navOpen && 'nav--nav-open', shouldAnimate && 'nav--nav-animate', hydrated && 'nav--nav-hydrated']
    .filter(Boolean)
    .join(' ')

  return (
    <aside className={className} inert={!navOpen ? true : undefined}>
      <div className="nav__scroll" ref={navRef}>
        {beforeNav}
        <nav className="nav__wrap">
          {beforeNavLinks}
          <div className="admin-nav__top">
            <NavLink active={pathname === dashboard.href} current={pathname === dashboard.href} item={dashboard} />
          </div>
          {sections.map((section) => (
            <NavGroup isOpen={preferences[section.label]?.open} key={section.label} label={section.label}>
              {section.items.map((item) => (
                <NavLink
                  active={isActivePath(pathname, item.href)}
                  current={pathname === item.href}
                  item={item}
                  key={item.href}
                />
              ))}
            </NavGroup>
          ))}
          {afterNavLinks}
          <div className="nav__controls">{logout}</div>
        </nav>
        {afterNav}
        <div className="nav__header">
          <div className="nav__header-content">
            <button
              className="nav__mobile-close"
              onClick={() => setNavOpen(false)}
              tabIndex={!navOpen ? -1 : undefined}
              type="button"
            >
              <Hamburger isActive />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

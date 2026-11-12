import Link from 'next/link'
import type { ReactNode } from 'react'

import './dashboard.css'
import './widget-previews.css'

type Props = {
  title: string
  /** A link in the top right corner, such as "View all". */
  action?: { href: string; label: string }
  children: ReactNode
}

/** The frame every dashboard widget uses: a title row and the content. */
export function WidgetCard({ title, action, children }: Props) {
  return (
    <section className="dash-card">
      <header className="dash-card__header">
        <h2 className="dash-card__title">{title}</h2>
        {action && (
          <Link className="dash-card__action" href={action.href}>
            {action.label}
          </Link>
        )}
      </header>
      <div className="dash-card__body">{children}</div>
    </section>
  )
}

/** The text a widget shows when it has nothing to list. */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="dash-empty">{children}</p>
}

export type ListRow = {
  key: string
  href: string
  title: string
  meta?: ReactNode
  badge?: { label: string; tone: 'draft' | 'scheduled' | 'neutral' | 'new' }
  icon?: ReactNode
  /** A second link at the end of the row, such as "Create redirect". */
  action?: { href: string; label: string }
}

/** A list of links with a title, a muted line below it, and an optional badge. */
export function WidgetList({ rows }: { rows: ListRow[] }) {
  return (
    <ul className="dash-list">
      {rows.map((row) => (
        <li key={row.key} className={row.action ? 'dash-list__item' : undefined}>
          <Link className="dash-list__row" href={row.href}>
            {row.icon && <span className="dash-list__icon">{row.icon}</span>}
            <span className="dash-list__text">
              <span className="dash-list__title">{row.title}</span>
              {row.meta && <span className="dash-list__meta">{row.meta}</span>}
            </span>
            {row.badge && <span className={`dash-badge dash-badge--${row.badge.tone}`}>{row.badge.label}</span>}
          </Link>
          {row.action && (
            <Link className="dash-list__action" href={row.action.href}>
              {row.action.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}

/** A titled part of a widget, for widgets that show more than one list. */
export function WidgetSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="dash-section">
      <h3 className="dash-section__title">
        {title}
        {count !== undefined && <span className="dash-section__count">{count}</span>}
      </h3>
      {children}
    </div>
  )
}

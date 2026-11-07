import { CircleCheck, CircleAlert } from 'lucide-react'
import Link from 'next/link'
import type { CollectionSlug, Where } from 'payload'

import { emptyField, listURL, MEDIA_COLLECTION } from '../lib'
import { can, contentCollections, type WidgetProps } from '../server'
import { WidgetCard } from '../WidgetCard'

type Check = { key: string; label: string; collection: CollectionSlug; where: Where }

/** Counts the documents that miss something search engines or screen readers need. Each row opens the list of them. */
export async function SiteChecks({ req, permissions }: WidgetProps) {
  const adminRoute = req.payload.config.routes.admin
  const checks: Check[] = []

  for (const collection of contentCollections(req, permissions)) {
    const fields = req.payload.collections[collection.slug].config.flattenedFields
    // The SEO plugin's fields live in the `meta` group.
    if (!fields.some((field) => field.name === 'meta')) continue
    const plural = req.payload.collections[collection.slug].config.labels.plural
    const name = (typeof plural === 'string' ? plural : collection.slug).toLowerCase()
    checks.push(
      { key: `${collection.slug}-title`, label: `${capitalize(name)} without an SEO title`, collection: collection.slug, where: emptyField('meta.title') },
      { key: `${collection.slug}-description`, label: `${capitalize(name)} without an SEO description`, collection: collection.slug, where: emptyField('meta.description') },
    )
  }
  if (can(req, permissions, MEDIA_COLLECTION)) {
    checks.push({ key: 'media-alt', label: 'Images without alt text', collection: MEDIA_COLLECTION as CollectionSlug, where: emptyField('alt') })
  }

  const counts = await Promise.all(
    checks.map((check) =>
      req.payload
        .count({ collection: check.collection, overrideAccess: false, req, where: check.where })
        .then((result) => result.totalDocs)
        .catch(() => 0),
    ),
  )
  const issues = checks.map((check, index) => ({ ...check, count: counts[index] ?? 0 }))
  const total = issues.reduce((sum, issue) => sum + issue.count, 0)

  return (
    <WidgetCard title="Site checks">
      {total === 0 && <p className="dash-checks__ok">Everything looks good.</p>}
      <ul className="dash-checks">
        {issues.map((issue) => {
          const ok = issue.count === 0
          const Icon = ok ? CircleCheck : CircleAlert
          const content = (
            <>
              <Icon aria-hidden className="dash-checks__icon" size={16} strokeWidth={1.75} />
              <span className="dash-checks__label">{issue.label}</span>
              <span className="dash-checks__count">{issue.count}</span>
            </>
          )
          return (
            <li key={issue.key}>
              {ok ? (
                <span className="dash-checks__row dash-checks__row--ok">{content}</span>
              ) : (
                <Link className="dash-checks__row" href={listURL(adminRoute, issue.collection, issue.where)}>
                  {content}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </WidgetCard>
  )
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

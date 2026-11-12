import type { DashboardConfig, Field, Widget, WidgetInstance } from 'payload'

import { analyticsProvider } from './analytics'

// The dashboard widgets (Payload's modular dashboard). Each user can move, resize, add and remove
// widgets with "Edit dashboard"; Payload saves that layout per user. This file sets the widgets
// and the layout a new user starts with. "Waiting to publish" (`drafts`) is not in it; add it with
// "Edit dashboard".

const W = '/admin/dashboard/widgets'

const limitField: Field = {
  name: 'limit',
  type: 'number',
  label: 'How many to show',
  min: 1,
  max: 20,
  admin: { placeholder: 'Default' },
}

/** Where the preview images live (`public/admin/widget-previews/`, made by `pnpm previews:widgets`). */
export const WIDGET_PREVIEW_PATH = '/admin/widget-previews'

export type WidgetPreviewTheme = 'light' | 'dark'

/** The address of a widget's preview image in one theme. */
export function widgetPreviewURL(slug: string, theme: WidgetPreviewTheme): string {
  return `${WIDGET_PREVIEW_PATH}/${slug}-${theme}.webp`
}

/**
 * A widget with a preview image for the "Add widget" drawer. Payload's drawer shows an item's
 * `imageURL` (the same drawer shows block thumbnails), and the dashboard passes every widget key
 * through to it, but the `Widget` type does not list the key. The URL is the light image;
 * widget-previews.css shows the dark one in the dark theme.
 */
function withPreview(widget: Widget & { label: string }): Widget {
  const preview = { imageURL: widgetPreviewURL(widget.slug, 'light'), imageAltText: `${widget.label} widget` }
  return { ...widget, ...preview }
}

export const widgets: Widget[] = (
  [
    { slug: 'quick-actions', label: 'Quick actions', Component: `${W}/QuickActions#QuickActions`, minWidth: 'medium' },
    { slug: 'recent-edits', label: 'Recent edits', Component: `${W}/RecentEdits#RecentEdits`, fields: [limitField], minWidth: 'small' },
    { slug: 'drafts', label: 'Waiting to publish', Component: `${W}/RecentEdits#Drafts`, fields: [limitField], minWidth: 'small' },
    { slug: 'form-messages', label: 'Form messages', Component: `${W}/FormMessages#FormMessages`, fields: [limitField], minWidth: 'small' },
    { slug: 'site-checks', label: 'Site checks', Component: `${W}/SiteChecks#SiteChecks`, minWidth: 'small' },
    { slug: 'scheduled', label: 'Scheduled', Component: `${W}/Scheduled#Scheduled`, minWidth: 'small' },
    { slug: 'analytics', label: 'Analytics', Component: `${W}/Analytics#Analytics`, minWidth: 'small' },
    { slug: 'open-comments', label: 'Open comments', Component: `${W}/OpenComments#OpenComments`, fields: [limitField], minWidth: 'small' },
    { slug: 'unused-media', label: 'Unused media', Component: `${W}/UnusedMedia#UnusedMedia`, fields: [limitField], minWidth: 'small' },
    { slug: 'broken-links', label: 'Broken links', Component: `${W}/BrokenLinks#BrokenLinks`, fields: [limitField], minWidth: 'small' },
  ] satisfies Array<Widget & { label: string }>
).map(withPreview)

const defaultLayout: WidgetInstance[] = [
  { widgetSlug: 'quick-actions', width: 'full' },
  { widgetSlug: 'recent-edits', width: 'medium' },
  { widgetSlug: 'open-comments', width: 'medium' },
  { widgetSlug: 'form-messages', width: 'medium' },
  { widgetSlug: 'site-checks', width: 'medium' },
  { widgetSlug: 'broken-links', width: 'medium' },
  { widgetSlug: 'unused-media', width: 'medium' },
  { widgetSlug: 'scheduled', width: 'medium' },
]

// Analytics is on the dashboard only when Plausible or Umami is set up in .env (see analytics.ts).
// Without it, a user who adds the widget sees which variables to set.
if (analyticsProvider()) defaultLayout.push({ widgetSlug: 'analytics', width: 'medium' })

export const dashboard: DashboardConfig = { widgets, defaultLayout }

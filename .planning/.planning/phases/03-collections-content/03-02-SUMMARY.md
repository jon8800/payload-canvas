---
phase: 03-collections-content
plan: 02
subsystem: ui
tags: [payload, relationship, next-link, blocks]

requires:
  - phase: 02-atomic-blocks
    provides: Link and Button block components with text-based reference field
provides:
  - Polymorphic relationship link field (pages + posts)
  - Shared resolveHref utility for URL resolution
  - Next.js Link-based internal navigation in Link and Button blocks
affects: [04-templates-routing, 05-plugins-extensions]

tech-stack:
  added: []
  patterns: [shared resolveHref utility for DRY href resolution, Next.js Link for internal navigation]

key-files:
  created:
    - src/lib/resolveHref.ts
  modified:
    - src/fields/link.ts
    - src/blocks/Link/component.tsx
    - src/blocks/Button/component.tsx

key-decisions:
  - "Created shared resolveHref utility instead of duplicating logic in each component (DRY)"
  - "Posts resolve to /blog/[slug], pages resolve to /[slug] URL pattern"

patterns-established:
  - "resolveHref pattern: centralized URL resolution for polymorphic relationship references"
  - "Internal vs external link rendering: Next.js Link for internal, anchor tag for external"

requirements-completed: [COLL-01, COLL-02]

duration: 3min
completed: 2026-03-14
---

# Phase 3 Plan 2: Link Field Relationship Upgrade Summary

**Polymorphic relationship link field with resolveHref utility and Next.js Link navigation for internal routes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T11:02:38Z
- **Completed:** 2026-03-14T11:05:31Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Upgraded link reference field from text to polymorphic relationship (pages + posts)
- Created shared resolveHref utility for consistent URL resolution across components
- Updated Link and Button components to use Next.js Link for client-side internal navigation

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade link field reference to relationship** - `26e8e12` (feat)
2. **Task 2: Update Link and Button components for relationship href resolution** - `0b2765f` (feat)

## Files Created/Modified
- `src/fields/link.ts` - Relationship field pointing at pages and posts collections
- `src/lib/resolveHref.ts` - Shared href resolution utility (posts -> /blog/slug, pages -> /slug)
- `src/blocks/Link/component.tsx` - Updated with resolveHref and Next.js Link for internal links
- `src/blocks/Button/component.tsx` - Updated with resolveHref and Next.js Link for internal links

## Decisions Made
- Created shared resolveHref utility in src/lib/ instead of duplicating logic (DRY principle)
- Posts resolve to /blog/[slug] URL pattern, pages resolve to /[slug]
- Used Next.js Link component for internal navigation (client-side routing)
- Kept anchor tags for external links (correct browser behavior)

## Deviations from Plan

None - plan executed exactly as written.

Note: Pre-existing TypeScript errors exist across the codebase (Posts.ts, TemplateParts.ts, SiteSettings.ts, link.ts) due to stale generated types from 03-01. These will resolve when payload-types.ts is regenerated with a running database. Not caused by this plan's changes.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Link field now uses relationship picker in admin UI
- Components resolve relationship data to proper URLs
- Ready for template routing and page rendering phases

---
*Phase: 03-collections-content*
*Completed: 2026-03-14*

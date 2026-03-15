---
phase: 03-collections-content
plan: 03
subsystem: ui
tags: [nextjs, routing, template-parts, middleware, payload-cms]

requires:
  - phase: 03-collections-content/01
    provides: "Pages, Posts, TemplateParts collections and SiteSettings global"
  - phase: 02-block-system
    provides: "RenderBlocks component and 14 atomic blocks"
provides:
  - "Frontend page routes (homepage, catch-all [...slug])"
  - "Blog routes (archive /blog, single /blog/[slug])"
  - "Template parts resolution utility with 4-tier priority"
  - "Middleware for x-pathname header"
  - "Layout with header/footer template part rendering"
affects: [04-section-presets, 05-plugins-seo]

tech-stack:
  added: []
  patterns: [template-part-resolution, middleware-pathname, server-component-routes]

key-files:
  created:
    - src/utilities/resolveTemplateParts.ts
    - src/middleware.ts
    - src/app/(frontend)/[...slug]/page.tsx
    - src/app/(frontend)/blog/[slug]/page.tsx
    - src/app/(frontend)/blog/page.tsx
  modified:
    - src/app/(frontend)/page.tsx
    - src/app/(frontend)/layout.tsx

key-decisions:
  - "React cache() for template part resolution deduplication (request-level)"
  - "Collection context detected from pathname prefix (/blog = posts, else pages)"

patterns-established:
  - "Template part resolution: specificPages > collectionType > excludePages > entireSite priority"
  - "Middleware x-pathname header for layout route awareness"
  - "Server component routes with getPayload + payload.find pattern"

requirements-completed: [COLL-01, COLL-02, COLL-04]

duration: 3min
completed: 2026-03-14
---

# Phase 3 Plan 3: Frontend Routes & Template Parts Summary

**Frontend routes for pages and posts with template part header/footer resolution in root layout via middleware pathname detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T11:11:44Z
- **Completed:** 2026-03-14T11:14:39Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Template parts resolution utility with 4-tier priority (specificPages > collectionType > excludePages > entireSite) wrapped in React cache()
- Homepage reads SiteSettings global for page reference with fallback message
- Catch-all [...slug] route queries pages collection with generateStaticParams and generateMetadata
- Blog single post route at /blog/[slug] renders title, meta, featured image, excerpt, and layout blocks
- Blog archive at /blog lists published posts sorted by date
- Root layout resolves and renders header/footer template parts
- Middleware sets x-pathname header for layout pathname detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Create template parts resolution utility and middleware** - `aea68ce` (feat)
2. **Task 2: Create page routes (homepage, catch-all, 404 handling)** - `b2cdcee` (feat)
3. **Task 3: Create blog routes and update layout with template parts** - `b41ba96` (feat)

## Files Created/Modified
- `src/utilities/resolveTemplateParts.ts` - Template part resolution with 4-tier priority, React cache()
- `src/middleware.ts` - Sets x-pathname header, excludes admin/api/static routes
- `src/app/(frontend)/[...slug]/page.tsx` - Catch-all page route with generateStaticParams/generateMetadata
- `src/app/(frontend)/page.tsx` - Homepage from SiteSettings global with fallback
- `src/app/(frontend)/blog/[slug]/page.tsx` - Single blog post with meta, image, blocks
- `src/app/(frontend)/blog/page.tsx` - Blog archive listing published posts
- `src/app/(frontend)/layout.tsx` - Async layout with header/footer template part rendering

## Decisions Made
- Used React cache() for request-level deduplication of template part queries (lightweight, no cross-request caching yet)
- Collection context detected from pathname prefix (/blog = posts, everything else = pages)
- Blog post author displayed via email field (Users collection has no name field currently)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All frontend routes compile and render content from Payload collections
- Template parts system ready for admins to create header/footer content
- Phase 3 complete -- ready for Phase 4 (Section Presets)

## Self-Check: PASSED

All 7 files verified present. All 3 task commits verified (aea68ce, b2cdcee, b41ba96).

---
*Phase: 03-collections-content*
*Completed: 2026-03-14*

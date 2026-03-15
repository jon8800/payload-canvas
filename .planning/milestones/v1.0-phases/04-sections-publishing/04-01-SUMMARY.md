---
phase: 04-sections-publishing
plan: 01
subsystem: cms
tags: [payload, live-preview, draft-mode, revalidation, next-cache, preview-route]

# Dependency graph
requires:
  - phase: 03-collections-content
    provides: Pages, Posts, TemplateParts collections with versions/drafts config
provides:
  - Draft mode preview route at /next/preview with secret validation and auth
  - Exit preview route at /next/exit-preview
  - Live preview config with breakpoints for all content collections
  - afterChange revalidation hooks for Pages, Posts, TemplateParts
  - LivePreviewListener client component for RefreshRouteOnSave
  - generatePreviewPath utility for preview URL construction
  - Draft-aware page routes and template part resolution
affects: [04-sections-publishing, 05-plugins-integration, 06-polish-launch]

# Tech tracking
tech-stack:
  added: ["@payloadcms/live-preview-react"]
  patterns: [afterChange revalidation hooks, draft mode in page routes, RefreshRouteOnSave pattern]

key-files:
  created:
    - src/utilities/generatePreviewPath.ts
    - src/components/LivePreviewListener.tsx
    - src/hooks/revalidatePage.ts
    - src/hooks/revalidatePost.ts
    - src/hooks/revalidateTemplatePart.ts
    - src/app/(frontend)/next/preview/route.ts
    - src/app/(frontend)/next/exit-preview/route.ts
  modified:
    - src/payload.config.ts
    - src/collections/Pages.ts
    - src/collections/Posts.ts
    - src/collections/TemplateParts.ts
    - src/app/(frontend)/page.tsx
    - src/app/(frontend)/[...slug]/page.tsx
    - src/app/(frontend)/blog/[slug]/page.tsx
    - src/app/(frontend)/blog/page.tsx
    - src/app/(frontend)/layout.tsx
    - src/utilities/resolveTemplateParts.ts

key-decisions:
  - "revalidateTag requires profile arg in Next.js 16 -- used { expire: 0 } for immediate invalidation"
  - "Template parts preview URL always resolves to / (homepage) since they appear site-wide"
  - "Blog archive conditionally removes _status filter in draft mode to show all posts"

patterns-established:
  - "afterChange hook pattern: guard with context.disableRevalidate, check _status for publish/unpublish"
  - "Draft mode pattern: draftMode() in page component, pass draft to payload.find, conditional LivePreviewListener"
  - "Collection preview config: admin.livePreview.url + admin.preview using generatePreviewPath"

requirements-completed: [CMS-01, CMS-02, CMS-03]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 4 Plan 01: Publishing Workflow Summary

**Draft mode preview, live preview with RefreshRouteOnSave, and on-demand revalidation hooks for Pages, Posts, and Template Parts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T11:50:47Z
- **Completed:** 2026-03-14T11:54:48Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Complete draft mode preview workflow with secret validation and user authentication
- Live preview with 3 breakpoints (mobile/tablet/desktop) on all content collections
- On-demand revalidation via afterChange hooks on Pages, Posts, and Template Parts
- All page routes draft-aware with conditional LivePreviewListener rendering
- resolveTemplateParts updated to support draft mode for preview iframe

## Task Commits

Each task was committed atomically:

1. **Task 1: Create publishing infrastructure files** - `2b84b32` (feat)
2. **Task 2: Wire publishing into existing config and page routes** - `04af55a` (feat)

## Files Created/Modified
- `src/utilities/generatePreviewPath.ts` - Preview URL construction for all collections
- `src/components/LivePreviewListener.tsx` - Client component wrapping RefreshRouteOnSave
- `src/hooks/revalidatePage.ts` - afterChange hook revalidating page paths and pages-sitemap tag
- `src/hooks/revalidatePost.ts` - afterChange hook revalidating post paths, /blog, and posts-sitemap tag
- `src/hooks/revalidateTemplatePart.ts` - afterChange hook revalidating layout for site-wide template parts
- `src/app/(frontend)/next/preview/route.ts` - GET handler enabling draft mode with secret + auth validation
- `src/app/(frontend)/next/exit-preview/route.ts` - GET handler disabling draft mode
- `src/payload.config.ts` - Added admin.livePreview.breakpoints
- `src/collections/Pages.ts` - Added livePreview.url, admin.preview, afterChange hook
- `src/collections/Posts.ts` - Added livePreview.url, admin.preview, afterChange hook
- `src/collections/TemplateParts.ts` - Added livePreview.url, admin.preview, afterChange hook
- `src/app/(frontend)/page.tsx` - Added draft mode + LivePreviewListener
- `src/app/(frontend)/[...slug]/page.tsx` - Added draft mode + LivePreviewListener
- `src/app/(frontend)/blog/[slug]/page.tsx` - Added draft mode + LivePreviewListener
- `src/app/(frontend)/blog/page.tsx` - Added draft mode + LivePreviewListener
- `src/app/(frontend)/layout.tsx` - Added draft mode pass-through to resolveTemplateParts
- `src/utilities/resolveTemplateParts.ts` - Added optional draft parameter for preview support

## Decisions Made
- **revalidateTag profile arg:** Next.js 16 requires a second `profile` argument for `revalidateTag`. Used `{ expire: 0 }` for immediate cache invalidation on publish.
- **Template parts preview on homepage:** Template parts don't have their own frontend URL, so `generatePreviewPath` always returns `/` for template-parts collection.
- **Blog archive draft filter:** In draft mode, the blog archive removes the `_status: published` filter to show all posts including drafts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed revalidateTag call signature for Next.js 16**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** `revalidateTag` in Next.js 16 requires a second argument `profile: string | CacheLifeConfig`. The research patterns were based on Next.js 15 where it was single-arg.
- **Fix:** Added `{ expire: 0 }` as second argument to all `revalidateTag` calls for immediate invalidation
- **Files modified:** src/hooks/revalidatePage.ts, src/hooks/revalidatePost.ts, src/hooks/revalidateTemplatePart.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 2b84b32 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the revalidateTag signature deviation noted above.

## User Setup Required
- Add `PREVIEW_SECRET=preview-secret-change-in-production` to `.env` (already added to local .env, but .env is gitignored)

## Next Phase Readiness
- Publishing workflow complete, ready for section presets (04-02) and sitemap/robots (04-03)
- All content collections have live preview and revalidation wired up
- Draft mode works across all page routes

## Self-Check: PASSED

- All 7 created files verified present on disk
- Both task commits (2b84b32, 04af55a) verified in git log
- TypeScript compilation passes with no errors

---
*Phase: 04-sections-publishing*
*Completed: 2026-03-14*

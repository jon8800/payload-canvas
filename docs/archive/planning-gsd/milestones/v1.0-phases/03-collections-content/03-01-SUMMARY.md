---
phase: 03-collections-content
plan: 01
subsystem: database
tags: [payload, collections, nested-docs, versioning, drafts, taxonomy]

# Dependency graph
requires:
  - phase: 02-atomic-blocks
    provides: block configs and registry with allBlockSlugs for layout fields
provides:
  - Pages collection with versions, drafts, autosave, trash, query presets
  - Posts collection with categories, tags, author, featured image, schedule publish
  - Categories collection for hierarchical taxonomy (nested-docs plugin)
  - Tags collection for flat taxonomy
  - Template Parts collection with display conditions
  - SiteSettings global with homePage relationship
  - authenticatedOrPublished access control for versioned collections
  - populatePublishedAt hook for auto-setting publish date
affects: [03-collections-content, 04-section-blocks, 05-frontend-routing]

# Tech tracking
tech-stack:
  added: ["@payloadcms/plugin-nested-docs@3.79.0"]
  patterns: [versioned-collection-config, authenticatedOrPublished-access, blockReferences-layout-field, display-condition-group]

key-files:
  created:
    - src/collections/Pages.ts
    - src/collections/Posts.ts
    - src/collections/Categories.ts
    - src/collections/Tags.ts
    - src/collections/TemplateParts.ts
    - src/globals/SiteSettings.ts
    - src/access/authenticatedOrPublished.ts
    - src/hooks/populatePublishedAt.ts
  modified:
    - src/payload.config.ts
    - src/payload-types.ts

key-decisions:
  - "queryPresets requires access and constraints config -- used authenticated-only access"
  - "Added payload-types.ts stubs manually due to recursive block schema stack overflow in generate:types"

patterns-established:
  - "Versioned collection pattern: versions.maxPerDoc 50, drafts.autosave 300ms, trash true, enableQueryPresets true"
  - "Layout field pattern: blocks with blockReferences using allBlockSlugs as BlockSlug[]"
  - "Display condition group: mode select with conditional field visibility via admin.condition"

requirements-completed: [COLL-01, COLL-02, COLL-03, COLL-04, COLL-05, COLL-06, COLL-07, COLL-08]

# Metrics
duration: 6min
completed: 2026-03-14
---

# Phase 03 Plan 01: Collections & Content Summary

**Pages, Posts, Categories, Tags, TemplateParts collections with nested-docs plugin, versioning, and SiteSettings global**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-14T11:02:28Z
- **Completed:** 2026-03-14T11:08:22Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Created 5 content collections (Pages, Posts, Categories, Tags, TemplateParts) with proper access control and versioning
- Installed and configured nested-docs plugin for hierarchical category taxonomy
- Created SiteSettings global with homePage relationship for root URL routing
- Established authenticatedOrPublished access pattern and populatePublishedAt hook

## Task Commits

Each task was committed atomically:

1. **Task 1: Create access control, hooks, and taxonomy collections** - `52ea00d` (feat)
2. **Task 2: Create Pages, Posts, Template Parts collections and SiteSettings global** - `1c64866` (feat)
3. **Task 3: Install nested-docs plugin and wire all collections into payload.config.ts** - `bb2b79a` (feat)

## Files Created/Modified
- `src/access/authenticatedOrPublished.ts` - Access control returning published-only filter for anonymous users
- `src/hooks/populatePublishedAt.ts` - Auto-populates publishedAt on first publish
- `src/collections/Categories.ts` - Hierarchical categories (nested-docs injects parent/breadcrumbs)
- `src/collections/Tags.ts` - Flat taxonomy with title and slug
- `src/collections/Pages.ts` - Pages with layout blocks, versions, autosave, drafts, trash
- `src/collections/Posts.ts` - Blog posts with categories, tags, author, featured image
- `src/collections/TemplateParts.ts` - Header/footer/custom templates with display conditions
- `src/globals/SiteSettings.ts` - Site-wide settings with homePage relationship
- `src/payload.config.ts` - All collections and globals registered, nested-docs and queryPresets configured
- `src/payload-types.ts` - Type stubs for new collections added

## Decisions Made
- queryPresets config requires both `access` and `constraints` properties (not just empty object) -- used authenticated-only access for all CRUD operations
- payload generate:types fails with stack overflow due to recursive block children -- added manual type stubs to payload-types.ts as workaround
- Kept Media collection unchanged (no versions, no trash) per user decision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] queryPresets config shape required access and constraints**
- **Found during:** Task 3 (payload.config.ts update)
- **Issue:** Plan specified `queryPresets: {}` but TypeScript requires access and constraints properties
- **Fix:** Added proper queryPresets config with authenticated access for all operations
- **Files modified:** src/payload.config.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** bb2b79a (Task 3 commit)

**2. [Rule 3 - Blocking] payload-types.ts needed manual collection type stubs**
- **Found during:** Task 3 (TypeScript verification)
- **Issue:** generate:types fails with stack overflow from recursive block schemas; CollectionSlug type didn't include new collections
- **Fix:** Added manual type interfaces and select types for all new collections to payload-types.ts
- **Files modified:** src/payload-types.ts
- **Verification:** npx tsc --noEmit passes cleanly
- **Committed in:** bb2b79a (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- payload generate:types stack overflow is a pre-existing issue from recursive block children field -- not introduced by this plan. Type stubs are a temporary workaround until the recursion issue is resolved.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 collections and 1 global registered in Payload config
- Block-based layout fields ready for frontend rendering (Plan 03)
- Categories configured for nested-docs hierarchy
- Template Parts display conditions ready for frontend template resolution

## Self-Check: PASSED

All 8 created files verified. All 3 task commits verified (52ea00d, 1c64866, bb2b79a).

---
*Phase: 03-collections-content*
*Completed: 2026-03-14*

---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [payload-cms, next.js, postgresql, blocksAsJSON, lexical, tailwind-v4, block-registry]

# Dependency graph
requires: []
provides:
  - Payload CMS v3.79 project scaffold with PostgreSQL blocksAsJSON storage
  - Block registry pattern (allBlocks, atomicBlockSlugs, sectionBlockSlugs, allBlockSlugs)
  - RenderBlocks frontend block mapper component
  - Style options skeleton field (customCSS placeholder)
  - Lexical rich text editor as default
  - Next.js 16.2.0-canary.95 with App Router (frontend + payload route groups)
affects: [02-atomic-blocks, 03-collections]

# Tech tracking
tech-stack:
  added: [payload@3.79.0, "@payloadcms/db-postgres@3.79.0", "@payloadcms/richtext-lexical@3.79.0", "@payloadcms/next@3.79.0", "@payloadcms/ui@3.79.0", "next@16.2.0-canary.95", "react@19.2.1", "tailwindcss@4.2.1", "sharp@0.34.2", "geist", "clsx", "tailwind-merge", "class-variance-authority"]
  patterns: [blocksAsJSON storage, block registry with blockReferences, co-located block structure, RenderBlocks mapper]

key-files:
  created: [src/payload.config.ts, src/blocks/registry.ts, src/blocks/RenderBlocks.tsx, src/fields/styleOptions.ts, next.config.ts, .env, .gitignore]
  modified: [src/collections/Users/index.ts, src/collections/Media.ts, src/access/authenticated.ts, src/utilities/generateMeta.ts, src/utilities/mergeOpenGraph.ts, src/app/(frontend)/layout.tsx, src/app/(frontend)/page.tsx, src/app/(frontend)/globals.css]

key-decisions:
  - "Used degit to download template (create-payload-app CLI requires TTY)"
  - "Upgraded Next.js to 16.2.0-canary.95 per user decision despite canary status"
  - "Kept Tailwind v4 CSS-first config from template with shadcn/ui zinc theme variables"
  - "Simplified authenticated access helper to use Payload's Access type"

patterns-established:
  - "Block registry: all blocks defined in src/blocks/registry.ts, imported into payload.config.ts"
  - "Block rendering: src/blocks/RenderBlocks.tsx maps blockType to component"
  - "Style options: shared GroupField in src/fields/styleOptions.ts added to every block"
  - "Access helpers: src/access/authenticated.ts and src/access/anyone.ts for collection access control"

requirements-completed: [BLCK-09, BLCK-10, CMS-05, DX-05]

# Metrics
duration: 9min
completed: 2026-03-14
---

# Phase 1 Plan 01: Foundation Scaffold Summary

**Payload CMS v3.79 scaffolded from website template with PostgreSQL blocksAsJSON, empty block registry, Lexical editor, and Next.js 16.2.0-canary on App Router**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-14T07:16:59Z
- **Completed:** 2026-03-14T07:25:41Z
- **Tasks:** 2
- **Files modified:** 36

## Accomplishments
- Project scaffolded from Payload website template with all template blocks, hero, dark mode, Header/Footer stripped
- PostgreSQL adapter configured with blocksAsJSON: true from day one (cannot be retrofitted)
- Empty block registry established with allBlocks/atomicBlockSlugs/sectionBlockSlugs/allBlockSlugs exports
- Lexical rich text editor configured as default, RenderBlocks mapper and styleOptions skeleton created
- Next.js upgraded to 16.2.0-canary.95 with standalone output and withPayload wrapper

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold from website template, strip template content, upgrade Next.js** - `dac1366` (feat)
2. **Task 2: Configure Payload core -- blocksAsJSON, block registry, Lexical, project structure** - `404d411` (feat)

## Files Created/Modified
- `src/payload.config.ts` - Root Payload config with blocksAsJSON, Lexical, block registry
- `src/blocks/registry.ts` - Central block registry (empty, pattern established)
- `src/blocks/RenderBlocks.tsx` - Block type to component mapper for frontend
- `src/fields/styleOptions.ts` - Style group field skeleton with customCSS
- `next.config.ts` - Next.js config with withPayload and standalone output
- `src/app/(frontend)/layout.tsx` - Minimal RSC layout (stripped of dark mode, Header, Footer)
- `src/app/(frontend)/page.tsx` - Simple "Payload Starter" heading
- `src/app/(frontend)/globals.css` - Tailwind v4 CSS-first config with zinc theme variables
- `src/collections/Users/index.ts` - Admin user collection (cleaned up)
- `src/collections/Media.ts` - Media upload collection with image sizes
- `.env` - Database URL for local PostgreSQL

## Decisions Made
- Used degit to download the Payload website template since create-payload-app CLI requires TTY interaction (non-interactive environment)
- Upgraded to Next.js 16.2.0-canary.95 per user decision; Payload 3.79 requires 16.2.0+ for Next.js 16 support
- Kept template's Tailwind v4 CSS-first configuration and shadcn/ui zinc theme CSS variables
- Simplified the `authenticated` access helper to use Payload's generic `Access` type instead of the template's custom typed version that depended on generated types
- Removed template's dark mode data-theme opacity trick from globals.css

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used degit instead of create-payload-app CLI**
- **Found during:** Task 1
- **Issue:** create-payload-app requires TTY for interactive prompts, fails in non-interactive environment
- **Fix:** Used `npx degit payloadcms/payload/templates/website` to download template directly, then manually created package.json with correct (non-workspace) dependencies
- **Files modified:** package.json (created from scratch with actual versions)
- **Verification:** pnpm install completed, all @payloadcms packages at 3.79.0
- **Committed in:** dac1366

**2. [Rule 1 - Bug] Fixed authenticated access helper type mismatch**
- **Found during:** Task 2
- **Issue:** Template's authenticated.ts imported User type from @/payload-types (which was deleted). Users collection admin field required boolean-returning function but Access returns AccessResult
- **Fix:** Changed authenticated to use Payload's Access type, added inline isAdmin function for Users.access.admin
- **Files modified:** src/access/authenticated.ts, src/collections/Users/index.ts
- **Verification:** npx tsc --noEmit passes with zero errors
- **Committed in:** 404d411

**3. [Rule 1 - Bug] Fixed generateMeta utility referencing deleted types**
- **Found during:** Task 2
- **Issue:** generateMeta.ts imported Page/Post types from deleted payload-types.ts
- **Fix:** Replaced with inline MetaDoc type definition
- **Files modified:** src/utilities/generateMeta.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** 404d411

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes necessary to achieve clean TypeScript compilation. No scope creep.

## Issues Encountered
- Template importMap.js referenced deleted components (Header/Footer RowLabel, BeforeDashboard, BeforeLogin) and uninstalled plugins (SEO, search). Replaced with empty placeholder -- will be regenerated by `pnpm generate:importmap` when dev server runs.

## User Setup Required

None - no external service configuration required. PostgreSQL database must be running locally for the dev server to start (configured in .env).

## Next Phase Readiness
- Block registry pattern established, ready for Phase 2 to add atomic blocks
- styleOptions skeleton ready for Phase 2 to add remaining 7 style fields
- RenderBlocks mapper ready for Phase 2 to register block components
- Plan 01-02 (frontend stack: shadcn/ui, initial migration, build verification) is next

## Self-Check: PASSED

All 7 key files verified present. Both task commits (dac1366, 404d411) verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-14*

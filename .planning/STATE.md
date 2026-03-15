---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Gap Closure & Cleanup
status: executing
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-03-15T10:13:50.476Z"
last_activity: 2026-03-15 -- Completed 07-01 FormEmbed Gap Closure
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 24
  completed_plans: 24
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** Any website project can be scaffolded instantly with a composable block-based layout system that works for both static pages and dynamic collection templates
**Current focus:** Phase 7 gap closure

## Current Position

Phase: 7 of 7 (Gap Closure & Cleanup)
Plan: 1 of 2 in current phase (07-01 complete)
Status: In Progress
Last activity: 2026-03-15 -- Completed 07-01 FormEmbed Gap Closure

Progress: [██████████] 96% (23/24 plans overall)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 7min
- Total execution time: 0.33 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 2/2 | 16min | 8min |

**Recent Trend:**
- Last 5 plans: 01-01 (9min), 01-02 (7min), 02-01 (3min), 02-02 (4min)
- Trend: Improving

*Updated after each plan completion*
| Phase 02 P01 | 3min | 2 tasks | 5 files |
| Phase 02 P02 | 4min | 3 tasks | 17 files |
| Phase 02 P04 | 2min | 1 tasks | 1 files |
| Phase 02 P03 | 4min | 3 tasks | 15 files |
| Phase 03 P02 | 3min | 2 tasks | 4 files |
| Phase 03 P01 | 6min | 3 tasks | 10 files |
| Phase 03 P03 | 3min | 3 tasks | 7 files |
| Phase 04 P02 | 2min | 2 tasks | 11 files |
| Phase 04 P01 | 4min | 2 tasks | 17 files |
| Phase 05 P01 | 5min | 2 tasks | 8 files |
| Phase 05 P02 | 13min | 2 tasks | 46 files |
| Phase 05 P03 | 3min | 2 tasks | 10 files |
| Phase 06 P02 | 1min | 1 tasks | 3 files |
| Phase 06 P01 | 4min | 2 tasks | 8 files |
| Phase 06 P03 | 3min | 2 tasks | 4 files |
| Phase 06 P04 | 3min | 2 tasks | 14 files |
| Phase 06 P05 | 3min | 1 tasks | 3 files |
| Phase 06.1 P01 | 7min | 2 tasks | 308 files |
| Phase 06.1 P02 | 2min | 2 tasks | 10 files |
| Phase 06.1 P03 | 3min | 2 tasks | 2 files |
| Phase 07 P01 | 3min | 2 tasks | 2 files |
| Phase 07 P02 | 2min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- blocksAsJSON must be configured from day one (cannot safely retrofit)
- blockReferences + interfaceName pattern must be established before first block config
- Migration workflow (payload migrate:create, not db:push) decided from start
- Used degit for template download (create-payload-app requires TTY)
- Next.js 16.2.0-canary.95 installed per user decision (Payload 3.79 requires 16.2.0+)
- Simplified authenticated access helper to use Payload's generic Access type
- shadcn v4 uses base-nova style (new default, equivalent to zinc)
- Removed tailwind.config.mjs entirely for Tailwind v4 CSS-first approach
- cn() utility at src/lib/utils.ts (shadcn standard location)
- [Phase 01]: In dev mode, Payload auto-pushes schema via Drizzle -- no need to run pnpm payload migrate for local development. Migration files exist for production deployments only.
- [Phase 02]: Collapsible groups with initCollapsed for all style properties to prevent admin UI explosion
- [Phase 02]: Custom color values produce inline styles (not Tailwind arbitrary) for hex/rgb support
- [Phase 02]: DRY shared.ts helpers (childrenField, settingsTab) for consistent block config structure
- [Phase 02]: BlockSlug type cast for blockReferences before payload-types generation
- [Phase 02]: getNumericValue handles both number and string media IDs for Payload flexibility
- [Phase 02]: linkFields spread at root level means label accessed via data.label directly
- [Phase 02]: Used React.ComponentProps<typeof RichText>['data'] for rich text typing (pnpm doesn't hoist lexical)
- [Phase 03]: Created shared resolveHref utility for DRY href resolution across Link and Button components
- [Phase 03]: Posts resolve to /blog/[slug], pages resolve to /[slug] URL pattern
- [Phase 03]: queryPresets requires access and constraints config -- used authenticated-only access
- [Phase 03]: Added payload-types.ts stubs manually due to recursive block schema stack overflow in generate:types
- [Phase 03]: React cache() for template part resolution deduplication
- [Phase 03]: Collection context detected from pathname prefix (/blog = posts, else pages)
- [Phase 04]: Used unstable_cache with pages-sitemap/posts-sitemap tags for sitemap caching
- [Phase 04]: Section presets use SectionPreset type with null paragraph content for Phase 6 seed population
- [Phase 04]: revalidateTag requires profile arg in Next.js 16 -- used { expire: 0 } for immediate invalidation
- [Phase 04]: Template parts preview URL always resolves to / (homepage) since they appear site-wide
- [Phase 04]: Blog archive conditionally removes _status filter in draft mode to show all posts
- [Phase 05]: Type assertions (as any) for 'forms' collection references -- form-builder plugin creates collections dynamically
- [Phase 05]: REST API fetch in middleware for redirects (Edge runtime cannot import Payload directly)
- [Phase 05]: 60-second revalidation cache on redirect lookups for performance
- [Phase 05]: Multi-step forms and conditional logic deferred to Phase 6 frontend (data model supports it)
- [Phase 05]: File attachments on form-submissions rather than as form field type
- [Phase 05]: Used @ts-nocheck for ported plugin files -- Payload internal types have strict null constraints
- [Phase 05]: Preview component simplified to just iframe + RefreshRouteOnSave (no postMessage)
- [Phase 05]: Field name configurable via CUSTOMISER_BLOCKS_FIELD constant (default 'layout')
- [Phase 05]: Tab labels changed from Section/sections to Layout/layout to match field name
- [Phase 05]: display:contents wrapper for data-block-path to avoid layout interference
- [Phase 05]: BlockSelectionHandler only activates inside iframe (window.self !== window.top)
- [Phase 05]: Theme Settings plugin deferred to v2 -- documented integration surface only
- [Phase 06]: Build args for DATABASE_URL and PAYLOAD_SECRET -- Payload 3.x requires DB at build time for type generation
- [Phase 06]: Payload 3.x EmailAdapter function pattern for SMTP (not transportOptions)
- [Phase 06]: pg and @types/pg installed as direct dev deps (pnpm strict hoisting)
- [Phase 06]: Email config conditional on SMTP_HOST to avoid breaking builds without SMTP
- [Phase 06]: Used tsx for setup script (runs outside payload context)
- [Phase 06]: Skipped media uploads in seed script -- demo focuses on content structure
- [Phase 06]: Separate CLI package at create-payload-starter/ with EJS templates for clean conditional output
- [Phase 06]: Posts/Categories/Tags as single prompt option with auto-included dependencies
- [Phase 06]: Kept setup script as redirect message rather than deleting entirely
- [Phase 06.1]: Used pnpm@10.31.0 (user's actual version) in packageManager field
- [Phase 06.1]: Adapted generate-env.ts with targetDir parameter for shared package reusability
- [Phase 06.1]: Added pnpm.onlyBuiltDependencies for sharp/esbuild/unrs-resolver to root package.json
- [Phase 06.1]: Replaced git clone + degit with GitHub codeload tarball extraction for template download
- [Phase 06.1]: CLI imports createDatabase and generateEnv from @jon8800/shared instead of local lib/
- [Phase 06.1]: User verified GitHub repo structure and archived old repos manually
- [Phase 07]: Country/state fields render as plain text inputs for v1 gap closure
- [Phase 07]: Silent fail on form fetch error to preserve page rendering
- [Phase 07]: Removed unused generateBlocks function but kept RecursiveBlock type and getBaseBlockSlug (both have active consumers)

### Roadmap Evolution

- Phase 6.1 inserted after Phase 6: Restructure into payload-toolkit Turborepo monorepo (URGENT) — move starter into packages/template/, CLI into packages/create-payload-starter/, set up pnpm workspaces + Turborepo, create new GitHub repo jon8800/payload-toolkit

### Pending Todos

- None for Phase 1 (all tasks complete and verified)

### Blockers/Concerns

- PLUG-03/04/05/06/07 (Form Builder, Nested Docs, Import/Export, MCP, Search) may have version compatibility issues at Payload v3.79 -- add incrementally and verify build after each
- Layout Customizer integrated as direct view (Phase 5 Plan 2 complete)

## Session Continuity

Last session: 2026-03-15T10:13:50.473Z
Stopped at: Completed 07-02-PLAN.md
Resume file: None

---
phase: 06-developer-experience
plan: 05
subsystem: infra
tags: [cleanup, payload-config, setup-markers, dead-code-removal]

# Dependency graph
requires:
  - phase: 06-developer-experience/06-04
    provides: CLI package with EJS templates for conditional generation
provides:
  - Clean payload.config.ts with no @setup markers
  - Removal of obsolete comment-toggling setup approach
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Starter repo as clean source code (CLI handles feature selection)"

key-files:
  created: []
  modified:
    - src/payload.config.ts
    - scripts/setup.ts
    - scripts/lib/modify-config.ts (deleted)

key-decisions:
  - "Kept setup script as redirect message rather than deleting entirely"
  - "Kept package.json setup script entry for discoverability"

patterns-established:
  - "Starter repo contains all features active -- CLI generates subsets via EJS templates"

requirements-completed: [DX-01]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 6 Plan 5: Starter Repo Cleanup Summary

**Removed all @setup markers from payload.config.ts and deleted obsolete comment-toggling setup code**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T04:02:36Z
- **Completed:** 2026-03-15T04:05:36Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Cleaned payload.config.ts of all @setup:plugin, @setup:collection, and @setup:required markers
- Deleted scripts/lib/modify-config.ts (dead code replaced by CLI EJS templates)
- Replaced scripts/setup.ts with redirect message pointing to CLI package
- Verified TypeScript compilation passes with clean config

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove @setup markers and delete obsolete files** - `7bc3aac` (chore)

## Files Created/Modified
- `src/payload.config.ts` - Removed all @setup markers, leaving clean imports and config
- `scripts/setup.ts` - Replaced with redirect message to CLI package
- `scripts/lib/modify-config.ts` - Deleted (obsolete comment-toggling logic)

## Decisions Made
- Kept `pnpm setup` command working by replacing setup.ts with a redirect message rather than deleting it entirely
- Kept package.json scripts unchanged (setup entry now prints redirect)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Starter repo is clean and buildable with all features active
- CLI package (06-04) handles feature selection via EJS templates
- Phase 6 Developer Experience is complete

---
*Phase: 06-developer-experience*
*Completed: 2026-03-15*

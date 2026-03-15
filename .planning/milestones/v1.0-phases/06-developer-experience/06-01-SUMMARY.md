---
phase: 06-developer-experience
plan: 01
subsystem: infra
tags: [setup-scripts, env-template, smtp, nodemailer, lexical, pg, config-toggling]

# Dependency graph
requires:
  - phase: 05-plugins-integrations
    provides: All collections and plugins configured in payload.config.ts
provides:
  - ".env.example template with documented environment variables"
  - "@setup markers on all optional collections and plugins in payload.config.ts"
  - "SMTP email adapter for Payload 3.x using nodemailer"
  - "create-database helper for cross-platform Postgres DB creation"
  - "generate-env helper for .env file generation from template"
  - "modify-config helper for toggling @setup markers"
  - "lexical-helpers for Lexical rich text JSON builders"
affects: [06-02, 06-03]

# Tech tracking
tech-stack:
  added: [pg, "@types/pg"]
  patterns: [comment-toggle-config, email-adapter-pattern, lexical-json-builders]

key-files:
  created:
    - .env.example
    - scripts/lib/create-database.ts
    - scripts/lib/generate-env.ts
    - scripts/lib/modify-config.ts
    - scripts/lib/lexical-helpers.ts
  modified:
    - src/payload.config.ts
    - package.json

key-decisions:
  - "Payload 3.x uses EmailAdapter function pattern, not transportOptions -- implemented custom smtpAdapter"
  - "Email config conditionally applied only when SMTP_HOST is defined to avoid breaking builds"
  - "pg and @types/pg installed as dev dependencies since pnpm doesn't hoist from @payloadcms/db-postgres"

patterns-established:
  - "@setup:collection:{name} markers on import and array entry lines for optional collections"
  - "@setup:plugin:{name}:start/end block markers for multi-line plugin configs"
  - "EmailAdapter pattern: function receiving { payload } returning { defaultFromAddress, defaultFromName, name, sendEmail }"

requirements-completed: [DX-01, DX-04]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 6 Plan 1: Setup Infrastructure Summary

**Setup helper scripts, .env.example template, @setup config markers, and SMTP email adapter for interactive CLI foundation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T02:24:26Z
- **Completed:** 2026-03-15T02:27:57Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created comprehensive .env.example with DATABASE_URL, PAYLOAD_SECRET, NEXT_PUBLIC_SERVER_URL, PREVIEW_SECRET, and all SMTP_* variables documented
- Added @setup markers to all optional collections (Posts, Categories, Tags, TemplateParts) and all 7 plugin blocks in payload.config.ts
- Implemented Payload 3.x EmailAdapter using nodemailer with conditional activation (only when SMTP_HOST defined)
- Created 4 helper scripts: create-database (pg), generate-env (.env templating), modify-config (marker toggling), lexical-helpers (rich text JSON)

## Task Commits

Each task was committed atomically:

1. **Task 1: .env.example, payload.config.ts markers + SMTP transport** - `9911a0b` (feat)
2. **Task 2: Setup helper scripts** - `d11d276` (feat)

## Files Created/Modified
- `.env.example` - Documented environment variable template with all required and optional vars
- `src/payload.config.ts` - Added @setup markers on collections/plugins, SMTP email adapter, nodemailer import
- `scripts/lib/create-database.ts` - Cross-platform Postgres database creation via pg Client
- `scripts/lib/generate-env.ts` - .env file generator from .env.example template with random secret generation
- `scripts/lib/modify-config.ts` - Toggle @setup markers in payload.config.ts based on user selections with dependency coupling
- `scripts/lib/lexical-helpers.ts` - richText, richTextWithHeading, populatePresetContent for valid Lexical JSON
- `package.json` - Added pg and @types/pg as dev dependencies

## Decisions Made
- Payload 3.x uses EmailAdapter function pattern (not transportOptions or nodemailerAdapter package) -- implemented custom smtpAdapter conforming to the interface
- Email config conditionally applied (`process.env.SMTP_HOST ? smtpAdapter : undefined`) to avoid breaking builds when SMTP vars are absent
- Installed pg and @types/pg directly as dev dependencies because pnpm strict hoisting prevents access from @payloadcms/db-postgres transitive dependency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed pg and @types/pg as dev dependencies**
- **Found during:** Task 2 (create-database.ts)
- **Issue:** pg is a transitive dependency of @payloadcms/db-postgres but not hoisted by pnpm, so `import { Client } from 'pg'` would fail
- **Fix:** Ran `pnpm add -D pg @types/pg`
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** d11d276 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for script to compile. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All helper scripts ready for Plan 03 (interactive setup script orchestrator)
- .env.example template ready for generate-env to read
- @setup markers in place for modify-config to toggle
- Lexical helpers ready for Plan 02 (demo content seeder)

## Self-Check: PASSED

All 6 files verified present. Both task commits (9911a0b, d11d276) verified in git log.

---
*Phase: 06-developer-experience*
*Completed: 2026-03-15*

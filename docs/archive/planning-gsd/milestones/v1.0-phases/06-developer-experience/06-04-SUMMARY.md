---
phase: 06-developer-experience
plan: 04
subsystem: cli
tags: [cli, ejs, scaffolding, prompts, cross-spawn, degit]

requires:
  - phase: 06-developer-experience
    provides: setup scripts (create-database, generate-env), payload.config.ts structure
provides:
  - "Complete create-payload-starter CLI package with EJS templates"
  - "Interactive prompts with collection dependency enforcement"
  - "Scaffold, render, and post-scaffold pipeline"
affects: [end-to-end-testing, release]

tech-stack:
  added: [ejs, degit, cross-spawn, "@clack/prompts"]
  patterns: [ejs-conditional-templates, collection-dependency-enforcement, cross-platform-spawn]

key-files:
  created:
    - C:/Projects/sandbox/create-payload-starter/package.json
    - C:/Projects/sandbox/create-payload-starter/src/index.ts
    - C:/Projects/sandbox/create-payload-starter/src/prompts.ts
    - C:/Projects/sandbox/create-payload-starter/src/scaffold.ts
    - C:/Projects/sandbox/create-payload-starter/src/render-templates.ts
    - C:/Projects/sandbox/create-payload-starter/src/post-scaffold.ts
    - C:/Projects/sandbox/create-payload-starter/src/lib/create-database.ts
    - C:/Projects/sandbox/create-payload-starter/src/lib/generate-env.ts
    - C:/Projects/sandbox/create-payload-starter/templates/payload.config.ts.ejs
    - C:/Projects/sandbox/create-payload-starter/templates/Posts.ts.ejs
    - C:/Projects/sandbox/create-payload-starter/templates/TemplateParts.ts.ejs
  modified: []

key-decisions:
  - "Separate CLI package at create-payload-starter/ instead of modifying starter in-place"
  - "Posts/Categories/Tags shown as single 'Posts' option with auto-included dependencies"
  - "git clone --depth 1 for template download (works with private repos)"
  - "cross-spawn for cross-platform child process compatibility"

patterns-established:
  - "EJS conditional templates: control flow with <% %>, not <%=, for source code generation"
  - "Collection dependency enforcement: prompt resolves dependencies post-selection"
  - "Plugin collection arrays adapt to selected collections in EJS templates"

requirements-completed: [DX-01]

duration: 3min
completed: 2026-03-15
---

# Phase 6 Plan 4: Create Payload Starter CLI Summary

**Standalone CLI package with EJS templates, interactive prompts, and full scaffold pipeline for generating new Payload projects**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T03:57:41Z
- **Completed:** 2026-03-15T04:00:35Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Complete CLI package at create-payload-starter/ that compiles cleanly with TypeScript
- Three EJS templates producing clean conditional TypeScript output for payload.config.ts, Posts.ts, and TemplateParts.ts
- Interactive prompts with Posts->Categories+Tags dependency enforcement
- Full post-scaffold pipeline: env generation, pnpm install, DB creation, migration, admin user, git init

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI package structure, prompts, and scaffold/render/post-scaffold modules** - `c05d112` (feat)
2. **Task 2: EJS templates for payload.config.ts, Posts.ts, TemplateParts.ts** - `6d5fef1` (feat)

## Files Created/Modified
- `package.json` - CLI package manifest with bin entry and all dependencies
- `tsconfig.json` - TypeScript config targeting ES2022/Node16
- `src/index.ts` - CLI entry point orchestrating prompts -> scaffold -> render -> post-scaffold
- `src/prompts.ts` - Interactive prompts with collection dependency enforcement
- `src/scaffold.ts` - Template download via git clone and cleanup of setup-only files
- `src/render-templates.ts` - EJS template rendering and unselected file cleanup
- `src/post-scaffold.ts` - Post-scaffold steps (env, install, DB, migrate, admin, git init)
- `src/lib/create-database.ts` - PostgreSQL database creation (copied from starter)
- `src/lib/generate-env.ts` - .env generation with targetDir parameter (adapted from starter)
- `templates/payload.config.ts.ejs` - Conditional imports, collections, and plugin configs
- `templates/Posts.ts.ejs` - Posts collection without @setup markers
- `templates/TemplateParts.ts.ejs` - TemplateParts with conditional collectionType options

## Decisions Made
- Posts, Categories, and Tags presented as a single "Posts (includes Categories & Tags)" option to simplify the prompt and enforce dependencies automatically
- Used git clone --depth 1 instead of degit for template download (better private repo support)
- cross-spawn used for all child process calls (Windows compatibility)
- generate-env adapted to accept targetDir parameter instead of using process.cwd()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI package is complete and compiles but needs end-to-end testing with a real GitHub repo
- The repo URL in scaffold.ts needs to be updated with the actual GitHub username/org before publishing
- Package can be tested locally via `pnpm dev` to run through the interactive flow

## Self-Check: PASSED

All 11 created files verified. Both task commits (c05d112, 6d5fef1) confirmed in git log.

---
*Phase: 06-developer-experience*
*Completed: 2026-03-15*

---
status: complete
phase: 06-developer-experience
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md]
started: 2026-03-15T03:00:00Z
updated: 2026-03-15T03:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Project builds cleanly with `pnpm build` — no errors, all routes generated
result: pass

### 2. Setup Script Scaffolds Into New Directory
expected: Running `pnpm setup` prompts for project name and creates a NEW project in a separate directory (e.g., `../my-website/`), copying the starter files and configuring them there — NOT modifying the starter repo in-place.
result: issue
reported: "Setup script modifies the starter repo in-place instead of scaffolding into a new directory. It overwrote my .env and modified payload.config.ts in the starter itself."
severity: blocker

### 3. Setup Script Creates Postgres Database
expected: The setup script creates a new Postgres database using the provided credentials via the `pg` client. Database is accessible and empty, ready for Payload.
result: pass

### 4. Setup Script Generates .env
expected: A `.env` file is generated in the new project directory with the correct DATABASE_URL (using provided credentials), a randomly generated PAYLOAD_SECRET, and PREVIEW_SECRET. SMTP vars are commented out if skipped.
result: pass

### 5. Setup Script Modular Collection Selection
expected: When deselecting "Posts" in the collections prompt, the setup comments out Posts, Categories, and Tags imports and entries in payload.config.ts. Remaining collections (Pages, Media, TemplateParts) stay active. The project still builds.
result: issue
reported: "Deselecting Categories but keeping Posts causes migration to crash with InvalidFieldRelationship because Posts.ts still has a relationTo: 'categories' field. The modifyConfig script only toggles imports in payload.config.ts but doesn't handle cross-collection relationship dependencies inside collection files."
severity: blocker

### 6. Setup Script Modular Plugin Selection
expected: When deselecting "Search" and "MCP" in the plugins prompt, those plugin imports and config blocks are commented out in payload.config.ts. Other plugins remain active.
result: skipped
reason: Blocked by test 2 (in-place scaffolding) — needs new-directory flow to test safely

### 7. Setup Script Runs Migrations and Creates Admin
expected: After generating .env and modifying config, the setup script runs `pnpm payload migrate` to push schema, then creates an admin user with the provided email/password. Admin can log in at /admin.
result: skipped
reason: Blocked by test 5 (relationship dependency crash) — needs fix before re-testing

### 8. Demo Content Seeder
expected: Running `pnpm seed:demo` populates the database with 3 categories, 3 tags, 2 template parts (header + footer), 4 pages (including homepage with section presets), and 4 blog posts. Content is visible in the admin panel.
result: skipped
reason: Blocked by test 2 and 7 — needs working setup flow first

### 9. Docker Compose Builds and Runs
expected: Running `docker compose up --build` builds the multi-stage Docker image and starts both app and Postgres containers. The app is accessible at http://localhost:3000 and the admin at http://localhost:3000/admin.
result: skipped
reason: Low priority, test later

### 10. .env.example Is Complete
expected: `.env.example` documents all required and optional environment variables: DATABASE_URL, PAYLOAD_SECRET, NEXT_PUBLIC_SERVER_URL, PREVIEW_SECRET, and all SMTP_* vars with descriptions.
result: pass

## Summary

total: 10
passed: 4
issues: 2
pending: 0
skipped: 4

## Gaps

- truth: "Setup script scaffolds into a new directory, not modifying the starter in-place"
  status: failed
  reason: "User reported: Setup script modifies the starter repo in-place instead of scaffolding into a new directory. It overwrote my .env and modified payload.config.ts in the starter itself."
  severity: blocker
  test: 2
  root_cause: "The setup script (scripts/setup.ts) has no directory-creation or file-copying logic. It operates entirely on process.cwd() — generateEnv() writes .env to cwd (line 23 of generate-env.ts), and modifyConfig() reads/writes src/payload.config.ts relative to cwd (line 4 of modify-config.ts). The script collects a project name but only uses it as the database name (line 185 of setup.ts). There is no step that: (1) creates a target directory, (2) copies starter files into it, or (3) sets the working context to the new directory before running env generation and config modification."
  artifacts:
    - scripts/setup.ts (missing directory creation and file copy step between prompts and execution)
    - scripts/lib/generate-env.ts (hardcoded to process.cwd(), no target directory parameter)
    - scripts/lib/modify-config.ts (hardcoded CONFIG_PATH to process.cwd()/src/payload.config.ts)
  missing:
    - "A scaffolding step after prompts that creates the target directory (e.g. ../{projectName}/), copies all starter files into it (excluding node_modules, .git, .env), and sets the working context for subsequent steps"
    - "A targetDir parameter threaded through generateEnv() and modifyConfig() so they write to the new project directory instead of cwd"
    - "A post-scaffold step to run pnpm install in the new directory before running migrations"

- truth: "Modular collection selection handles cross-collection relationship dependencies"
  status: failed
  reason: "User reported: Deselecting Categories but keeping Posts causes migration to crash with InvalidFieldRelationship because Posts.ts still has a relationTo: 'categories' field. The modifyConfig script only toggles imports in payload.config.ts but doesn't handle cross-collection relationship dependencies inside collection files."
  severity: blocker
  test: 5
  root_cause: "modifyConfig() only operates on payload.config.ts — it comments out import lines and collection array entries using @setup markers. It does NOT modify the collection definition files themselves. When Categories is deselected but Posts is kept, the Categories import/entry in payload.config.ts is commented out (so the 'categories' collection is not registered), but Posts.ts still has a relationship field on line 92-97 with `relationTo: 'categories'`. Payload validates all relationship fields at startup and crashes because the 'categories' collection no longer exists. The dependency coupling logic in modifyConfig (lines 19-26) only handles the reverse case — deselecting Posts auto-deselects Categories — but not the case where Categories is deselected independently while Posts remains. Similarly, Posts.ts has `relationTo: 'tags'` (lines 98-104), so deselecting Tags while keeping Posts would cause the same crash."
  artifacts:
    - scripts/lib/modify-config.ts (only toggles payload.config.ts lines, no collection-file modification)
    - src/collections/Posts.ts (lines 92-97: hardcoded relationTo 'categories'; lines 98-104: hardcoded relationTo 'tags')
    - src/payload.config.ts (lines 78-80: collection entries with @setup markers that can be independently toggled)
  missing:
    - "Dependency graph awareness: if Posts is selected, Categories and Tags must either be force-included OR their relationship fields must be removed/commented from Posts.ts"
    - "Either (a) modify collection definition files to remove/comment relationship fields referencing deselected collections, or (b) enforce dependency constraints in the prompt so users cannot deselect Categories/Tags while Posts is selected, or (c) make the relationship fields conditional via @setup markers within the collection files themselves"

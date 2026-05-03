---
phase: 05-plugins-integrations
plan: 01
subsystem: plugins
tags: [payload-seo, payload-redirects, payload-form-builder, payload-import-export, payload-mcp, payload-search, nodemailer, middleware]

requires:
  - phase: 03-components-templates
    provides: Block system, collections (Pages, Posts, Categories), RenderBlocks
  - phase: 04-sections-publishing
    provides: Publishing workflow, generateMeta utility, mergeOpenGraph

provides:
  - 7 Payload plugins configured (SEO, Redirects, Form Builder, Nested Docs, Import/Export, MCP, Search)
  - Form Builder with email notifications via Nodemailer and file upload attachments
  - SEO meta tags rendering on all frontend page routes
  - Redirect enforcement via Next.js middleware with exact match and regex support
  - FormEmbed block wired to forms collection relationship
  - Jobs queue config for Import/Export background processing

affects: [06-frontend-rendering, customiser-integration]

tech-stack:
  added: ["@payloadcms/plugin-seo", "@payloadcms/plugin-redirects", "@payloadcms/plugin-form-builder", "@payloadcms/plugin-import-export", "@payloadcms/plugin-mcp", "@payloadcms/plugin-search", "nodemailer"]
  patterns: [plugin-configuration, afterChange-hook-email, rest-api-middleware-redirect, type-assertion-for-dynamic-collections]

key-files:
  created:
    - src/collections/forms/handleFormEmails.ts
  modified:
    - src/payload.config.ts
    - src/middleware.ts
    - src/blocks/FormEmbed/config.ts
    - src/blocks/FormEmbed/component.tsx
    - src/app/(frontend)/[...slug]/page.tsx
    - src/app/(frontend)/blog/[slug]/page.tsx
    - src/app/(frontend)/page.tsx

key-decisions:
  - "Type assertions (as any) for 'forms' collection references since form-builder plugin creates collections dynamically"
  - "REST API fetch in middleware for redirects (Edge runtime cannot import Payload directly)"
  - "60-second revalidation cache on redirect lookups to avoid per-request DB queries"
  - "Multi-step forms and conditional logic deferred to Phase 6 frontend (data model supports it without plugin changes)"
  - "File attachments on form-submissions rather than as a form field type (plugin has no native upload field type)"

patterns-established:
  - "Plugin dynamic collection type assertion: use 'as any' for collections created by plugins at runtime"
  - "Middleware REST API pattern: fetch Payload REST API for data needed in Edge runtime middleware"
  - "Form email handler: afterChange hook on form-submissions with Nodemailer transport"

requirements-completed: [PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, PLUG-06, PLUG-07]

duration: 5min
completed: 2026-03-14
---

# Phase 5 Plan 1: Plugins & Integrations Summary

**7 Payload plugins configured with Form Builder email notifications, SEO meta rendering on all routes, and redirect middleware with regex support**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-14T13:08:58Z
- **Completed:** 2026-03-14T13:13:59Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- All 7 official Payload plugins configured: SEO, Redirects, Form Builder (with email + file upload), Nested Docs (verified), Import/Export, MCP, Search
- Form Builder extended with Nodemailer-based email notifications and file upload attachments on submissions
- SEO meta tags render on all 3 frontend page routes using existing generateMeta utility
- Redirect middleware enforces both exact URL matches and regex pattern redirects via REST API
- FormEmbed block updated from placeholder text fields to forms collection relationship

## Task Commits

Each task was committed atomically:

1. **Task 1: Install plugins and configure payload.config.ts** - `900cd38` (feat)
2. **Task 2: SEO meta rendering on frontend + redirects middleware** - `b9054c8` (feat)

## Files Created/Modified
- `src/payload.config.ts` - All 7 plugins configured with full options, jobs queue added
- `src/collections/forms/handleFormEmails.ts` - Email notification handler for form submissions
- `src/middleware.ts` - Redirect matching with exact + regex support via REST API
- `src/blocks/FormEmbed/config.ts` - Updated to use forms relationship field
- `src/blocks/FormEmbed/component.tsx` - Updated props for form relationship
- `src/app/(frontend)/[...slug]/page.tsx` - Uses generateMeta for SEO metadata
- `src/app/(frontend)/blog/[slug]/page.tsx` - Uses generateMeta for SEO metadata
- `src/app/(frontend)/page.tsx` - Added generateMetadata export with generateMeta

## Decisions Made
- Used type assertions (`as any`) for the `forms` collection reference since it's dynamically created by the form-builder plugin and not in the generated TypeScript types
- Middleware uses REST API fetch for redirect lookups because Edge runtime cannot import Payload directly
- 60-second revalidation cache on redirect lookups to balance freshness vs performance
- Multi-step forms and conditional field logic deferred to Phase 6 frontend work (the plugin's flat field array supports this as a presentation concern)
- File attachments stored on form-submissions via upload field rather than as a form field type (plugin has no native upload field type)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Type assertions for dynamic plugin collections**
- **Found during:** Task 1
- **Issue:** TypeScript errors because 'forms' collection slug not in generated CollectionSlug type (created dynamically by form-builder plugin)
- **Fix:** Added `as any` type assertions on 'forms' references in FormEmbed config and handleFormEmails hook, plus explicit local types for form data
- **Files modified:** src/blocks/FormEmbed/config.ts, src/collections/forms/handleFormEmails.ts
- **Verification:** `npx tsc --noEmit` passes (no errors outside pre-existing customiser view)
- **Committed in:** 900cd38 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `src/views/customiser/` directory (from earlier phase work) -- these are not related to this plan and are expected to be resolved in plan 05-02 or 05-03.

## User Setup Required

SMTP configuration is required for form email notifications to work. The following environment variables should be set:
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port (default: 587)
- `SMTP_SECURE` - Set to 'true' for TLS (default: false)
- `SMTP_USER` - SMTP authentication username
- `SMTP_PASS` - SMTP authentication password
- `SMTP_FROM` - Default sender email address
- `ADMIN_EMAIL` - Fallback recipient for form notifications

## Next Phase Readiness
- All plugins active and configured -- admin panel will show SEO tabs, redirects collection, forms collections, import/export controls, MCP endpoint, and search collection
- FormEmbed block ready for Phase 6 frontend form rendering integration
- Multi-step and conditional logic integration points documented for Phase 6

---
*Phase: 05-plugins-integrations*
*Completed: 2026-03-14*

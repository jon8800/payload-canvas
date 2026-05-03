---
phase: 04-sections-publishing
verified: 2026-03-14T12:30:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 4: Sections & Publishing Verification Report

**Phase Goal:** Pre-composed section presets demonstrate the nested block system, and the full publishing workflow (drafts, live preview, revalidation, sitemap) is operational
**Verified:** 2026-03-14T12:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 5-8 section presets (Hero, Content, CTA, Collection Grid, Features, Testimonials, FAQ, Footer) are available and each is composed from nested atomic blocks | VERIFIED | 8 files in `src/data/section-presets/`, all using only `container`, `heading`, `paragraph`, `button`, `grid`, `spacer`, `divider` from atomicBlockSlugs |
| 2 | Draft mode works — unpublished changes are visible in preview but not on the live site | VERIFIED | `/next/preview/route.ts` validates secret + auth, enables `draftMode()`. All 4 page routes pass `draft` flag to `payload.find()`. `authenticatedOrPublished` access control on all collections |
| 3 | Live preview in the admin panel updates as content is edited | VERIFIED | `LivePreviewListener` wraps `RefreshRouteOnSave` from `@payloadcms/live-preview-react`. All 4 page routes render `{draft && <LivePreviewListener />}`. Collections have `admin.livePreview.url` via `generatePreviewPath` |
| 4 | Content changes trigger on-demand revalidation — published updates appear on frontend without full rebuild | VERIFIED | `revalidatePage`, `revalidatePost`, `revalidateTemplatePart` hooks registered in `hooks.afterChange` on all 3 collections. Guards with `context.disableRevalidate`. Handles publish and unpublish |
| 5 | Sitemap.xml and robots.txt are generated and accessible | VERIFIED | `sitemap.ts` queries published pages + posts via `unstable_cache` with `pages-sitemap`/`posts-sitemap` tags. `robots.ts` exports allow-all config with sitemap reference |

**Score:** 5/5 success criteria verified

---

### Required Artifacts

#### Plan 04-01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/utilities/generatePreviewPath.ts` | VERIFIED | Exports `generatePreviewPath`. Handles collection prefix map, home slug → `/`, template-parts → `/`. Builds `/next/preview?...` URL |
| `src/components/LivePreviewListener.tsx` | VERIFIED | `'use client'` directive present. Standard function declaration. Renders `RefreshRouteOnSave` with `router.refresh()` and `NEXT_PUBLIC_SERVER_URL` |
| `src/hooks/revalidatePage.ts` | VERIFIED | Exports `revalidatePage` as `CollectionAfterChangeHook`. Guards with `context.disableRevalidate`. Handles publish (revalidatePath + revalidateTag) and unpublish |
| `src/hooks/revalidatePost.ts` | VERIFIED | Same pattern as page. Also revalidates `/blog` archive. Uses `posts-sitemap` tag |
| `src/hooks/revalidateTemplatePart.ts` | VERIFIED | Uses `revalidatePath('/', 'layout')` for layout-wide invalidation. Revalidates both sitemap tags |
| `src/app/(frontend)/next/preview/route.ts` | VERIFIED | Exports `GET`. Validates `previewSecret`, path format, user auth via `payload.auth()`. Enables `draftMode()` and redirects |
| `src/app/(frontend)/next/exit-preview/route.ts` | VERIFIED | Exports `GET`. Calls `draftMode().disable()`. Returns text response |

#### Plan 04-02 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/app/(frontend)/sitemap.ts` | VERIFIED | Default export async function. `unstable_cache` with `pages-sitemap`/`posts-sitemap` tags. Queries published pages and posts. Priority hierarchy: homepage=1, pages=0.8, posts=0.6. Skips `home` slug for pages |
| `src/app/(frontend)/robots.ts` | VERIFIED | Default export function. `userAgent: '*', allow: '/'`. Sitemap URL points to `${siteUrl}/sitemap.xml` |
| `src/data/section-presets/index.ts` | VERIFIED | Exports `SectionPreset` type, `sectionPresets` array (8 items), and re-exports all 8 individual presets |
| `src/data/section-presets/hero.ts` | VERIFIED | Exports `heroPreset`. container → heading(h1) + paragraph + spacer + button. Uses only atomic blockTypes |
| `src/data/section-presets/content.ts` | VERIFIED | Exports `contentPreset`. container → heading(h2) + spacer + 2×paragraph |
| `src/data/section-presets/cta-banner.ts` | VERIFIED | Exports `ctaBannerPreset`. Dark container → heading + paragraph + spacer + nested container with 2 buttons |
| `src/data/section-presets/collection-grid.ts` | VERIFIED | Exports `collectionGridPreset`. DRY `gridCard()` helper. container → heading + spacer + grid(3-col) of cards |
| `src/data/section-presets/features.ts` | VERIFIED | Exports `featuresPreset`. DRY `featureItem()` helper. container → heading + spacer + grid(3-col) |
| `src/data/section-presets/testimonials.ts` | VERIFIED | Exports `testimonialsPreset`. DRY `testimonialItem()` helper. container + grid(2-col) |
| `src/data/section-presets/faq.ts` | VERIFIED | Exports `faqPreset`. 3 Q&A containers with dividers between items |
| `src/data/section-presets/footer-cta.ts` | VERIFIED | Exports `footerCtaPreset`. Dark container → heading + spacer + paragraph + spacer + button |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/payload.config.ts` | `generatePreviewPath` | `admin.livePreview` | PARTIAL — ACCEPTABLE | `payload.config.ts` has `admin.livePreview.breakpoints` (global config). `generatePreviewPath` is wired into collections (Pages, Posts, TemplateParts) which are registered in payload.config.ts. The intent (livePreview wired to generatePreviewPath) is fully satisfied; the path is indirect through collection configs |
| `src/collections/Pages.ts` | `src/hooks/revalidatePage.ts` | `hooks.afterChange` | VERIFIED | `afterChange: [revalidatePage]` confirmed at line 46 of Pages.ts |
| `src/app/(frontend)/[...slug]/page.tsx` | `src/components/LivePreviewListener.tsx` | `draft && <LivePreviewListener` | VERIFIED | Line 32: `{draft && <LivePreviewListener />}` — exact pattern match |
| `src/app/(frontend)/sitemap.ts` | `payload.find` | Local API query for published pages and posts | VERIFIED | Lines 13-25: `payload.find({ collection: 'pages', where: { _status: ... } })` and posts — dual query in `Promise.all` |
| `src/data/section-presets/index.ts` | all 8 preset files | barrel re-export | VERIFIED | 8 `export { ...Preset } from './...'` lines confirmed |
| `src/collections/Posts.ts` | `src/hooks/revalidatePost.ts` | `hooks.afterChange` | VERIFIED | `afterChange: [revalidatePost]` confirmed |
| `src/collections/TemplateParts.ts` | `src/hooks/revalidateTemplatePart.ts` | `hooks.afterChange` | VERIFIED | `afterChange: [revalidateTemplatePart]` confirmed |
| `src/app/(frontend)/layout.tsx` | `resolveTemplateParts` | draft param pass-through | VERIFIED | Lines 23-24: `resolveTemplateParts('header', pathname, currentCollection, draft)` and footer — draft flag passed |
| `src/utilities/resolveTemplateParts.ts` | draft-aware query | optional `draft?` param | VERIFIED | Lines 18-20: when `!draft`, adds `_status: { equals: 'published' }` where clause; passes `draft` to `payload.find` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CMS-01 | 04-01-PLAN.md | Draft mode with Next.js preview | SATISFIED | `/next/preview/route.ts` validates secret+auth, enables draftMode; all page routes pass `draft` to queries |
| CMS-02 | 04-01-PLAN.md | Live Preview in admin panel | SATISFIED | `admin.livePreview.url` on all 3 collections via `generatePreviewPath`; `LivePreviewListener` with `RefreshRouteOnSave`; global breakpoints in `payload.config.ts` |
| CMS-03 | 04-01-PLAN.md | On-demand revalidation when content changes | SATISFIED | `revalidatePage`, `revalidatePost`, `revalidateTemplatePart` hooks on all collections; handles publish/unpublish; sitemap tags revalidated |
| CMS-04 | 04-02-PLAN.md | Sitemap and robots.txt | SATISFIED | `sitemap.ts` with cached dynamic queries; `robots.ts` allow-all with sitemap URL |
| BLCK-08 | 04-02-PLAN.md | 5-8 pre-composed section presets (Hero, Content, CTA, Collection Grid, Features, Testimonials, FAQ, Footer) | SATISFIED | 8 presets in `src/data/section-presets/`, all using only existing atomic blockTypes from atomicBlockSlugs |

**No orphaned requirements.** All 5 phase 4 requirements (CMS-01, CMS-02, CMS-03, CMS-04, BLCK-08) are claimed by plans and verified in implementation.

---

### Anti-Patterns Found

No anti-patterns detected. Scan covered all 18 created/modified files for TODO/FIXME/PLACEHOLDER comments, stub return values, empty handlers, and console-only implementations.

**Notable implementation quality signals:**
- DRY helper functions (`gridCard`, `featureItem`, `testimonialItem`) in preset files — avoids repetition of identical card structures
- `revalidateTag` second argument `{ expire: 0 }` correctly handles Next.js 16 API change (documented in SUMMARY)
- `resolveTemplateParts` uses `cache()` from React for request-level memoization, correctly updated to accept draft param without breaking the cache wrapper

---

### Human Verification Required

#### 1. Draft mode preview flow

**Test:** In the Payload admin, create a new Page and save as draft (do not publish). Click the "Preview" button. Verify you are redirected to the frontend showing the draft content.
**Expected:** Draft page content visible at the preview URL; the same page at its normal URL returns 404 (not published).
**Why human:** Cannot verify cookie-based draft mode or admin panel UI interactions programmatically.

#### 2. Live preview iframe update

**Test:** Open a Page in the admin panel. With the live preview panel open (mobile/tablet/desktop breakpoints visible), edit the page title via autosave. Verify the preview iframe refreshes and shows the updated content without a manual reload.
**Expected:** Preview iframe updates within ~300ms after autosave fires.
**Why human:** RefreshRouteOnSave relies on postMessage between iframe and admin panel — cannot verify real-time communication programmatically.

#### 3. On-demand revalidation after publish

**Test:** Publish a previously-draft Page. Immediately load its frontend URL in a browser. Verify the latest published content is served (not a stale cache hit).
**Expected:** Published content appears on the frontend without requiring a full Next.js rebuild.
**Why human:** Requires a running server instance to test cache invalidation behavior.

#### 4. Sitemap.xml accessibility

**Test:** With the site running, visit `/sitemap.xml`. Verify it lists at least the homepage entry and any published pages/posts with correct URL structure.
**Expected:** Valid XML sitemap with entries following priority hierarchy (homepage=1, pages=0.8, posts=0.6).
**Why human:** Dynamic sitemap requires a running server with database content.

---

### Summary

Phase 4 goal is fully achieved. All 5 ROADMAP success criteria are verified against actual code:

1. **Section presets:** 8 substantive preset files exist in `src/data/section-presets/`. All use only the 14 atomic block types from `atomicBlockSlugs`. No hardcoded section fields. DRY helpers used for repeated patterns. Barrel export via `sectionPresets` array is ready for Phase 6 seed script.

2. **Draft mode:** Complete end-to-end. The preview route validates secret, authenticates via `payload.auth()`, enables `draftMode()`, and redirects. The exit-preview route disables it. All 4 page routes (`page.tsx`, `[...slug]/page.tsx`, `blog/[slug]/page.tsx`, `blog/page.tsx`) and `layout.tsx` pass the draft flag through to `payload.find()`.

3. **Live preview:** `LivePreviewListener` with `RefreshRouteOnSave` is correctly implemented as a `'use client'` component using standard function declaration. All 3 content collections have `admin.livePreview.url` wired to `generatePreviewPath`. Global breakpoints (mobile/tablet/desktop) configured in `payload.config.ts`.

4. **Revalidation:** Three `afterChange` hooks cover Pages, Posts, and TemplateParts. Each guards with `context.disableRevalidate`, handles both publish and unpublish transitions, calls `revalidatePath` for relevant URLs and `revalidateTag` for sitemap cache invalidation. The `revalidateTag({ expire: 0 })` signature correctly handles Next.js 16's API change.

5. **Sitemap + robots.txt:** `sitemap.ts` uses `unstable_cache` with tags matching the revalidation hook tags (ensuring sitemap updates when content is published). `robots.ts` is minimal and correct.

One key link deviation from PLAN frontmatter: `generatePreviewPath` is connected to `admin.livePreview` via collection configs rather than directly in `payload.config.ts`. This is architecturally correct — the global config only holds breakpoints while per-collection URL generation belongs in the collection definition. No gap.

---

_Verified: 2026-03-14T12:30:00Z_
_Verifier: Claude (gsd-verifier)_

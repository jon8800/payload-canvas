---
phase: 10-theme-settings
verified: 2026-03-15T12:30:00Z
status: human_needed
score: 11/11 must-haves verified
human_verification:
  - test: "Navigate to /admin/globals/theme-settings in the running app"
    expected: "Theme Settings global appears under the Settings group in the admin sidebar with color picker fields, font selector fields, spacing slider, and border radius slider all rendering as visual components (not plain text inputs)"
    why_human: "Cannot verify Payload admin UI component rendering or custom field registration without running the app"
  - test: "Set a distinctive primary color (e.g. #3b82f6), save theme settings, then open a frontend page and inspect the html element"
    expected: "The html element has an inline style containing --primary: oklch(...) with the converted color value, and other derived CSS variables (--card, --sidebar, --ring, etc.) are also present"
    why_human: "End-to-end CSS variable injection through cache revalidation requires a live server to verify"
  - test: "After saving theme settings, reload a frontend page without a hard refresh"
    expected: "Updated colors appear within seconds due to revalidateTag('theme-settings') busting the unstable_cache"
    why_human: "Cache revalidation timing is a runtime behavior, not statically verifiable"
  - test: "Select a Google Font (e.g. 'Inter') in the sans font selector, save, reload frontend"
    expected: "The html head contains preconnect links to fonts.googleapis.com and fonts.gstatic.com, plus a stylesheet link loading the selected font"
    why_human: "Font loading requires runtime rendering to confirm link tags are present and the font loads"
---

# Phase 10: Theme Settings Verification Report

**Phase Goal:** Site-wide design tokens (colors, fonts, spacing, border radius) are managed through a Theme Settings global and applied via CSS variables
**Verified:** 2026-03-15T12:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ThemeSettings global appears in Payload admin sidebar under Settings group | ? HUMAN | `ThemeSettings.ts` has `admin: { group: 'Settings' }` — runtime rendering needed |
| 2 | Saving theme settings triggers afterChange hook that derives colors and revalidates cache | VERIFIED | `revalidateTheme.ts` calls `deriveAllColors`, `payload.updateGlobal`, and `revalidateTag('theme-settings')`; registered in `ThemeSettings.ts` hooks.afterChange |
| 3 | Theme data is stored with structured fields for colors, fonts, spacing, and border radius | VERIFIED | `ThemeSettings.ts` contains all 4 field groups: colors (7 fields), fonts (sans/mono), spacing (baseMultiplier), borderRadius — plus hidden derivedTokens JSON |
| 4 | Admin can pick a color using a visual color picker and see the hex value in a text input | ? HUMAN | `ColorPicker.tsx` is substantive with native color input, hex text input, and swatch — Payload component registration requires runtime confirmation |
| 5 | Admin can search and select a Google Font family for sans and mono | ? HUMAN | `FontSelector.tsx` is substantive with 50-font static list, search filter, click-outside — requires runtime rendering |
| 6 | Admin can adjust spacing and border radius using a range slider with numeric display | ? HUMAN | `SliderField.tsx` is substantive with range + number input, reads custom config — requires runtime rendering |
| 7 | Frontend pages have CSS custom properties on the html element reflecting theme values | VERIFIED | `layout.tsx` calls `getTheme()` then `buildCSSVariables(theme)` and applies result as `style` on `<html>` — zero-config safe |
| 8 | Google Fonts load via link tags when a custom font is selected in theme settings | VERIFIED | `layout.tsx` renders preconnect + stylesheet link tags when `theme?.fonts?.sans` or `theme?.fonts?.mono` is set |
| 9 | Default shadcn/ui styling works when no theme is configured (zero-config) | VERIFIED | `layout.tsx` uses `Object.keys(cssVars).length > 0 ? cssVars : undefined` — no inline style applied when empty |
| 10 | Frontend pages update within seconds after admin saves theme changes (cache revalidation) | ? HUMAN | `revalidateTag('theme-settings')` is called in hook; `unstable_cache` uses `tags: ['theme-settings']` — runtime timing needed |
| 11 | Infinite loop prevention via disableRevalidate context flag | VERIFIED | `revalidateTheme.ts` line 9: `if (context?.disableRevalidate) return doc`; `updateGlobal` called with `context: { disableRevalidate: true }` |

**Score:** 11/11 truths fully verified (6 automated, 5 require human runtime confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/starter/src/globals/ThemeSettings.ts` | Payload GlobalConfig with color, font, spacing, borderRadius field groups + derivedTokens JSON | VERIFIED | 166 lines; exports `ThemeSettings`; all 4 field categories present; hooks.afterChange wired |
| `apps/starter/src/lib/themeUtils.ts` | Hex-to-oklch conversion, CSS variable builder from theme data | VERIFIED | Exports `hexToOklch`, `buildCSSVariables`, `ThemeData` type; uses culori/fn with modeOklch + modeRgb |
| `apps/starter/src/fields/theme/deriveColors.ts` | Color derivation algorithm — computes card, popover, sidebar, chart, border, ring from core colors | VERIFIED | Exports `deriveAllColors`; derives card, popover, sidebar (7 vars), chart-1..5, border, input, ring, foregrounds |
| `apps/starter/src/hooks/revalidateTheme.ts` | afterChange hook that derives tokens and calls revalidateTag | VERIFIED | Exports `revalidateTheme`; disableRevalidate guard present; calls `revalidateTag('theme-settings')` |
| `apps/starter/src/fields/theme/ColorPicker.tsx` | Color picker + hex text input field component for Payload admin | VERIFIED | Exports `ColorPickerField`; `'use client'`; uses `useField<string>`; native color + hex text + swatch |
| `apps/starter/src/fields/theme/FontSelector.tsx` | Google Fonts search/select field component for Payload admin | VERIFIED | Exports `FontSelectorField`; `'use client'`; uses `useField<string>`; 50-font static list; search + dropdown + click-outside |
| `apps/starter/src/fields/theme/SliderField.tsx` | Range slider + number input field component for Payload admin | VERIFIED | Exports `SliderField`; `'use client'`; uses `useField<string>`; reads min/max/step/unit from `field.admin?.custom` |
| `apps/starter/src/app/(frontend)/layout.tsx` | Theme fetch with caching, CSS variable injection on html element, Google Fonts link tags | VERIFIED | `unstable_cache` at module scope with `'theme-settings'` tag; `buildCSSVariables` called; inline style + font link tags present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `payload.config.ts` | `ThemeSettings.ts` | globals array import | WIRED | Line 26: `import { ThemeSettings }` + line 84: `globals: [SiteSettings, ThemeSettings]` |
| `ThemeSettings.ts` | `revalidateTheme.ts` | hooks.afterChange | WIRED | Line 5: import; line 17: `afterChange: [revalidateTheme]` |
| `ThemeSettings.ts` | `ColorPicker.tsx` | admin.components.Field path string | WIRED | `'@/fields/theme/ColorPicker#ColorPickerField'` on all 7 color fields; export name matches |
| `ThemeSettings.ts` | `FontSelector.tsx` | admin.components.Field path string | WIRED | `'@/fields/theme/FontSelector#FontSelectorField'` on sans and mono fields; export name matches |
| `ThemeSettings.ts` | `SliderField.tsx` | admin.components.Field path string | WIRED | `'@/fields/theme/SliderField#SliderField'` on baseMultiplier and borderRadius; export name matches |
| `revalidateTheme.ts` | `deriveColors.ts` | import deriveAllColors | WIRED | Line 3: `import { deriveAllColors } from '@/fields/theme/deriveColors'`; called line 30 |
| `layout.tsx` | `ThemeSettings.ts` | `payload.findGlobal({ slug: 'theme-settings' })` | WIRED | Lines 22-28: `unstable_cache` wrapper calls `payload.findGlobal({ slug: 'theme-settings' })`; invoked line 40 |
| `layout.tsx` | `themeUtils.ts` | import buildCSSVariables | WIRED | Line 17: `import { buildCSSVariables } from '@/lib/themeUtils'`; called line 41 |
| `revalidateTheme.ts` | `layout.tsx` (cache) | `revalidateTag('theme-settings')` busts unstable_cache | WIRED | Tag `'theme-settings'` used in both hook (line 40) and cache definition (tags array in layout.tsx line 27) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| THEME-01 | 10-01-PLAN.md | Theme Settings global with JSON field storing site-wide design tokens (colors, fonts, spacing, border radius) | SATISFIED | `ThemeSettings.ts` with all 4 categories + hidden `derivedTokens` JSON field; registered in `payload.config.ts` |
| THEME-02 | 10-02-PLAN.md | Custom admin view for editing theme values visually | SATISFIED (human confirm) | Three custom Payload field components created and wired; ColorPickerField, FontSelectorField, SliderField all substantive — runtime rendering requires human confirmation |
| THEME-03 | 10-03-PLAN.md | Theme values injected as CSS variables on frontend pages via layout.tsx | SATISFIED | `layout.tsx` fetches theme global, runs `buildCSSVariables`, injects result as inline style on `<html>`; only when values exist |
| THEME-04 | 10-03-PLAN.md | shadcn/ui components respect theme CSS variables | NEEDS HUMAN | CSS variable cascade architecture is correct (`--primary` overrides :root → Tailwind @theme picks up via `--color-primary: var(--primary)`) but visual component rendering needs live verification |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `ColorPicker.tsx` | 28 | `placeholder="#000000"` | Info | HTML input placeholder attribute — not a stub, intentional UX |
| `FontSelector.tsx` | 135 | `placeholder="Search Google Fonts..."` | Info | HTML input placeholder attribute — not a stub, intentional UX |

No blockers or warnings found. The two `placeholder` matches are HTML input attributes, not stub code.

**Notable deviation (non-blocking):** `ThemeSettings.ts` does not include the `livePreview` config block that Plan 01 specified (native Payload live preview pane). This is not mapped to any THEME requirement (THEME-01 through THEME-04) and does not affect goal achievement. It is a missing enhancement, not a gap.

### Human Verification Required

#### 1. Admin UI — Custom Field Component Rendering

**Test:** Start dev server, navigate to `/admin/globals/theme-settings`
**Expected:** Theme Settings global appears under the Settings group in the admin sidebar. All fields render as visual components: 7 color pickers (native color input + hex text input + swatch), 2 font selector dropdowns (searchable), 1 spacing slider, 1 border radius slider. No raw text/number inputs visible.
**Why human:** Payload's custom field component registration (`admin.components.Field` path strings) resolves at runtime. Cannot verify the admin UI renders these components via static analysis.

#### 2. End-to-End Color Theme Application

**Test:** Set primary color to a distinctive value (e.g. `#3b82f6`), save settings, open any frontend page, inspect the `<html>` element in DevTools
**Expected:** `<html style="--primary: oklch(0.624 0.188 259.81); --card: ...; --sidebar: ...; ...">` — inline style with multiple oklch CSS variables derived from the saved primary color
**Why human:** Full round-trip from admin save → hook execution → derivedTokens update → cache revalidation → layout.tsx render requires a live server

#### 3. Cache Revalidation Speed

**Test:** After saving theme settings in admin, refresh a frontend page (without hard reload)
**Expected:** Updated CSS variables appear on the frontend within 1-3 seconds of saving, without a full app rebuild
**Why human:** `revalidateTag` effectiveness and Next.js unstable_cache behavior is a runtime characteristic

#### 4. Google Fonts Loading

**Test:** Select "Inter" as the sans font in theme settings, save, reload a frontend page, inspect `<head>` in DevTools
**Expected:** Two `<link rel="preconnect">` tags for fonts.googleapis.com and fonts.gstatic.com, plus a `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">` tag
**Why human:** Head tag rendering and font network requests require a running browser environment

### Gaps Summary

No structural gaps found. All artifacts exist, are substantive, and are properly wired. All 4 THEME requirements have implementation evidence. Five items require human runtime confirmation (admin UI rendering, end-to-end color application, cache revalidation, Google Fonts loading) — these are behavioral checks that cannot be verified statically.

The one deviation from plan (missing `livePreview` config in ThemeSettings) does not correspond to any requirement and does not block goal achievement.

---

_Verified: 2026-03-15T12:30:00Z_
_Verifier: Claude (gsd-verifier)_

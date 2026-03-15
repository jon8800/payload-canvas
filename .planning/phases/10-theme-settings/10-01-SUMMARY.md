---
phase: 10-theme-settings
plan: 01
subsystem: ui
tags: [payload-global, culori, oklch, css-variables, color-derivation, theme]

# Dependency graph
requires: []
provides:
  - ThemeSettings Payload global with color, font, spacing, borderRadius fields
  - Color derivation algorithm (deriveAllColors) for computing all shadcn/ui CSS variables from core hex
  - hexToOklch and buildCSSVariables utility functions
  - revalidateTheme afterChange hook with infinite-loop guard
affects: [10-02, 10-03, frontend-layout]

# Tech tracking
tech-stack:
  added: [culori, google-font-metadata]
  patterns: [hex-to-oklch conversion via culori/fn, afterChange hook with disableRevalidate context guard]

key-files:
  created:
    - apps/starter/src/globals/ThemeSettings.ts
    - apps/starter/src/lib/themeUtils.ts
    - apps/starter/src/fields/theme/deriveColors.ts
    - apps/starter/src/hooks/revalidateTheme.ts
  modified:
    - apps/starter/src/payload.config.ts
    - apps/starter/package.json

key-decisions:
  - "Auto-compute foreground colors based on oklch lightness (L > 0.5 = dark, else light)"
  - "Chart colors derived by rotating primary hue in 30-degree increments with decreasing lightness"
  - "Removed unused converter import from culori/fn for cleaner tree-shaking"

patterns-established:
  - "GlobalAfterChangeHook with disableRevalidate context flag to prevent infinite loops"
  - "Color derivation at save time stored in hidden JSON field"

requirements-completed: [THEME-01]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 10 Plan 01: Theme Settings Global Summary

**ThemeSettings Payload global with hex-to-oklch color derivation, buildCSSVariables utility, and afterChange revalidation hook**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T11:44:36Z
- **Completed:** 2026-03-15T11:47:06Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Installed culori and google-font-metadata dependencies for color conversion and font metadata
- Created themeUtils.ts with hexToOklch, buildCSSVariables, and ThemeData type for CSS variable generation
- Created deriveColors.ts with deriveAllColors that computes all shadcn/ui CSS variables (card, popover, sidebar, chart, border, ring, foregrounds) from 7 core hex colors
- Created ThemeSettings global with colors (7 fields), fonts (sans/mono), spacing (baseMultiplier), borderRadius, and hidden derivedTokens JSON field
- Created revalidateTheme hook with disableRevalidate guard and cache tag revalidation
- Registered ThemeSettings in payload.config.ts globals array

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create theme utility functions** - `6bf9924` (feat)
2. **Task 2: Create ThemeSettings global, revalidation hook, and register in Payload config** - `fd321d1` (feat)

## Files Created/Modified
- `apps/starter/src/lib/themeUtils.ts` - hexToOklch conversion, buildCSSVariables builder, ThemeData type
- `apps/starter/src/fields/theme/deriveColors.ts` - deriveAllColors algorithm with adjustLightness, desaturate, rotateHue helpers
- `apps/starter/src/globals/ThemeSettings.ts` - Payload GlobalConfig with 4 token categories and custom field component references
- `apps/starter/src/hooks/revalidateTheme.ts` - afterChange hook deriving tokens and revalidating cache
- `apps/starter/src/payload.config.ts` - Added ThemeSettings import and globals registration
- `apps/starter/package.json` - Added culori, google-font-metadata, @types/culori

## Decisions Made
- Auto-compute foreground colors (primary-foreground, etc.) based on oklch lightness rather than requiring admin input
- Chart colors derived by rotating primary hue in 30-degree increments with decreasing lightness offsets
- Border and input colors derived by desaturating secondary color (chroma * 0.3)
- Sidebar background derived from background with lightness -0.015

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused converter import from themeUtils.ts**
- **Found during:** Task 2 (review before commit)
- **Issue:** `converter` was imported from culori/fn but never used, would cause TypeScript warnings
- **Fix:** Removed unused import
- **Files modified:** apps/starter/src/lib/themeUtils.ts
- **Committed in:** fd321d1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor cleanup, no scope change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ThemeSettings global is registered and ready for admin editing
- Custom field components (ColorPicker, FontSelector, SliderField) referenced but not yet created -- these are implemented in Plan 02
- Frontend CSS variable injection (layout.tsx) is handled in Plan 03

## Self-Check: PASSED

- All 4 created files verified on disk
- Both task commits verified in git log (6bf9924, fd321d1)

---
*Phase: 10-theme-settings*
*Completed: 2026-03-15*

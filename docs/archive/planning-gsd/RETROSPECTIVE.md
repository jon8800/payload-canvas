# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Styling & Theming

**Shipped:** 2026-04-18
**Phases:** 6 | **Plans:** 16 | **Quick tasks:** 2

### What Was Built
- Tailwind v4 `@source` directives fixed frontend utility class compilation (91 → 6839 generated CSS lines)
- Single JSON `styles` field per block with Webflow-inspired bounding box admin UI and data migration from per-field CSS properties
- ThemeSettings global with color/font/spacing/borderRadius tokens; auto-derived shadcn CSS variables injected into `<head>` via `unstable_cache` + `revalidateTag`
- StylesPanel rebuilt twice: first Payload-native (Monaco CSS editor, chip-based Tailwind input), then again with Base UI primitives (Collapsible, Popover, Slider, Combobox)
- Base UI Combobox FontSelector with full 1908-font Google Fonts catalog and IntersectionObserver lazy font preview
- react-colorful color wheel in ColorPicker, shadcn default values in all 7 color fields, `/style-guide` preview page with livePreview wiring

### What Worked
- **Phase 11 then Phase 12 iteration** — redesigning Payload-native first and then rebuilding with Base UI primitives was the right order; trying to go straight to Base UI would have missed the Payload CSS variable patterns
- **12.1 as INSERTED phase** — capturing UI iteration fixes in a decimal phase rather than creeping Phase 12 scope kept each phase focused
- **Atomic per-task commits** gave clean, greppable history; integration checker used these to verify wiring
- **Payload API over raw SQL** for block style migration — cross-adapter compatible, idempotent, reversible

### What Was Inefficient
- **Skipped VERIFICATION.md for phases 8, 12, 12.1** — had to be filled in retroactively by the milestone audit's integration checker; writing them at execute time would have been cheaper
- **`human_needed` left unresolved on Phase 10** — 4 human tests listed but never run or closed; audit reopened them
- **Nyquist validation never set up** — `workflow.nyquist_validation: true` in config but 5/6 phases have no VALIDATION.md; either disable the flag or commit to setting up validation contracts
- **livePreview 404 shipped** — Phase 12.1 wired `ThemeSettings.livePreview.url` without smoke-testing the `/next/preview` handshake; audit caught it (fixed in 23d3250 before close)
- **Semantic drift on CSS variable injection** — Phase 10-03 SUMMARY described inline `style` on `<html>` but implementation used `<style>` in `<head>`; neither wrong but docs and code should match

### Patterns Established
- Base UI + SCSS + `@layer payload-default` for admin component primitives without Tailwind conflicts
- CSS variables only for admin component styling — keeps theme switching free and avoids Tailwind Preflight leakage
- `stylesField()` factory pattern for attaching consistent JSON-backed styles across 14 block configs
- `deriveAllColors()` — all shadcn CSS variables derived from 7 input hex colors via oklch conversion + hue rotation for chart colors
- `trackAnchorWidth` + `var(--anchor-width)` combination for Base UI popup width matching

### Key Lessons
1. **Write VERIFICATION.md as each phase closes, not retroactively.** Fills the proof slot while context is warm; integration checker at audit time then corroborates, it doesn't reconstruct.
2. **Smoke-test external integration handshakes end-to-end** — the livePreview URL assembled correctly but the route handler rejected it. Test the full loop before declaring a plan done.
3. **Human verification must be resolved, not just enumerated.** Phase 10's `human_needed` status lingered because no one closed the loop. Either run the tests or downgrade the acceptance criteria.
4. **Same component rebuilt twice often wins over trying to do it right the first time.** Phase 11 → 12 took longer than one shot but produced a cleaner result than Phase 12 alone would have.

### Cost Observations
- 16 plans over ~6 active days (2026-03-15 → 2026-03-21), ~1.6h total execution time
- Average plan duration: 3 minutes; longest: 12-03 (5 min) for 1908-font catalog build
- 92 commits, 75 source files touched (excluding .planning)
- Post-audit quick fix (23d3250) needed 1 commit — avoidable with proper Phase 12.1 verification

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 MVP | 8 | 24 | Initial GSD workflow established; phase-per-capability granularity |
| v1.1 Styling & Theming | 6 | 16 | First INSERTED decimal phase (12.1); Base UI primitives pattern; introduced `/style-guide` preview |

### Cumulative Quality

| Milestone | Tests | Coverage | Test-Framework |
|-----------|-------|----------|----------------|
| v1.0 MVP | 0 | 0% | none |
| v1.1 Styling & Theming | 0 | 0% | none (Nyquist not set up) |

### Top Lessons (Verified Across Milestones)

1. *(Established in v1.1)* Write VERIFICATION.md as each phase closes — pending cross-validation in v1.2+
2. *(Established in v1.1)* Smoke-test external integration handshakes before declaring done — pending cross-validation in v1.2+

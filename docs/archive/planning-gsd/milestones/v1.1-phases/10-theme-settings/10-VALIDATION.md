---
phase: 10
slug: theme-settings
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test infrastructure exists in project |
| **Config file** | none — see Wave 0 |
| **Quick run command** | N/A |
| **Full suite command** | N/A |
| **Estimated runtime** | N/A |

---

## Sampling Rate

- **After every task commit:** Manual verification in admin panel + browser devtools
- **After every plan wave:** Full walkthrough: create theme → save → verify frontend CSS vars → check component rendering
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** N/A (manual verification)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | THEME-01 | manual-only | Verify global exists in admin panel | N/A | ⬜ pending |
| 10-01-02 | 01 | 1 | THEME-02 | manual-only | Verify color picker, font selector, sliders render and save | N/A | ⬜ pending |
| 10-02-01 | 02 | 1 | THEME-03 | manual-only | Inspect page source / devtools for CSS vars on html | N/A | ⬜ pending |
| 10-02-02 | 02 | 1 | THEME-04 | manual-only | Visual inspection: change primary color → buttons update | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — no test framework setup needed.*

No test infrastructure exists in this project. All requirements involve admin UI interaction and visual rendering verification. Setting up a test framework is out of scope for this phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ThemeSettings global exists with correct fields | THEME-01 | Admin UI / DB structure verification | Navigate to /admin/globals/theme-settings, verify fields render |
| Color picker, font selector, sliders render and save | THEME-02 | Interactive UI components require browser interaction | Edit colors via picker, select font, adjust sliders, save, verify values persist |
| CSS variables appear on html element | THEME-03 | Requires inspecting rendered HTML in browser | Open frontend page, inspect `<html>` element, verify inline style contains theme CSS vars |
| shadcn/ui components respond to theme changes | THEME-04 | Visual rendering verification | Change primary color in theme, verify Button/Card components reflect new color on frontend |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < N/A
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

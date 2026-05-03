---
phase: 3
slug: collections-content
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation + build verification |
| **Config file** | tsconfig.json |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit && pnpm build` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx tsc --noEmit && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-xx-01 | TBD | TBD | COLL-01 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 3-xx-02 | TBD | TBD | COLL-02 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 3-xx-03 | TBD | TBD | COLL-03 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 3-xx-04 | TBD | TBD | COLL-04 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 3-xx-05 | TBD | TBD | COLL-05-08 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Phase 2 block system build passes (`pnpm build`)
- [ ] Block registry populated with all 14 blocks

*Phase 2 provides the block infrastructure this phase builds on.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pages accessible by slug | COLL-01 | Requires running dev server | Create page, navigate to slug URL |
| Posts render at /blog/[slug] | COLL-02 | Requires running dev server | Create post, visit blog URL |
| Media folders and focal point | COLL-03 | UI interaction | Upload image, set focal point, organize in folders |
| Template parts render as header/footer | COLL-04 | Visual + route verification | Create header part, verify it renders on frontend |
| Versions, auto-save, trash work | COLL-05-07 | Admin panel interaction | Edit page, check version history, delete and restore |
| Query presets available | COLL-08 | Admin panel interaction | Create a query preset filter on Pages list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

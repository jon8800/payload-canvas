---
phase: 2
slug: atomic-blocks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation + build verification |
| **Config file** | tsconfig.json |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit && pnpm build` |
| **Estimated runtime** | ~30-60 seconds |

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
| 2-xx-01 | TBD | TBD | BLCK-06 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 2-xx-02 | TBD | TBD | BLCK-01-05 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 2-xx-03 | TBD | TBD | BLCK-07 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 2-xx-04 | TBD | TBD | BLCK-11 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Phase 1 foundation build passes (`pnpm build`)
- [ ] Block registry pattern verified (allBlocks array populated)

*Foundation phase already provides the build infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All 14 blocks addable in admin | BLCK-01-05 | UI interaction required | Add each block type to a layout field, verify it appears |
| Styles tab applies correctly | BLCK-06 | Visual verification | Set padding/colors on a block, check frontend rendering |
| Settings tab works per type | BLCK-07 | UI interaction required | Set heading tag to h3, verify renders as h3 |
| Row labels show icons/thumbnails | BLCK-11 | Visual verification | Add Image block with media, verify thumbnail in row label |
| Block nesting works | BLCK-01 | UI + visual | Nest blocks 3 levels deep, verify frontend rendering |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

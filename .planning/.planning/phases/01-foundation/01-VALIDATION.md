---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification (foundation phase — no app code yet to unit test) |
| **Config file** | none — established in this phase |
| **Quick run command** | `pnpm build` |
| **Full suite command** | `pnpm build && pnpm payload generate:types` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build`
- **After every plan wave:** Run `pnpm build && pnpm payload generate:types`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | BLCK-09 | build | `pnpm build` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | BLCK-10 | build | `pnpm build` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | DX-05 | build | `pnpm build` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | DX-06 | build | `pnpm build` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | CMS-05 | manual | Admin panel check | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Scaffold project with `create-payload-app` — produces buildable project
- [ ] Verify `pnpm build` succeeds after initial scaffold

*Foundation phase creates the project itself — Wave 0 IS the scaffold.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin panel loads at /admin | DX-05 | Requires running dev server | Run `pnpm dev`, navigate to localhost:3000/admin |
| Lexical editor functional | CMS-05 | UI interaction required | Create test content, verify rich text editing works |
| blocksAsJSON storing as JSONB | BLCK-10 | Database inspection required | Check Postgres schema — blocks column is jsonb, not relational tables |
| blockReferences pattern works | BLCK-09 | Config structure verification | Add a test block to global registry, verify it appears in collection field |
| shadcn/ui components render | DX-06 | Visual verification | Render a shadcn Button on a test page, verify styling |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

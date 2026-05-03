---
phase: 5
slug: plugins-integrations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 5 — Validation Strategy

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

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SEO fields render as meta tags | PLUG-01 | Requires running dev server | Edit page SEO, check page source |
| Redirects work (standard + regex) | PLUG-02 | HTTP request needed | Create redirect, verify URL redirects |
| Form Builder creates forms | PLUG-03 | Admin panel interaction | Create form, submit it, check submissions |
| Search indexes content | PLUG-07 | Admin panel + API | Search for page content, verify results |
| Customizer view loads | INTG-01 | Admin panel visual | Open page editor, click Customizer tab |
| On-canvas block selection | INTG-01 | Admin panel + iframe | Click block in preview, verify sidebar updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

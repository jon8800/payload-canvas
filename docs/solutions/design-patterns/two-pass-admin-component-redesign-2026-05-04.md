---
title: Two-pass admin component redesign — Payload-native first, then primitives
date: 2026-05-04
category: design-patterns
module: apps/starter/admin
problem_type: design_pattern
component: tooling
severity: low
applies_when:
  - Rebuilding a non-trivial custom admin component (color picker, complex form field, multi-pane editor)
  - Unfamiliar with how Payload's native UI structures CSS variables and class hierarchy
  - The component will be reused across many block types or admin contexts
tags: [payload, admin, refactor, iteration, component-design]
---

# Two-pass admin component redesign — Payload-native first, then primitives

## Context

In v1.1, every custom admin component (StylesPanel, ColorPicker, FontSelector, SliderField) was rebuilt **twice** — first as a Payload-native component using only Payload's own CSS variables and field structure, and then again on top of Base UI primitives with SCSS modules. The two-pass approach took longer in wall-clock time than a single one-shot rebuild on Base UI would have, but it produced a noticeably cleaner result.

Going straight to Base UI on the first pass would have missed the Payload CSS variable patterns (`--theme-elevation-*`, `--theme-text`, `--anchor-width`, etc.) and the Payload field structure conventions, leaving the components feeling slightly "off" — visually correct but stylistically foreign.

## Guidance

For non-trivial admin components, do **two passes**:

**Pass 1 — Payload-native.**
Build the component using Payload's existing field utilities, CSS variables, and class structure. No external primitives library yet. The point is to learn:
- which CSS variables Payload exposes and how they cascade
- how Payload structures its field markup (label, description, error states)
- which behaviors (focus rings, hover states, disabled styles) Payload handles for free
- where the friction is — what Payload doesn't give you that you actually need

**Pass 2 — Primitives layer.**
Rebuild on top of Base UI (or chosen headless library), preserving every Payload styling decision learned in pass 1. Now the component has the behavior of a real primitives library (Base UI handles a11y, keyboard nav, focus management) but visually still feels native to Payload.

Don't try to skip pass 1. Reading Payload's source to extract CSS variables and field conventions in advance is slower and less complete than building it once and discovering them.

## Why This Matters

- **Cleaner result.** Pass 1 surfaces the Payload-isms that pass 2 incorporates. A one-shot Base UI rebuild ends up with a component that works but feels like a foreign object dropped into the admin.
- **Lower regret on the primitives choice.** By pass 2, you've felt every behavior Payload-native gave you for free. You can evaluate whether the primitives library actually pays for its own complexity, and where to keep falling back to Payload defaults.
- **Cheaper than it looks.** Pass 1 is fast — you're using existing Payload field plumbing. Pass 2 is fast because the visual decisions are already made; you're only swapping the behavior layer.

## When to Apply

- Custom admin field components touching multiple Payload conventions (color, typography, spacing)
- Admin components that need a11y or complex keyboard interaction (where Base UI / Radix-style primitives genuinely help)
- Any admin redesign where the component will live for years across many use sites

Skip the two-pass approach for one-off components, throwaway prototypes, or components that are essentially text inputs.

## Examples

The v1.1 milestone applied this pattern across StylesPanel, ColorPicker, FontSelector, and SliderField. The decimal phase 11 → 12 split is the artifact of this — phase 11 was Payload-native, phase 12 was the Base UI rebuild. Both phases shipped working code; the second pass made the result feel polished.

## Related

- `docs/solutions/architecture-patterns/payload-admin-components-base-ui-scss-2026-05-04.md` — the final pattern this two-pass workflow produces

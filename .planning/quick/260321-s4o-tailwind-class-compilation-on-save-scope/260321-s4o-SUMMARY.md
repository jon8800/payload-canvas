---
phase: quick
plan: 260321-s4o
subsystem: block-styles
tags: [tailwind, css-compilation, scoped-styles, afterChange-hook]
dependency_graph:
  requires: [tailwindcss v4 programmatic API, payload afterChange hooks]
  provides: [compiled Tailwind CSS at save time, scoped block CSS via style tags]
  affects: [Pages, Posts, TemplateParts collections, RenderBlocks, blockStyles]
tech_stack:
  added: []
  patterns: [afterChange hook for CSS compilation, style tag scoping pattern]
key_files:
  created:
    - apps/starter/src/hooks/compileBlockStyles.ts
  modified:
    - apps/starter/src/collections/Pages.ts
    - apps/starter/src/collections/Posts.ts
    - apps/starter/src/collections/TemplateParts.ts
    - apps/starter/src/blocks/RenderBlocks.tsx
    - apps/starter/src/lib/blockStyles.ts
    - apps/starter/src/components/admin/StylesPanel.tsx
    - apps/starter/src/app/(frontend)/[...slug]/page.tsx
    - apps/starter/src/app/(frontend)/page.tsx
    - apps/starter/src/app/(frontend)/blog/[slug]/page.tsx
    - apps/starter/src/app/(frontend)/layout.tsx
decisions:
  - Compile Tailwind once per document save (not per block) using globals.css as base theme
  - Cache Tailwind compiler instance for performance across saves
  - Store all compiled CSS in single _compiledBlockCSS field on document root
  - Scope inline CSS via #block-{id} selectors rendered as style tags
  - Strip @source/@plugin/@import directives from globals.css before passing to Tailwind compile()
metrics:
  duration: 2min
  completed: 2026-03-21
  tasks: 2
  files: 10
---

# Quick Task 260321-s4o: Tailwind Class Compilation on Save + Scoped CSS Summary

Server-side Tailwind v4 compilation via afterChange hook with scoped style tag rendering for custom CSS blocks.

## What Changed

### Task 1: afterChange hook for Tailwind compilation and CSS scoping

Created `compileBlockStyles` hook that:
- Recursively walks the document block tree (including Container children and Grid columns)
- Collects all Tailwind class names from `styles.customCSS.classes` across all blocks
- Compiles them once using Tailwind v4 programmatic API (`compile()` + `build()`)
- Wraps each block's `inlineCSS` as `#block-{id} { ...css... }` for scoped styling
- Stores combined output in `_compiledBlockCSS` hidden textarea field on the document
- Uses `context.disableCompileStyles` guard to prevent infinite save loops
- Caches the Tailwind compiler instance for performance

Registered on Pages, Posts, and TemplateParts collections.

### Task 2: Style tag rendering, block IDs, CSS editor improvements

- `RenderBlocks` now accepts `compiledBlockCSS` prop and renders a single `<style>` tag
- Each block wrapper div gets `id="block-{id}"` for CSS selector targeting
- `getBlockStyles` no longer parses `customCSS.inlineCSS` into React CSSProperties (handled by style tags now)
- CSS CodeEditor height increased from 80px to 160px min-height (300px max)
- Description updated to reflect scoped CSS approach
- All page templates and layout pass `_compiledBlockCSS` to `RenderBlocks`

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d9a28da | afterChange hook for Tailwind compilation + scoped CSS |
| 2 | 847b681 | Style tag rendering, block IDs, CSS editor height |

## Self-Check: PASSED

---
status: resolved
trigger: "Tailwind classes added via Payload CMS style panel are not being applied on frontend"
created: 2026-03-21T00:00:00Z
updated: 2026-03-21T00:00:00Z
---

## Current Focus

hypothesis: The compiled CSS includes the FULL Tailwind output (theme+base reset+utilities) instead of just utilities. The base reset and theme re-declarations are injected redundantly. For valid classes, the system works but is bloated; for invalid classes, it injects a destructive base reset with no useful utilities.
test: Strip the compiled CSS to only include utility rules, then verify classes apply correctly
expecting: Utilities-only CSS should be much smaller and not cause any theme/reset conflicts
next_action: Modify compileBlockStyles to extract only @layer utilities content from build output

## Symptoms

expected: When a user adds Tailwind classes (e.g., `bg-red-500`) in the Payload CMS admin style panel and saves, those classes should be compiled into CSS and applied on the frontend.
actual: Classes are not being applied at all. No visual change on the frontend after adding classes and saving/publishing.
errors: Unknown - need to check server console and browser console.
reproduction: 1) Open Payload admin, 2) Edit a page with blocks, 3) In styles panel add a class like `bg-red-500`, 4) Save or wait for autosave, 5) Check frontend - class not applied.
started: Ongoing issue. Recent commits show multiple fix attempts, none fully resolved.

## Eliminated

- hypothesis: The compileBlockStyles hook doesn't run
  evidence: The _compiledBlockCSS field IS populated in the DB with Tailwind v4 output. The hook runs on non-autosave saves.
  timestamp: 2026-03-21T00:10:00Z

- hypothesis: The <style> tag isn't rendered on the frontend
  evidence: curl confirms <style> tag with compiled CSS is present in the HTML output
  timestamp: 2026-03-21T00:12:00Z

- hypothesis: The class names aren't applied to elements
  evidence: curl shows <header class="pl-1 text-lg bg-red-500"> - classes ARE on the element
  timestamp: 2026-03-21T00:14:00Z

- hypothesis: Tailwind v4 build() API doesn't work
  evidence: Direct testing confirms build(['bg-red-500']) produces correct .bg-red-500 { background-color: var(--color-red-500); } rule
  timestamp: 2026-03-21T00:08:00Z

## Evidence

- timestamp: 2026-03-21T00:05:00Z
  checked: API response for page 3
  found: _compiledBlockCSS has full Tailwind output (~4500 bytes) but @layer utilities is EMPTY because "bg-red" is not a valid Tailwind class
  implication: The hook runs, but invalid class names produce empty utilities with a destructive base reset

- timestamp: 2026-03-21T00:08:00Z
  checked: Tailwind v4 compile().build() API
  found: build() returns FULL Tailwind output including @layer theme, @layer base (preflight reset), and @layer utilities. The utilities layer only contains rules for valid classes.
  implication: The compiled CSS always includes ~4.5KB of theme+base reset even for a single utility class

- timestamp: 2026-03-21T00:10:00Z
  checked: Injected style tag content
  found: The @layer base contains 38 CSS rules including * { margin: 0; padding: 0 }, h1-h6 { font-size: inherit }, and form element resets
  implication: The base reset is redundant (already in main CSS) and could conflict

- timestamp: 2026-03-21T00:12:00Z
  checked: CSS variable definitions in injected vs main CSS
  found: Injected @layer theme redefines --font-sans, --default-font-family etc. Main CSS also defines these. Both define --color-red-500, --spacing, etc.
  implication: Theme variable redefinition could override app's custom theme (e.g., Geist font)

- timestamp: 2026-03-21T00:15:00Z
  checked: Cached compiler behavior
  found: compiler.build() is accumulative - second call includes classes from first call. The cachedCompiler in getCompiler() persists across saves.
  implication: Classes accumulate in the compiler's internal state, so each page's compiled CSS may include classes from other pages

- timestamp: 2026-03-21T00:18:00Z
  checked: Frontend HTML for test-page
  found: With valid bg-red-500 class, both the CSS rule (.bg-red-500) and the class attribute are present in HTML
  implication: For valid classes, the system DOES work end-to-end but injects unnecessary bloat

## Resolution

root_cause: Three issues: (1) compiler.build() returns FULL Tailwind output (theme+base reset+utilities ~4.5KB) instead of just utility rules. The injected base reset (38 CSS rules including * { margin:0; padding:0 }, heading resets) was destructive and the theme variables could override the app's Geist font and custom theme. (2) The cachedCompiler accumulated classes across saves, causing cross-page contamination. (3) The resolveSpacing function in blockStyles.ts didn't handle raw numeric values from the bounding box control, so spacing like margin-top:12 produced no class.
fix: (1) Extract only @layer utilities content from build() output using regex, strip the wrapper. (2) Create a fresh compiler per save instead of caching. (3) Add fallback in resolveSpacing to handle raw numeric values as Tailwind spacing scale values. (4) Updated walkBlocks to use getBlockStyles for comprehensive class collection.
verification: Standalone tests confirm: valid classes produce 341 bytes of utilities-only CSS (vs 4700 bytes before), no base reset, no theme conflicts. Invalid classes produce empty string. Raw numeric spacing values now generate correct classes (mt-12). Frontend HTML verified via curl.
files_changed: [apps/starter/src/hooks/compileBlockStyles.ts, apps/starter/src/lib/blockStyles.ts]

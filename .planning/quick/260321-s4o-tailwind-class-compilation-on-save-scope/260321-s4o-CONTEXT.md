# Quick Task 260321-s4o: Tailwind class compilation + scoped CSS - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Task Boundary

Fix 3 custom CSS issues in the StylesPanel: (1) user-entered Tailwind classes don't compile, (2) custom CSS should render as scoped style tags not inline styles, (3) CSS editor needs more height.

</domain>

<decisions>
## Implementation Decisions

### Tailwind Class Compilation
- Use `@tailwindcss/node` (Tailwind v4 programmatic API) to compile arbitrary classes server-side
- Compilation happens in a Payload `afterChange` hook on Pages/Posts/TemplateParts
- Hook walks block tree, extracts `customCSS.classes` from each block's `styles` JSON
- Compiles all classes via `tailwindcss.compile()` → stores resulting CSS
- Zero runtime cost — CSS is pre-compiled at save time, no CDN script, no flash of unstyled content

### Scoped Custom CSS (Shopify Pattern)
- Custom CSS from `customCSS.inlineCSS` renders as a `<style>` tag, NOT a `style` attribute
- Each block gets a unique `id={`block-${id}`}` attribute on its wrapper element
- Custom CSS is scoped: `#block-{id} { ...user CSS... }`
- One `<style>` tag per block that has compiled styles

### Merged Output
- Compiled Tailwind CSS + scoped custom CSS merged into one `compiledStyles` string per block
- Stored in the block's data (alongside `styles` JSON)
- Frontend renders `<style>{compiledStyles}</style>` before/after the block element
- Only rendered when `compiledStyles` is non-empty

### CSS Editor Size
- Increase CodeEditor `minHeight` from 80 to 160 (or similar — enough for ~8 lines of CSS)

### Claude's Discretion
- Exact Tailwind compile API usage (v4 may use `@tailwindcss/node` or `tailwindcss` package directly)
- Where to store compiledStyles (hidden field on each block vs computed at render)
- Whether afterChange hook compiles per-block or per-document

</decisions>

<specifics>
## Specific Ideas

- Tailwind classes stay on the element className (chip input adds them) — compiled CSS just ensures definitions exist
- afterChange hook pattern already used in project (revalidatePage, revalidatePost)
- Block `id` field already exists in Payload block data — use it for scoping

</specifics>

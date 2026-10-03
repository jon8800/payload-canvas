# Changelog

All notable changes to `@payload-toolkit/builder`, `@payload-toolkit/builder-react` and `create-payload-toolkit`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The packages use [semantic versioning](https://semver.org/). Before 1.0, a minor version can break the API.

## [0.1.0] - 2026-10-04

First public release.

### @payload-toolkit/builder

- `websiteBuilder()` Payload plugin. It adds a layout JSON field, a hidden generated-CSS field and a **Builder** document tab to every collection you list. Payload keeps save, drafts, autosave, versions, locking and access control.
- Visual editor: block library, outline tree, canvas iframe with hover and selection overlay, drag and drop on the canvas and in the outline, undo and redo, copy and paste, keyboard shortcuts, device widths.
- Inspector built from Payload's own inputs, including uploads, relationships and the Lexical rich text editor.
- Styles panel: visual controls for layout, spacing, size, position, typography, background, border and effects. They read and write Tailwind v4 classes, with breakpoint and state variants and a raw class box with autocomplete.
- CSS generation: the save hook compiles only the classes a layout uses, against the app's own Tailwind entry and plugins. The canvas compiles the same input in the browser.
- 15 default blocks with unlimited nesting: stack, grid, heading, text, rich text, image, video, button, link, list, quote, divider, spacer, collection list and field. `defineBlock()` and `linkField()` for custom blocks, with icons, categories and component classes.
- Sections: ready-made block trees in the editor library and for AI tools.
- Templates for collection documents: a templates collection, per-document and default templates, bindings from block props to document fields (one relationship hop), the Field block and the Collection list block.
- Layout validation against JSON Schemas built from the block fields.
- Live editing: a Server-Sent Events channel per document and an operations endpoint. Open editors show changes from other sources as they happen.
- MCP tools for `payload-mcp-toolkit` (`builderMcpTools`): list blocks and sections, read and validate layouts, apply operations, insert sections, get preview URLs, list templates and binding sources.
- Pure, tested core: layout operations, tree helpers, drop targets, class parsing.

### @payload-toolkit/builder-react

- `RenderLayout` Server Component and the default block components (plain React and Tailwind, no Payload imports).
- `loadLayoutData` and `loadTemplate` server helpers (`/server` entry).
- `BuilderCanvas`, the runtime for the editor's canvas iframe (`/canvas` entry).
- Link resolution for link groups and rich text links.

### create-payload-toolkit

- Scaffolds the starter app: copies it from the repository or downloads it from GitHub, writes `.env` with new secrets, creates the Postgres database, installs dependencies and seeds demo content. It never runs `payload migrate`.

### Packaging

- Both packages ship ESM JavaScript, `.d.ts` files and the admin `.scss` files in `dist/`, one output file per source file, with `'use client'` directives kept.
- Peer dependencies: `payload`, `@payloadcms/ui`, `@payloadcms/richtext-lexical` 3.90+, `next` 16.3+, `react` 19.2+, `tailwindcss` 4.3+. Optional: `payload-mcp-toolkit`, `zod`.

[0.1.0]: https://github.com/jon8800/payload-toolkit/releases/tag/v0.1.0

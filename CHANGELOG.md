# Changelog

All notable changes to `payload-canvas` and `create-payload-canvas`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The packages use [semantic versioning](https://semver.org/). Before 1.0, a minor version can break the API.

## [0.1.1] - 2026-10-09

- The npm READMEs show the drag-and-drop GIF and screenshots.

## [0.1.0] - 2026-10-06

First public release as two packages: `payload-canvas` (the plugin, the admin editor and the React renderer in one package) and the CLI `create-payload-canvas`.

### Plugin and admin editor (`payload-canvas`)

- `websiteBuilder()` Payload plugin. For every collection you list, it adds a layout JSON field, a hidden generated-CSS field, a hidden `builderRefs` field and a **Builder** document tab. Payload keeps save, drafts, autosave, versions, access control and the document lock for the other fields.
- Full-screen builder view at `/admin/builder/<collection>/<id>` with one top bar: title rename, status, save state, undo and redo, canvas widths, preview, a page settings drawer, **Publish changes**, unpublish, revert to published, versions and restore.
- Editor: Layers, Blocks and Sections tabs, a canvas iframe with zoom and resizable width, drag and drop on the canvas and in the layers tree (a drop line or a smooth mode), a "+" between blocks with an insert picker, copy and paste, context menus, keyboard shortcuts, resizable panels.
- Inspector built from Payload's own inputs: text, rich text (Lexical), uploads, relationships, arrays, selects. Block props run Payload's `validate`, field hooks and field `access`.
- Inline editing on the canvas: text, textarea and rich text props, and images (replace from the library, upload, drop a file, alt text), in the default blocks and in your own components. `editableText()` and `editableImage()` mark elements that the automatic mapping cannot find.
- Styles panel: visual controls for layout, spacing, size, position, typography, background, border and effects that read and write Tailwind v4 classes, with breakpoints, states and a class box with autocomplete.
- CSS generation: the save hook compiles only the classes a layout uses, against the app's own Tailwind entry and plugins. The canvas compiles the same input in the browser. The generated rules match only block elements (`builder-css`).
- 16 default blocks with unlimited nesting: stack, grid, heading, text, rich text, image, video, button, link, menu, list, quote, divider, spacer, collection list and field. `defineBlock()` and `linkField()` for custom blocks, with icons, categories, slot rules and component classes.
- Existing Payload blocks: `fromPayloadBlocks()`, `convertPayloadBlocksLayout()` and `migrateBlocksField()` move a Payload `blocks` field into the builder.
- Theme global: colors, fonts (any Google Font, with metric-matched fallbacks), corner radius and spacing, written as CSS variables.
- Sections: ready-made block trees in the library, sections that editors save (`builder-sections` collection), and real thumbnails.
- Templates for collection documents: a templates collection, bindings from block props to document fields (one relationship hop), the Field block and the Collection list block.
- Animations per block (`block.motion`): entrance with stagger, hover, press, scroll and loop, with a Motion tab and preview.
- Localization: one shared layout with translated props, a locale switcher and translation marks.
- References: "Used in" join fields on media and delete protection for files that a layout still uses. `backfillReferences()` fills the field for existing documents.
- Multiplayer: one live session per document over Server-Sent Events, with presence and live edits from people and AI agents. Sessions live in one server process.
- AI assistant panel with adapters for OpenRouter, Cloudflare AI Gateway, Cloudflare Workers AI, OpenAI-compatible servers and Anthropic, plus a fake adapter for tests. Image generation with separate image adapters.
- MCP tools for `payload-mcp-toolkit` (`builderMcpTools()`): list blocks and sections, read and validate layouts, apply operations, insert sections, generate images, preview URLs, templates and binding sources.
- Layout validation against schemas built from the block fields. Broken layouts block every save. Unfinished blocks block only publishing.
- Tested core: layout operations with inverse operations, tree helpers, drop targets, class parsing.

### React renderer (`payload-canvas/react`)

- `RenderLayout` Server Component and the default block components.
- `payload-canvas/react/server`: `loadLayoutData`, `loadTemplate`, `loadTheme`, `ThemeStyle` and `createCanvasServer` (server components in the canvas).
- `payload-canvas/react/canvas`: `BuilderCanvas`, the runtime for the editor's canvas iframe, with inline text and image editing.
- `fromPayloadComponent(s)` to reuse existing block components, link resolution for link groups and rich text links, and the animation runtime on `motion` (loaded only on pages with animations).

### create-payload-canvas

- Scaffolds the starter app: copies it from a checkout or downloads it from GitHub, writes `.env` with a new `PAYLOAD_SECRET`, creates the Postgres database, installs dependencies and seeds demo content. Every question has a flag (`--yes` for no questions). `--packages <path>` packs `payload-canvas` from a local checkout. It never runs `payload migrate`.

### Packaging

- `payload-canvas` ships ESM JavaScript, `.d.ts` files and the admin `.scss` files in `dist/`, one output file per source file, with `'use client'` directives kept. Apps need no `transpilePackages` and no own `sass` install.
- Peer dependencies: `payload`, `@payloadcms/ui`, `@payloadcms/richtext-lexical` `^3.90.0`, `next` `^16.3.0`, `react` and `react-dom` `^19.2.0`, `tailwindcss` `^4.3.0`. Optional: `@anthropic-ai/sdk`, `payload-mcp-toolkit`, `zod`.
- Tested with a blank `create-payload-app` project (Payload 3.90.2, Next.js 16.3.3, React 19.2.6, Postgres) in `next dev` and `next build` + `next start`.

[0.1.0]: https://github.com/jon8800/payload-canvas/releases/tag/v0.1.0

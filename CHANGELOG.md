# Changelog

All notable changes to `payload-canvas` and `create-payload-canvas`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The packages use [semantic versioning](https://semver.org/). Before 1.0, a minor version can break the API.

## [Unreleased]

## [0.2.0] - 2026-10-16

### Added

- One source of truth for existing Payload blocks: when a collection's builder `field` is its own Payload `blocks` field, the builder edits that field itself. Canvas, Payload's editor, REST and the Local API read and write the same value, with Payload's hooks, validation, access, versions and locales. No second copy, no migration, no per-document switch. The round trip keeps every stored value. Data the field cannot hold (classes, animations, bindings, hidden blocks, other block types) is refused with a reason. See the README's "Using existing Payload blocks".
- `decodePayloadBlocks`, `encodePayloadBlocks`, `payloadBlocksProblems` and `payloadBlocksStorage` in `payload-canvas`.
- With a Payload blocks field, what Payload's hooks store shows in the builder after each save, and every live endpoint and MCP tool checks read access to the stored blocks and update access to the field.

- Whole-page editing with page regions: the collection option `regions` names document fields that the page shows outside the layout. The canvas shows the whole page through the app's page frame (`createCanvasServer({ frame })`, `siteRegion`, `LayoutOutlet`), and editors select a region, edit its text and images in place, and edit every field in the settings drawer at that field. Changes save to the document as the user, with field access, conflict checks, drafts, undo and redo. Regions are never dragged, duplicated or deleted. Sites without regions see no change.
- `GET {api}/builder/live/:collection/:id/regions` and `POST {api}/builder/live/:collection/:id/fields` (only for collections with regions).
- `saved` events list the other fields a save changed (`fields`).

### Changed

- New projects created by `create-payload-canvas` install `payload-canvas` 0.2.x.
- Custom implementations of the exported `SessionManager` interface must implement `currentDoc` and `withCurrentDoc`.

- `migrateBlocksField` is now only for sites that want builder-only features (classes, animations, bindings, templates): the README no longer tells sites to copy their blocks to edit them in the builder.

- The canvas route is a server page that imports the canvas server action and passes it to a small client component with `BuilderCanvas` (README, Install step 6). A `'use client'` page that imports the action leaves the client components of server-rendered blocks out of the route's client manifest in an installed package.

### Fixed

- Native Payload version restores update an open builder after the transaction commits. Revert and restore require access to the full source layout.
- Live streams check every intermediate edit with its original block ancestors and sibling values. Protected values cannot escape in a batch that later removes them. Published-only readers cannot receive live drafts.
- Live draft access is checked before each streamed event in both storage modes, including unsaved edits. Access checks use the document's current fields after every committed save, including saves that leave the layout unchanged. Failed refreshes refuse access.
- Publish and unpublish stop when saving pending edits fails. A queued save no longer creates an identical draft after publication. Startup updates inside `onInit` release the write gate correctly.
- Region undo records pending edits before saving, orders undo and redo requests, preserves retryable history, and restores a missing translation without copying its fallback. Reconnecting reloads region fields.
- Escape in drawer popups preserves the focus trap, including portalled row menus. Open drawers renew their protection; abandoned holders expire after Payload's lock duration.
- Page frames keep fallback content during retries, follow delayed layout outlets, select visible region copies, and discard stale renders after inline edits.

- Closing the builder's settings drawer right after an edit no longer loses it. Its Close button and Escape closed the form before autosave ran. With draft autosave, the drawer now saves the edit first, through the form's own autosave request (access, hooks, the write gate and the stale-form checks apply; it never publishes), and closes when that worked. A refused save keeps the drawer open with the input and the errors. Escape inside an open select menu, listbox, menu, dialog or popup in the drawer closes only that popup: Payload's modal provider closes the topmost modal on every Escape that reaches the document, so the drawer sends that Escape to the popup alone. Without autosave nothing changes: "Save draft" and Payload's "Leave without saving?" stay as they are.
- The Layers count groups digits in the browser's locale ("1,001 blocks").

- Payload blocks field: copied rows from another page or a saved section get new ids. A page keeps its own row ids through remove, save, undo and save. Duplicates within a page also get new ids.
- Payload blocks field: a cleared prop, a cleared block name and a value removed inside an array row are cleared in Payload too, instead of coming back from the stored value.
- Labels in the builder's settings drawer point at their inputs again. Payload names drawer labels with the edit depth (`field-title-2`) while several of its inputs keep `field-title`. Selects and relationships (react-select inputs) there get their field's label as their name, as in the inspector.
- A publish problem of a document field goes away when that field is saved (settings drawer, page region, rename). Problems of other fields and of blocks stay until the next publish checks them.

- Overlapping saves of one builder document no longer lose a change: a session save and a settings drawer autosave run one after the other (the write gate). A save that cannot get its turn fails with a 409 instead. `saved` events go out after the database committed the save, never after a rollback or a failed commit.
- Live endpoints pass the document id in the collection's id type (Payload's `parseDocumentID`), so Publish and the other actions work on databases with number ids. Collections with text ids keep text.

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

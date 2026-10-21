# Changelog

All notable changes to `payload-canvas` and `create-payload-canvas`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The packages use [semantic versioning](https://semver.org/). Before 1.0, a minor version can break the API.

## [Unreleased]

### Added

- Opt-in built-in blocks: `builtinBlocks({ include, icons })` in `payload-canvas/blocks` and `builtinComponents({ icons })` in `payload-canvas/react`. Leave a type out of `include` to replace it with your own block. See the README's "Built-in blocks".
- The **Icon** built-in (`icon`): one icon of the site's icon set. The definition takes the names as plain strings; the component map takes the icon components (`IconMap`). Decorative unless it has a `label`.
- The **Disclosure** and **Accordion** built-ins (`disclosure`, `accordion`): a native `<details>` with `summary` and `content` slots and a CSS height animation, and a list of them with an optional one-open-at-a-time mode. `faqItems(layout, blocks)` and `faqJsonLd(items)` build FAQPage JSON-LD from accordions with `faqSchema` on.
- The **Lightbox** built-in (`lightbox`): images in its slot open full screen in a native modal dialog, by click or keyboard, with arrow keys, an optional `group` across lightboxes and alt-text captions. Client component.
- The **Carousel** built-in (`carousel`): its `slides` slot as a scroll-snap track or fading slides, with arrows (optional `previous`/`next` slots for their content), dots, loop and autoplay with a pause button. Keyboard arrows on the track, slide labels, and reduced motion respected. Client component.

## [0.3.0] - 2026-10-21

### Added

- The **Repeat** block (`repeat`): repeats its `item` slot once per row of an array or hasMany field of the current document (`path`), for example FAQs, rates, a photo gallery, the services of a model or tags. `limit` and `offset` pick the rows. `collection` names the related collection, so `$url` links to each related document. Blocks in the item bind to the row's fields and to `$item` (the row value, for example an upload for an image). It works in templates, inside collection list items and inside other repeats. On the canvas the first row is editable and the other rows are repeats. Without a current document the site shows nothing. After `loadLayoutData`, a repeat outside list items carries its rows as `$items`. See the README's "Repeat the rows of a field".
- Item bindings in collection lists and repeats: `$index` (the item number from 1), `$parent.<path>` (the enclosing document) and `$page.<path>` (the page's own document).
- Binding expressions: fallback chains (`heading|name`), formatters (`publishedAt|date:en-AU:Australia/Brisbane`, `price|currency:AUD`, `price|number`, `bio|firstSentence`) and template strings (`"Enquire about {{name}}"`). See the README's "Binding syntax".
- Conditional blocks: the `$visible` binding key shows a block only when its condition holds: `"field"` (filled), `"!field"` (empty), `"field=value"`, `"field!=value"`. A hidden block renders nothing on the site and shows dimmed on the canvas.
- Collection list `queryFilters`: `{ param: { value: where } }` filters by the page's URL query. Pass it as the new `loadLayoutData` option `query` (`URLSearchParams` or a Next.js `searchParams` object). Values of one param are OR-ed, params are AND-ed. The canvas shows lists without these filters. Routes should send `noindex, follow` for filtered URLs.
- Date tokens in a list's `where` and `queryFilters`: `$now`, `$now-30d`, `$now+12h`.
- Collection list `offset`, `depth` (`1` or `2`) and an `empty` slot that shows when no document matches.
- `image`: `priority` (loads eagerly with `fetchpriority="high"`) and `sizes`. The media focal point sets `object-position`.
- `heading`: `accent` words render as `<em>`.
- `stack` `as`: `ol`, `ul`, `li`, `dl`, `dt`, `dd`, `figure`, `figcaption`, `p` and `span`.
- In `payload-canvas/core`: `bindingValue` with expressions, `bindingPaths`, `isVisible`, `BINDING_FORMATTERS`, `repeatRows`, `repeatRowContext`, `listItemContext`, `itemSources`, `scopeSources` and `repeatAncestors`. In `payload-canvas/react`: `withDateTokens` and the `ListQueryParams` type.
- Binding checks, the outline and the inspector read the row's fields inside a repeat and offer `$item`, `$index`, `$parent` and `$page`. The inspector shows an expression binding with a preview of its value.

### Changed

- `TemplateContext` has the optional fields `item`, `index`, `parent` and `page` for list and repeat items.

0.2.2 was never released. Its Field list block is the Repeat block here.

## [0.2.1] - 2026-10-21

### Added

- Collection list filters. `filterField` lists only documents related to the current document (the one a template renders). `filterBy` says how: `current` (default) lists documents whose field holds the current document, `shared` lists documents that share a value of the field with the current document, and `linked` lists the documents the current document's field points to. With `shared` or `linked` and no values, the list is empty. On a normal page the filter is ignored. `where` adds a static Payload `where` query. The site, server blocks and the canvas preview of a template build the same query (`listQueries`). See the README's "Filter a collection list".
- `defineSection()` in `payload-canvas` and `payload-canvas/blocks`: write sections without block ids. It fills each missing id as `<section id>_1`, `_2`, … and throws on a missing `id` or `label` or a repeated block id. Input type: `SectionInput`.

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
- Builder collections disable bulk editing and reject bulk updates (`where`) with 403 or 409. Update each document by ID so every save uses the write gate. This also prevents bulk publish, unpublish, trash changes and folder moves. Use the document's Edit view for those actions. Payload's bulk update reads documents before their individual save hooks, which could overwrite concurrent edits.
- Custom implementations of the exported `SessionManager` interface must implement `currentDoc`, `withCurrentDoc` and `resetFor`. Live document ids now accept `string | number`; `sessionTargetOf` still supports callers that supply only `collections`.

- `migrateBlocksField` is now only for sites that want builder-only features (classes, animations, bindings, templates): the README no longer tells sites to copy their blocks to edit them in the builder.

- The canvas route is a server page that imports the canvas server action and passes it to a small client component with `BuilderCanvas` (README, Install step 6). A `'use client'` page that imports the action leaves the client components of server-rendered blocks out of the route's client manifest in an installed package.

### Fixed

- Native Payload version restores update an open builder after the transaction commits. Revert and restore require access to the full source layout.
- Failed builder restores and Revert keep the previous saved or unsaved state. A refused action on a saved page creates no draft. Nested template saves keep each document's save sequence and hook changes separate.
- Flush waits for a committed save's field-hook changes to reach the live session. Until then, other guarded JSON saves return 409 instead of overwriting those changes. Background saves resume after the changes apply.
- Restore and Revert pause background saves and layout sync through their save or rollback. Concurrent actions run in order, and flush waits for the action. Other JSON document saves during the action return 409 and can be retried after it finishes. Committed outside edits survive failed actions. Pending outside sync retries after read failures and discards reads older than a newer outside save.
- Live streams check every intermediate edit with its original block ancestors and sibling values. Protected values cannot escape in a batch that later removes them. Published-only readers cannot receive live drafts.
- Live draft access is checked before each streamed event in both storage modes, including unsaved edits. Access checks use the document's current fields after every committed save, including saves that leave the layout unchanged. Failed refreshes refuse access.
- Publish and unpublish stop when saving pending edits fails. A queued save no longer creates an identical draft after publication. Startup updates inside `onInit` release the write gate correctly.
- The write gate installs database signals and tracks failed Local API calls during adapter initialization, before `onInit` or data migrations. Repeated updates with separate requests in one transaction share that transaction's gate.
- Region undo records pending edits before saving, orders undo and redo requests, preserves retryable history, and restores a missing translation without copying its fallback. Reconnecting reloads region fields.
- Re-entering region text before its saved frame arrives uses the latest edit. Queued image changes use the preceding save as their base. Undo and redo buttons work while a field save runs, and retryable undo survives a newer edit.
- Escape in drawer popups preserves the focus trap, including portalled row menus. Open drawers renew their protection; abandoned holders expire after Payload's lock duration.
- Page frames keep fallback content during retries, follow delayed layout outlets, select visible region copies, and discard stale renders after inline edits.

- Closing the builder's settings drawer right after an edit no longer loses it. Its Close button and Escape closed the form before autosave ran. With draft autosave, the drawer now saves the edit first, through the form's own autosave request (access, hooks, the write gate and the stale-form checks apply; it never publishes), and closes when that worked. A refused save keeps the drawer open with the input and the errors. Escape inside an open select menu, listbox, menu, dialog or popup in the drawer closes only that popup: Payload's modal provider closes the topmost modal on every Escape that reaches the document, so the drawer sends that Escape to the popup alone. Without autosave nothing changes: "Save draft" and Payload's "Leave without saving?" stay as they are.
- The Layers count groups digits in the browser's locale ("1,001 blocks").

- Payload blocks field: copied rows from another page or a saved section get new ids. A page keeps its own row ids through remove, save, undo and save. Duplicates within a page also get new ids.
- Payload blocks field: a cleared prop, a cleared block name and a value removed inside an array row are cleared in Payload too, instead of coming back from the stored value.
- Payload blocks field: named tabs enforce their read access, and unnamed groups preserve field clearing and copied row-id protection.
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

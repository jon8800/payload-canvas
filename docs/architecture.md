# Architecture: website builder plugin for Payload

Status: draft for review, 2026-10-03.

## 1. Goal

A Payload CMS plugin that adds website building to any Payload project:

- A visual drag-drop page builder with a real canvas, for any collection the developer lists.
- Atomic layout blocks (heading, text, image, stack, grid, …) that nest without limit. Developers can add their own blocks.
- Tailwind classes as the style format, with visual controls for the main CSS properties.
- Templates for collection documents (for example a Post template), with block props bound to document fields.
- AI agents build and edit pages through MCP. A person with the page open sees each AI change as it happens.
- Later: multiplayer editing and presence.

## 2. Decisions made

| Decision | Choice |
|---|---|
| Product shape | Plugin first. The starter app becomes a reference app that installs the plugin. |
| Editor | Our own, native to Payload. No third-party editor library (no Puck). We borrow good ideas only. |
| Dependencies | As few as possible. Drag-drop uses dnd-kit — the copy `@payloadcms/ui` already ships. |
| Style format | Tailwind classes per block. Visual controls for the main CSS properties read and write classes. A raw class field covers the rest. |
| Frontend | Headless data plus an optional default React renderer. Users can replace any block component. |
| AI | Builder tools added to `payload-mcp-toolkit` through its `customTools` option. |
| Admin UI | Payload's own UI components and CSS variables, Base UI primitives where Payload has none, SCSS. Kept in a thin layer so Payload 4 changes stay cheap. |

## 3. Packages

```
packages/
  builder/           # the Payload plugin: config, fields, hooks, endpoints, admin editor
  builder-react/     # default block components and the layout renderer (no Payload imports)
  create-payload-starter/
  shared/
apps/
  starter/           # reference app and dev host for the plugin
```

Package names are placeholders until we pick the public name.

`builder` has three entry points: `.` (server config), `./client` (admin components), `./rsc` (server components for the admin).

## 4. Plugin config

```ts
websiteBuilder({
  collections: {
    pages: { field: 'layout', url: (doc) => `/${doc.slug}` },
    posts: { templates: true, url: (doc) => `/blog/${doc.slug}` },
  },
  blocks: [...defaultBlocks, PricingTable],   // the developer adds their own
  css: './src/app/(frontend)/globals.css',    // the Tailwind entry file to compile against
  theme: true,                                // adds the Theme global
  mcp: true,                                  // exports builder tools for payload-mcp-toolkit
})
```

For each listed collection, the plugin:

- Adds the layout field (a `json` field, name configurable), unless the developer placed it already with the exported `layoutField()` helper. The helper lets the field live inside tabs or groups.
- Adds the full-screen builder view (once) and a document tab that links to it.
- Adds the hooks that validate the layout and generate CSS on save.
- Sets live preview to the `url` function.

The `url` function is the one place that maps a document to its frontend path. Preview, sitemap, link fields and revalidation all use it. No route prefix is hardcoded in the plugin.

## 5. Data model

One `json` field holds the whole layout tree:

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "b_8f2k",
      "type": "stack",
      "className": "flex flex-col gap-6 md:flex-row",
      "slots": {
        "children": [
          {
            "id": "b_9a1c",
            "type": "heading",
            "props": { "text": "Hello", "level": "2" },
            "className": "text-4xl font-bold",
            "bindings": { "text": "title" }
          }
        ]
      }
    }
  ]
}
```

A block is `{ id, type, props?, className?, slots?, bindings?, hidden?, label?, locales?, motion? }`. `motion` holds the block's animations (section 8, "Motion").

- `id` is stable. Selection, AI edits and bindings use the `id`, never an array index.
- `props` holds the block's own field values. `slots` holds child blocks by slot name, with no depth limit. Keeping them apart makes the tree easy to walk.
- Relationship and upload props store IDs. The renderer loads them (section 10).
- `version` lets us migrate the format later. Small shape changes of built-in blocks are migrated by `normalizeLayout` on load instead (for example old lists with a `props.items` array become `listItem` blocks; see `core/textList.ts`).
- A block type may name its `parents`: it then goes only directly inside those types. A list item goes only in a list.
- The layout is validated on save against the JSON Schema of each block (section 6).

Why one JSON field instead of a Payload `blocks` field: unlimited nesting with no depth copies or `container_1` slugs, small form state, and edits that are plain JSON operations. That makes AI edits, undo and multiplayer simple. The trade-off: Payload no longer validates or populates block props for us, and runs no field logic inside the JSON. The plugin does that (section 6, "Field logic of block props").

**References.** Payload cannot see the IDs inside the JSON, so the plugin keeps them in a hidden field as well (`plugin/references.ts`, `core/references.ts`):

- `builderRefs` is a polymorphic `relationship` field with `hasMany` on every builder collection, the templates collection and saved sections. Its `relationTo` comes from the block definitions: upload and relationship fields, link fields, and the upload collections when a block has rich text.
- `collectReferences(layout, blocks)` (pure, tested) walks the layout along the field configs and returns `{ relationTo, value }[]` without duplicates. It reads nested slots, hidden blocks, groups, arrays, blocks fields, named tabs, link groups of type "reference" and Lexical upload, relationship and internal link nodes. Bindings have no fixed ID, so they add nothing.
- A `beforeChange` hook runs after the layout hook, so it sees the layout the session guard put in. Every write path goes through it: session drafts, publish, Edit view, REST, Local API. It checks only new IDs against the database (one query per collection), because a dangling ID would break the save on the foreign key. Unchanged lists cost no query.
- "Used in": the referenced upload collections get one `join` field per builder collection, `on: 'builderRefs'`. Payload 3.90 supports a single-collection join on a polymorphic `hasMany` field. A multi-collection join (`collection: [...]`) does not work here: it needs the `on` field as a column of the main table, and a `hasMany` field lives in the `_rels` table. The admin reads with `draft: true`, so the joins show the latest drafts.
- Delete protection: a `beforeDelete` hook on the protected collections queries the published documents and the latest drafts. It throws a public `APIError` (409), which the edit view and the bulk delete show as a toast. `context.builderForceDelete` skips it.
- Backfill: `backfillReferences(payload)` writes only the field with `payload.db.updateOne` / `updateVersion` (`updatedAt: null` keeps the timestamp). No hooks, no new versions.
- Population: the renderer already loads upload and relationship props with one `find` per collection (`loadLayoutData`). Populating `builderRefs` instead would also cost one query per collection (Payload's dataloader batches by collection), so the renderer does not use it.

**Localization** (README: "Localization"). With Payload `localization` on, one layout serves every locale (the Webflow model): blocks, order, slots, classes, bindings and props that are not localized are shared. A prop is localized when its field config says `localized: true` (a group or array that holds one is localized as a whole).

- **Storage.** `props` holds the default locale. `block.locales[code]` holds another locale's own values, only of localized props, in canonical form (no empty objects). Old layouts need no migration: their values are the default locale.
- **Why a `locales` map per block, not `{ en, de }` inside each prop:** every reader of `props` (renderer, validation, inspector, bindings, references) keeps working on one locale's view, and a prop value is never ambiguous (a JSON prop can be any object). An `update` carries `locale` and touches only that locale's values, so two people translating different languages never overwrite each other (last write wins per prop and locale), and its inverse names the same locale, so undo stays exact and per person. Structure operations are untouched; `insert`/`remove` carry the whole block, translations included.
- **New content in another locale.** An `insert` may carry `locale`: its blocks are new content written in that locale. `localizeOperations` moves their localized props (children included) into `locales[locale]` and drops `locale` (`blockInLocale`), so the default locale has no value until someone writes it; required props then block Publish with "(EN)" in the message (`describeLayoutErrors(…, { localization })`). A block that already has `locales` is the stored form and stays as it is. The editor stamps inserts only for new blocks (`apply(…, { newContent: true })`: Add panel, "+", list item split); paste, duplicate and sections keep their own data. MCP `applyOperations` and the assistant stamp inserts (`stampLocale(…, { inserts: true })`), `insertSection` does not. `mergeLocaleView` treats a new block of a save in another locale the same way.
- **Pure core** (`core/locale.ts`, tested): `resolveLayoutLocale` (Payload's afterRead rule: own value, else the `fallbackLocale` chain; text and textarea fall back when empty; blocks without changes keep their identity), `createLocaleView` (cached per block object, for the editor), `localizeOperations` (the editor and the session run it on every batch: unknown locale refused, default locale dropped, props that are not localized moved to an operation without `locale`), `mergeLocaleView` (a save of one locale's view: localized props go to that locale, other locales stay, a value equal to the fallback the reader saw stays a fallback), `eachLocalePass` (field hooks, `validate` and `access` run once per locale with own values, on that locale's view, with `req.locale` set).
- **Reads.** The layout field's `afterRead` hook returns the view of `req.locale` with `req.fallbackLocale`; `locale=all`, `RAW_LAYOUT_CONTEXT` and the live session's load (`ALL_LOCALES_CONTEXT`) get the stored form. Payload gives the save hook `originalDoc` as one locale's view, so localized collections read the stored layout with `getLatestCollectionVersion` (one query per save).
- **Saves.** API saves with a locale go through `mergeLocaleView`; the session's saves, guarded saves, Revert and Restore (`STORED_LAYOUT_CONTEXT`) send the stored form. `validateLayout(layout, blocks, { localization })` checks each locale's own values; `required` applies to the default locale, and to another locale only without fallback. Errors carry `locale`; readable messages end with "(DE)".
- **Editor.** The store keeps `layout` (stored) and `view` (the editor's locale) and stamps prop updates with the locale. The canvas gets `view`. Awareness carries the locale. The inspector marks "Not translated", "Translated" and "Missing in English" (`missingDefaultKeys`: the default locale is empty while another locale has a value).
- **Canvas.** The admin sends `{ type: 'locale' }` before `init` and on every switch. The canvas loads related documents and collection lists over REST with `locale` (cache keys include it), passes it to the canvas server action as `scope.locale` (`loadLayoutData`, the template's document and the `pageData` loader get it; unknown codes become the default), and the server blocks' keys change with the scope, so they render again. The admin loads the template's preview document with the locale too.
- **Migration.** `migrateBlocksField` reads with `locale: 'all'` when the source field or a field inside its blocks is localized, converts each locale with the same converter and merges: structure and `props` from the default locale, localized props of other locales into `locales`. A fully localized `blocks` field matches other locales' blocks by id, then by position and type; unmatched blocks are reported.
- **Not yet:** a separate layout per locale (`localized: true` on the whole field), classes per locale.

## 6. Block contract

```ts
export const Heading = defineBlock({
  type: 'heading',
  label: 'Heading',
  fields: [                                   // Payload field configs
    { name: 'text', type: 'text', required: true },
    { name: 'level', type: 'select', options: ['1', '2', '3', '4', '5', '6'], defaultValue: '2' },
  ],
  slots: {},                                  // e.g. { children: { allow: ['*'] } }
  styles: true,                               // adds className and the style controls
  ai: {
    description: 'A section or page heading.',
    example: { props: { text: 'Our services', level: '2' }, className: 'text-3xl font-semibold' },
  },
})
```

- **Props are declared with Payload field configs.** From one declaration the plugin generates the inspector controls, a JSON Schema (for validation and for AI tools), and TypeScript types.
- **Slots** declare where children go and which block types each slot accepts.
- The React component is registered separately, in `builder-react` or in the app. The config stays server-safe.

**Field logic of block props** (README: "Validation, hooks and access on block fields"). Payload runs `validate`, `hooks` and `access` only for fields it knows, so the plugin runs them for block props with Payload's arguments (`core/fieldSemantics.ts` walks props like Payload walks fields: groups, named tabs, rows, collapsibles, arrays and `blocks` fields inside props; pure runners in `core/fieldHooks.ts`, `core/fieldValidate.ts`, `core/fieldAccess.ts`, unit tested).

- **Registry.** `captureFieldSemantics(blocks)` reads the functions when the plugin starts. Payload's config sanitizing later changes the same field objects in place (default validators, rich text editor hooks), and `fromPayloadBlocks` blocks share their objects with `config.blocks`. The registry is a WeakMap from field object to its functions, plus the block types that have each kind. It is passed to the hooks and endpoints, and stored server-only on `config.custom` for the MCP tools.
- **Save hook order** (`plugin/hook.ts`, collection `beforeChange`): session guard, stale-save check, field access (only for saves that are not the session's own and not guarded), `beforeValidate` hooks, `beforeChange` hooks, then `validateLayout` plus the `validate` functions (only when publishing: their messages are publish-only, so drafts skip the cost), then CSS. `afterChange` hooks run in the collection `afterChange` hook and change only the returned document. `afterRead` hooks and `access.read` run in a field `afterRead` hook on the layout field, so every read gets them (REST, GraphQL, Local API, versions, the session load). The plugin's own reads that feed a save (Revert, Restore, the legacy values at Publish) set `RAW_LAYOUT_CONTEXT` and get the stored layout.
- **Hard or publish only.** Every message a field produces can be true mid-typing, so all are publish-only: `required`, `format`, `constraint` (lengths, ranges, row counts, email; these were hard errors before and refused live commits mid-typing) and `validate`. Only `invalid` (shape and type) blocks every save.
- **`overrideAccess`.** Collection hooks do not get it. A field `beforeValidate` hook on the layout field records it in `context`; field access applies only when it is false.
- **Access on live edits.** Each commit runs `access.update` (or `create`) for the props the batch changes, as the committing user, before anything changes; a refused batch gets 403 and one sentence. A new block may hold such a prop only empty, at its default, or as a value the page already has (duplicate, paste). The session's own saves and guarded saves are not checked again: the session layout holds edits of several people and is saved as the last committer. `access.read` is not applied inside the shared session; it applies to the API.
- **Access in the editor.** `propAccessInfo` (`core/fieldAccess.ts`, pure, tested) runs `access.read` and `access.update` of every block prop for one user and returns prop paths without row indexes that the user may not read or change: one rule per block type (a new block, checked with empty props and one empty row per array) and one per block whose data changes the answer. A path counts as refused when any row refuses it. `loadDocMeta` adds it as `meta.fieldAccess`, checked against the open session's layout, else the stored draft (`live/document.ts`); `GET {live}/:collection/:id/access` returns it again. `propAccessFor` (`live/fieldChecks.ts`) caches each block's answer for 30 s per user, document and block data. The editor asks again 800 ms after a change to blocks of types with access rules (`admin/editor/fields/access.tsx`). The inspector leaves out unreadable fields (their values stay in the props, so edits never drop them) and wraps read-only fields in an inert frame with a lock. The inline start check (`refuseLockedInline` in `admin/editor/inline.ts`) stops a canvas edit of such a prop at once and says why; late values are dropped.
  - Decision: no masking of unreadable values in the shared session or the canvas. The session sends one layout to every editor (commits, rebasing and undo need the same data everywhere), and the canvas previews what the site renders. Filtering per user would need per-user operations and would break both. So `access.read` hides a prop in the inspector only; the README says it is not a secret boundary inside the builder.
- **Inspector.** Validators may need `req`, the database or the whole document, so they never run in the browser. `POST {live}/:collection/:id/validate` runs them for one block (`event: 'onChange'`); the inspector calls it 500 ms after a change, only for types in `config.validateTypes`.

**Existing Payload blocks** (README: "Using existing Payload blocks"). A site with a Payload `blocks` field keeps its block configs, its components and its content:

- `fromPayloadBlocks(configs, options)` (`blocks/payload.ts`, client-safe) makes one definition per Payload block, inline nested blocks and referenced blocks included. Fields stay Payload field configs. A nested `blocks` field at the block's own data level (also in rows, collapsibles, unnamed tabs) becomes a slot of that name; its blocks and `blockReferences` become `allow`, its `maxRows`/`minRows` the slot's `max`/`min` (`placementError` refuses a block for a full slot, so operations, drop targets, the "+" picker and paste follow it; `validateLayout` reports both as publish-only `constraint`). With `root`, the other blocks get `parents` (the blocks that take them). `prefix` renames the types; `definition.payload.slug` keeps the Payload slug, so data and components still use `blockType`.
- `admin.condition` functions that test one sibling field become `admin.custom.builderCondition` (`core/conditions.ts` reads the function's source; minified code works). Conditions have `equals`, `notEquals` or `truthy`. The inspector hides the field, and `validateLayout` skips the required check of a hidden field, as Payload does. Custom admin components, other conditions and blocks fields inside groups or arrays are reported with `onWarning`.
- `convertPayloadBlocksLayout(value, blocks)` (`core/convertPayload.ts`, pure, tested) turns `[{ id, blockType, blockName, ...fields }]` into a layout: slot fields become slots recursively, `blockName` becomes `label`, `null` values and fields without a definition are left out, populated references become IDs, and the result goes through `normalizeLayout`. A builder layout converts to itself. `toPayloadBlock` is the reverse, for components.
- `migrateBlocksField(payload, { collection, from, to })` (`migrate/`) converts each document and each version in place through the adapter's `updateOne` / `updateVersion`, writing only the builder field and its CSS. The Local API cannot do this safely: `payload.update` on a document with a newer draft makes the published data the latest version again. Then it runs `backfillReferences`. Dry run by default; idempotent.
- `legacyFields` (collection option): while the old field stays, Publish in the builder reads the main (published) document and sends the legacy fields' published values with `_status: 'published'`, so a newer draft of the old field does not go live. Never published: nothing to keep, the draft value goes live. The old field's newer draft stays in the version history only. Publishing from the Edit view or REST is unchanged.
- `fromPayloadComponent(s)` (`builder-react/src/render/payload.tsx`) gives a Payload-shaped component its old props, with each slot as a nested Payload-shaped array plus a `builder` prop with the rendered slots. In the canvas `PayloadRoot` puts the editor attributes on the component's first element. It adds no element: a React fragment ref (`observeUsing`, React 19.3+; older React gets the old wrapper) reports the elements directly inside it as React adds and removes them. (An earlier `display: contents` wrapper broke container rules like `space-y-*` and `divide-y`, which select direct children.) Children that the component renders itself have no block ids, so the canvas can select only the block itself; `PayloadSlot` renders a slot with the builder instead, so its children are editable on the canvas too.
  - `props: (block, context, builder) => props` maps the props for components written as `({ block, context })`. `context` is the page data (section 10). Its components are marked to receive the page data (`withPageData`, a WeakSet in `render/marks.ts`); others never get it, so client components do not carry it in the RSC payload.
  - An async `Component`, or `render: 'server'`, marks the block to render on the server in the canvas (section 7, "Server-rendered blocks").
- Dev fixture: `apps/starter/src/legacy-fixture/` (`NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1`): a `legacy-pages` collection, copied block configs, components, seed, migrate and cleanup scripts, and `/legacy-demo/:slug`. `server.tsx` holds async server components that query Payload (Latest Posts, a Posts Section with a `PayloadSlot`) and the page data loader; `PageFacts` is a `{ block, context }` component. The new components list no `classes` (the site's CSS has them). The older ones still have lists from before the generated CSS was scoped (section 8); they are no longer needed and only add a few rules.

## 7. The editor

The editor is a full-screen root admin view at `{admin}/builder/:collection/:id`. Payload keeps doing access control, drafts, versions and hooks. We do not fork Payload's edit view and we do not import Payload internals.

**How it mounts.**

- `websiteBuilder()` registers one root view (`admin.components.views.websiteBuilder`, path `/builder/:collection/:id`). Payload renders root views with three path segments without its template, so there is no nav and no header. The view is a server component (`@payload-toolkit/builder/rsc#BuilderView`). Payload does not check the session for custom root views, so the view does: login redirect, admin access, 404 for unknown documents and non-builder collections, read-only users to the Edit view.
- The editor needs no Payload `Form`. The document's live session (section 12) loads the draft and saves the layout. The editor never uses `useField`, `useDocumentInfo` or `RenderFields`.
- The top bar shows the document from `GET {live}/:collection/:id/meta` (loaded on the server for the first render). The live stream's `saved` and `published` events keep it current for every editor.
- The document's other fields (title, slug, SEO, a template's collection) open in Payload's document drawer (`useDocumentDrawer`, "Page settings"). The drawer's saves go through the save-hook guard, so they never overwrite the session's layout. The drawer hides Payload's Publish button (the plugin's `edit.PublishButton` renders nothing when the drawer slug matches the builder's settings drawer) and its "…" menu (`disableActions`); it saves by autosave or "Save draft".
- Publish, Unpublish and Revert are plugin endpoints (`{live}/:collection/:id/publish|unpublish|revert`). They call Payload's Local API as the user. Publish first saves the session's unsaved commits. Revert resets the session to the published layout and sends every editor a `session` event with `reset: true`; editors drop their unsent changes and their undo history.
- Payload's Versions, Version (compare) and API screens open in a drawer over the builder (`admin/editor/topbar/screens/`). Payload renders them through its public `renderDocument` server function with `paramsOverride` set to the screen's path, the same call its document drawer uses. The screens navigate with Next's router; inside the drawer a small router (Next's router contexts, the only Next internals the plugin imports) keeps every navigation in the drawer. Restore is a plugin endpoint (`{live}/:collection/:id/restore`) that works like Revert: it resets the session to the version's layout, then restores with the Local API (as a draft when the collection has drafts). The drawer hides Payload's own Restore button, which would bypass the session.
- The left sidebar has three full-height tabs: Layers (the outline tree), Blocks and Sections (`admin/editor/layout/LeftPanel.tsx`). Panels stay mounted once opened, so a library item dragged across a tab change stays registered with dnd-kit. A drag that rests on the Layers tab opens it, and the smooth drag mode measures the tree again (`remeasureOutline`).
- The sidebars are resizable. Sizes are CSS variables on the editor root, written on each animation frame of a drag (no React render) and kept in local storage (`admin/editor/layout/`).
- The document's "Builder" tab is a link to the view. The tab's own path (`…/:id/builder`) redirects there. In the Edit view the layout field shows a block summary and an "Open builder" button.
- The plugin adds the layout field at the top level and runs last. Plugins like SEO with `tabbedUI` move fields into tabs.

```
┌─────────────────────────────────────────────────────────────────┐
│ Top bar: back · Collection › Title · status │ undo · width │ … │
├──────────────┬───────────────────────────────┬──────────────────┤
│ Layers |     │ Canvas (iframe + overlay)     │ Inspector        │
│ Blocks |     │                               │ Block | Assistant│
│ Sections     │                               │ Content / Styles │
│ (one tab)    │                               │                  │
└──────────────┴───────────────────────────────┴──────────────────┘
```

**Editor store (client).** One store holds the layout tree, the selection, the hover state and the undo history. It is a small external store read with `useSyncExternalStore`, so only the parts that change re-render. Every change goes through the operations module (section 12).

**Undo.** Every operation returns its inverse operation. Undo applies the inverse of the user's own last operation. This way undo never reverts edits that came from an AI agent or another user. (The canvas prototype stored whole layouts. That is simpler, but it would undo other people's changes.)

What counts as one undo step (edits with the same `mergeKey` merge, an edit with `group` merges until another group starts):

- **Inline list editing on the canvas:** typing, Enter (a new item) and Backspace (joining items) form one step, from the first key until editing ends. One Ctrl+Z undoes the whole run, and redo restores it (`inline.ts`).
- **Inspector fields:** one step for each field. A new step starts after a 1 s pause, or when focus leaves the field. Two fields never merge, not even two fields of one array row (`fields/undoPath.ts` builds the key from the field path).
- **Ctrl+Z and Ctrl+Shift+Z in an inspector input** run the editor's undo and redo, not the browser's own text undo. The browser's undo would not know about the layout, and the two histories would drift apart.
- **One assistant turn** is one step (`group`). Sliders (Motion tab, Styles) use one merge key for each slider, so one drag is one step.

**Sync.** The store's edits go through the sync engine to the live session (section 12). There is no second copy of the layout in a Payload form, so there is nothing to keep in step.

**Canvas.**

- A same-origin iframe loads a plugin route that renders the layout with the real block components. The admin sends the layout to the iframe over `postMessage`, so a change shows at once, with no database write and no server round trip.
- Each block element carries `data-block-id`. A small script in the iframe measures block rectangles (`ResizeObserver` plus scroll events) and sends them to the admin.
- The admin draws an **overlay layer** on top of the iframe: hover outline, selection box, block name label, action bar (move, duplicate, delete, add), and drop indicators. The overlay lives in the admin, so it uses Payload's UI and never mixes with the site's CSS.
- **Drag-drop** uses dnd-kit in the admin. Drop targets come from the measured rectangles and the slot rules, with a custom collision function: before or after a block, or inside an empty slot. The same drag system covers the outline tree and the block library, so you can drag from the library onto the canvas.
  - The iframe gets `pointer-events: none` from `onDragPending`, before the drag starts. Otherwise the iframe swallows pointer moves and dnd-kit never sees them.
  - The iframe also reports each slot's rectangle and axis (from computed flex direction or grid columns). Without them, grids and horizontal rows get the wrong drop side.
  - A 12 px band at a container's edge drops before or after the container itself.
  - Slot rules (which block types a slot accepts) are checked in the drop-target functions, not in the operations module.
  - Auto-scroll runs on a timer while the pointer holds still at the canvas edge.
- The iframe repeats its "ready" message until it receives a layout. This avoids a race on reload.
- `DndContext` gets `id={useId()}` to avoid a hydration mismatch.
- Device sizes resize the iframe. **Fluid** (the default) fills the free space at 100 %, so the canvas shows the breakpoint of the space the sidebars leave and follows it live while panels or the window resize. Desktop (1280 px), tablet, mobile and a custom width are fixed; a frame wider than the stage zooms out to fit. Handles on the frame's edges resize it (`layout/FrameResize.tsx`): the drag writes the width to the DOM on each animation frame and commits a custom width on pointer up. The stage scrolls sideways only when the zoomed frame is wider than the stage (`data-scroll`); otherwise it clips, because the scaled frame is wider for a moment while the zoom eases. The toolbar and status bar show the breakpoint the frame width gives. The Styles panel picks the breakpoint it edits on its own; it marks values that a larger breakpoint overrides at the current width.
- **Insert between blocks.** Hovering the canvas shows a "+" on the edge nearest the pointer, between two blocks, or in the middle of an empty slot (`admin/editor/insert/spots.ts`, pure). The canvas script already reports the pointer, so the admin computes the spot from the measured rects and the slot rules, and stores it only when it changes. A click opens a picker (blocks and sections that fit, by `slotAcceptsAt`) that inserts at that position. Hidden while dragging and while editing text inline.
- Inline text editing: double-click text on the canvas (or press Enter on a selected block) to edit it in place. Components mark text elements with `editableText(mode, path)`. Plain text is a `contenteditable` element. Rich text loads a small Lexical editor (the same version as Payload, with Payload-compatible link nodes) and a floating toolbar, only when editing starts. One editing session is one undo step (`mergeWithin`). Edits go through the normal operations, so collaborators see the typing live.
- **Server-rendered blocks.** Components that load data are async server components that import Payload and the config (model grids, review carousels on the owner's sites), so the client canvas cannot import them. The app adds a server action to the canvas route, made with `createCanvasServer` (`builder-react/src/render/canvasServer.tsx`), and passes it to `BuilderCanvas` as `server`.
  - Which blocks: a type with a definition but no component in the canvas map, an async component, or one marked `renderOnServer` (`canvas/serverComponents.ts`). They render as `ServerBlock` (`canvas/ServerBlock.tsx`).
  - `ServerBlock` sends the stored block with its children (IDs, not loaded documents) and the scope (`CanvasInit.document`, the template's sample document) to the store (`canvas/serverBlocks.ts`). The store keys results by the scope plus the JSON of the stored subtree (cached per block object, which `shareStructure` keeps stable). It asks 250 ms after the last change (at most 1 s after the first), in one batch: Next runs server actions one at a time per client. Keys that no mounted block wants any more (typed past) are never sent. Results stay in an LRU of 200, so undo is instant.
  - The action checks for a signed-in user of the admin collection, loads the data with `loadLayoutData` (latest drafts, the user's access for lists, bindings against the sample document), and renders each block with the site's server map through `renderPreviewBlock` (`RenderLayout.tsx`). The result is React Server Component output, not HTML: client components inside it run in the canvas, and React reconciles a new result with the old one, so the DOM (and an inline edit in a child) survives an update.
  - Slots: the preview renders each slot as `<SlotOutlet name>` (a client component, `render/SlotOutlet.tsx`), and the slot containers get the editor's slot attributes. `ServerBlock` provides the slots the canvas rendered through a context, so children rendered with `PayloadSlot` or `slots` stay live client blocks: selectable, draggable, inline-editable, updated with no request. Children a component renders itself render on the server and are not selectable on the canvas. The key holds the children, so a child change refetches the parent; the old output stays meanwhile. Trade-off chosen over "atomic" server blocks (children editable only in the outline): live children cost nothing extra, and the refetch is debounced and hidden. Static HTML was rejected: React would not own it, client components inside would not run, and slots could not hold live React children.
  - Display: a gray box with the block name until the first result; later results swap in a transition (the old output stays while the new one suspends), and `data-builder-loading` dims the block only after 300 ms. `PayloadRoot` puts the editor attributes on the output's first element. An error boundary per block shows "the preview failed" without breaking the canvas. After new content, the canvas observes and measures again (`onRendered`).
  - Page data: the action's `pageData` loader runs once when the canvas opens (the canvas waits for it before the first render) and on every server render. The canvas passes it to `RenderLayout` as `pageData`.
  - Thumbnails use the same store without debounce and wait for it (`idle()`, at most 10 s) before the picture.
  - Why not a block `load()` that passes data to a client component: it needs every data component split into a loader and a client-safe view, a rewrite of the developer's code.
- Drag modes: `editor.dragMode` is `'indicator'` (a drop line, the default) or `'smooth'`; the user can switch in the status bar (kept in localStorage). In smooth mode the target still comes from `core/dropTarget.ts`, using the rects measured at drag start. `dnd/displace.ts` computes how far each sibling moves; the canvas applies those moves as CSS transforms (`dragPreview` messages) and restores the elements after the drop, which animates with FLIP. The drop is still one `move` or `insert`. Reduced motion and remote changes during a drag fall back to the drop line.

**Inspector.**

- The Content tab renders the selected block's fields with Payload's public input components: `TextInput`, `TextareaInput`, `SelectInput`, `CheckboxInput`, `UploadInput`, `RelationshipInput`, `DatePicker`, plus `useListDrawer` and `useDocumentDrawer` for picking documents. They look exactly like Payload because they are Payload.
- These inputs are controlled components. They read from and write to the editor store, not Payload form state.
- Input adapters (proven in prototype 2): `UploadInput` needs `api={config.routes.api}`. `RelationshipInput` takes and returns `{ relationTo, value }`, so we store only the ID. `SelectInput` returns the option object. `DatePicker` returns a `Date`, stored as an ISO string.
- **Rich text** uses Payload's own Lexical editor through `RenderLexical` from `@payloadcms/richtext-lexical/client`. It takes `value` and `setValue`, needs no `Form`, and points at a richText field config. The plugin adds a hidden `virtual: true` richText field for that. `RenderLexical` is marked experimental. The fallback is a small editor built from the Lexical packages Payload already re-exports. Both store the same Lexical JSON, which Payload's `RichText` component renders.
- The Styles tab holds the Tailwind controls (section 8).
- The Motion tab edits `block.motion` (section 8, "Motion"): Entrance, Hover and press, Scroll and Loop sections, and a Preview button (`admin/editor/motion/`). It sends whole kinds through `update.motion`, with one merge key per slider, so a drag is one undo step.

**Ideas worth borrowing from other editors (Puck, Webflow, Shopify):** permissions per block (can delete, can drag, can edit), an action bar on the selected block, a separate outline tree, viewports, and "slots" as named child lists.

## 8. Styling

**Data:** each block has `className`. Variants use normal Tailwind syntax (`md:`, `hover:`, `dark:`).

**Visual controls:** the Styles panel has controls for spacing, size, layout (flex and grid), typography, colors, background, border, radius, shadow, position and effects. Each control reads the current classes and writes classes. A breakpoint switch (base, `sm`, `md`, `lg`, `xl`) and a state switch (default, hover, focus) choose the variant prefix. A raw class input with autocomplete shows every class and accepts any class.

**CSS generation:**

- On save: a hook collects every class in the layout. It compiles them with Tailwind's `compile(css).build(classes)` against the app's own CSS entry file, so theme tokens like `bg-primary` work. The CSS goes in a separate generated field, cached by a hash of the class set.
  - Make a new compiler for each save. A cached compiler remembers every class it has seen and outputs all of them. Cache only file reads and plugins.
  - Keep only the utilities and the `@property` and `@keyframes` rules they use. Drop Preflight, the base layer and `:root`. Theme variables stay in `@layer theme`, so they are never overridden.
  - Speed: about 40 ms per save for 50 to 300 classes in a production build.
  - Tailwind plugins are passed as a map in the plugin config (for example `{ '@tailwindcss/typography': typography }`), so Next bundles them.
  - Standalone output needs `outputFileTracingIncludes` for the CSS entry file and Tailwind's CSS files. `websiteBuilder()` adds these lines, or the docs list them.
- In the editor: the canvas iframe compiles with Tailwind's own `compile()` running in the browser. The server sends the stylesheets it loaded, so both sides compile from the same input. A new class shows in about 4 ms. (`@tailwindcss/browser` is slightly faster, but it cannot load plugins like typography.)
- The canvas layout imports the site's CSS (the CSS Next builds from the entry). Tailwind's source detection put every class of the app's components into it, so components' own classes work on the canvas with no `classes` list. Order, as on the site: the site's CSS (head), the theme (`:root:root`, head), then the layout's compiled CSS (`<style data-builder-css>` in the body). The canvas still compiles every layout class, also those the site's CSS has: the site's generated CSS does the same, so the canvas shows what the site shows.
  - Order across the two sheets: the generated CSS styles only block elements. Every generated rule gets `:where(.builder-css)` after its own class (`.flex:where(.builder-css)`, `:where(.space-y-4:where(.builder-css) > …)`); `css/shared.ts` `scopeUtilitiesLayer`. `RenderLayout` adds `builder-css` to each block's `className` (`withBuilderCssClass`, `css/marker.ts`, exported from `/blocks`). Why this is correct: an element of an app component has no marker, so only the site's CSS (in Tailwind's order) styles it. A block element gets all its classes from the layout, so all of them are in the generated CSS, which is in Tailwind's order and comes last. `:where()` adds no specificity. Before, a class in both sheets (say `flex`, from a header layout) came again in the later sheet and beat a component's `md:grid`. Tests: `css/order.test.ts` (a model of the cascade, both directions, site and canvas compile).
  - Rejected: compiling the page CSS together with the app's classes that Tailwind orders after a layout class (found with Tailwind's scanner or the built CSS). It is correct, but the set of classes to add grows by property family and pulls in almost the whole app: 160 KB per page instead of 13 to 30 KB. One stylesheet for the union of app and layout classes has the same size problem.
  - Limits: an element that gets both a block's `className` and the component's own classes (against the block rule) gets the layout's classes over the component's ones where they conflict. Classes in a block's `classes` match only elements with `builder-css`, so a component in a package adds the marker to the elements that use them (the Menu block does, through `MENU_CLASS_MAP`). A renderer other than `RenderLayout` must add the marker. The stored CSS of documents saved before this change is unscoped until the next save; `compilePageCss` compiles at render time, so the site does not use it.
  - Size and speed (starter demo, measured on the server): the scope adds 1 to 2 KB per page (home 13.2 to 15.4 KB, about 30.5 to 31.8 KB); the compile stays about 20 ms. On the canvas, scoping adds under 1 ms per build.
  - The browser build is a full build, so Preflight and the base layer come twice; both copies come from the same entry and are identical, and only the generated utilities are scoped. A full build also keeps a canvas route without the site's CSS working.
  - Why the canvas had no site CSS before: the full browser build already covered the layout's classes, so the site's CSS looked redundant. It missed the classes in the components themselves. Thumbnails copy every stylesheet of the page into each picture, so the site's CSS makes each picture larger.
- On the frontend: the renderer outputs the stored CSS in a `<style>` tag. Any frontend can use it, with or without its own Tailwind build.

These fix the old problems: compiling against bare Tailwind, overriding theme values, missing classes from component code, and failing in Docker.

**Motion (animations).** README: "Animations".

- **Data, not classes.** `block.motion = { enter?, hover?, press?, scroll?, loop? }`; each kind is `{ preset, ...numbers }` (ms, px). `core/motion.ts` (pure, tested) holds the presets, limits and defaults (`MOTION_SPECS`), checking (`checkMotion` for operations and inserts, `motionProblems` for `validateLayout`, `normalizeMotion` for `normalizeLayout`), the JSON Schema (`$defs.$motion`) and the plan the runtime plays (`enterFrom`, `enterTiming`, `interactTransform`, `scrollPlan`, `loopPlan`, reduced-motion variants). `update.motion` is a patch per kind (a kind replaces that kind, `null` removes it); its inverse names the old kinds, so undo is exact and two people editing different kinds of one block do not overwrite each other.
- Why not Tailwind classes: entrances need a start state, a trigger and timing that classes cannot express without per-block CSS, and a runtime has to play them anyway. Classes stay for static styling.
- **Rendering.** `RenderLayout` adds `data-motion` (the JSON), `data-motion-item` (direct children of a block whose entrance has `stagger`) and `data-motion-reveal` (starts hidden) to a block's `attributes`. With motion in the layout it renders `<MotionStyle>` (a hoisted, de-duplicated `<style>`) and `<MotionRuntime>`. `fromPayloadComponent` puts the attributes on its class wrapper on the site, else on the first element through `PayloadRoot`.
- **Runtime** (`builder-react/src/motion/runtime.ts`). One per document (`startMotion` counts users). `MotionRuntime` loads it with a dynamic import, because bundlers put a route's client components in shared chunks: a static import shipped Motion to pages without motion (measured in dev). It finds the elements (a `MutationObserver` covers navigation and new content), hides entrance targets in one batch (set `data-motion-ready`, read the own styles, write the start values: no paint in between), and plays them with `animate` from `motion/mini` (WAAPI) when an `IntersectionObserver` reports `amount` in view. The end values are the element's own computed style; at the end the inline styles go, so classes own the element again. Hover and press use Motion's `hover`/`press` with springs (after the entrance ends; `press` must not add a `tabindex`). Scroll effects use Motion's `scroll` (a native `ViewTimeline` when no ancestor is a scroll box: `overflow: hidden` makes one that never scrolls, so the runtime then follows the page scroll in JS). Loops pause out of view. Entrances, hover and press animate `opacity`/`transform`/`filter`/`clip-path`; scroll and loop effects use the separate `translate`/`scale` properties, so they add up.
- **No flash, visible without JavaScript.** `MOTION_CSS` hides `[data-motion-reveal]:not([data-motion-ready])` only under `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`. The hiding is a 1.2 s animation, so the block shows by itself if the runtime never starts. A block that is already visible in the window (the hiding ended, or reduced motion) skips its entrance. No attribute on `<html>` and no inline script, so there is no hydration mismatch.
- **Entrances on load in CSS.** `MotionStyle({ blocks })` writes one rule per block with `trigger: "load"`, matched by its exact `data-motion` value (stagger children by `:nth-child(n of [data-motion-item])`), with keyframes from `enterFrom` / `enterTiming`. They play from first paint; the runtime sees the CSS animation and only marks the block as ready.
- **Reduced motion:** entrances become fades of at most 300 ms; hover, press, parallax, zoom and loops do not run.
- **Canvas.** The canvas never animates by itself. `motionPreview` plays one block (`previewMotion`); `motionPlay` runs `startMotion` on the canvas document (the "Play animations" toggle, kept in local storage and sent again on `ready`). `builder-react/src/canvas/motion.ts` waits until the block renders with the newest settings before a preview.
- **Size:** the runtime chunk is about 36 KB minified, 13.8 KB gzipped (Motion's `animate` mini, `inView`, `scroll`, `hover`, `press`, `spring`, `stagger`: 9.7 KB of it), measured with esbuild on the entry. Pages without motion load none of it.

## 9. Theme

The Theme global stores design tokens: colors, fonts, radius, spacing scale. The plugin outputs them as CSS variables in Tailwind's `@theme` format, so classes like `bg-primary`, `font-heading` and `rounded-lg` follow the theme. The same output feeds the save-time compile and the editor iframe.

`websiteBuilder({ theme })` adds the global. It is on by default; `theme: false` turns it off. The site renders `<ThemeStyle payload />` from `@payload-toolkit/builder-react/server`. The canvas uses `<ThemeStyle payload live />`, which reloads the theme after a save. See the README section "Theme".

## 10. Rendering

`builder-react` exports:

- `<RenderLayout layout css components />` — a server component that walks the JSON and renders each block with its component. `components` overrides any default block.
- `loadLayoutData(layout, payload)` — loads relationship and upload props in one batch before rendering.
- The default block components: plain React and Tailwind classes, no Payload imports. They work in the editor iframe (client) and on the site (server).

- `pageData` on `RenderLayout`: data the page loads once for all its blocks (for example the services list). Only components marked with `withPageData` receive it; `fromPayloadComponent` marks its components and passes it as `context` with the `props` option.

Blocks that need data are server components on the site. The canvas renders them through the canvas server action (section 7, "Server-rendered blocks"). There is no separate `load()` contract: the developer's component stays as it is.

## 11. Templates and binding

- The plugin adds a Templates collection. Each template targets one collection and holds a layout.
- A document in a collection with `templates: true` uses its own template if it has one, then the collection's default template, then a generated default (title plus main content).
- **Field block:** shows any field of the current document by path (`content`, `featuredImage`, `author.name`), rendered by the field's type. This is how a template shows the post body.
- **Binding:** a block stores `bindings: { "text": "title", "image": "author.avatar" }`, keyed by prop path. At render time, bound props take the document's value. Missing values fall back to the literal prop.
- The binding picker lists only compatible fields. It builds the list by walking the target collection's schema, including one relationship hop.
- In the editor, a template previews against a sample document the designer picks.

## 12. Operations, multiplayer and live AI edits

- **Operations:** every edit is a small JSON operation (`insert`, `move`, `remove`, `duplicate`, `update`) that targets block ids. One pure module applies them and returns the inverse operations for undo. The editor, the server sessions, the MCP tools and the in-editor assistant all use it.
- **Document sessions (server):** the server keeps one in-memory session per open document: the layout at sequence number `seq`. Editors and AI agents send batches of operations to `POST {live}/:collection/:id/commit`. The session applies a batch all-or-nothing, increments `seq` and broadcasts a `commit` event to every connection, the sender included (the echo is the acknowledgement). A batch that no longer applies (its block was deleted by someone else) is rejected with 409.
- **Persistence:** the session saves the draft about 1 s after the last commit (at most every 5 s while edits continue) as the last committer, so access control and the CSS save hook still apply. While a session is open, every other save (form autosave, REST, Publish) gets the session layout, so nobody overwrites collaborators with a stale copy. Dirty sessions are flushed on shutdown. A failed save goes to the editors as `saveFailed` (the top bar shows "Not saved" with the reason and "Retry now", which calls `POST …/flush`); the session retries after 2 s, 5 s, 15 s, then every 30 s while it has unsaved commits. Editor commit requests that fail stay queued and retry with backoff ("Offline" in the top bar); `beforeunload` warns while local changes are unconfirmed.
- **Editors:** each editor applies its own operations at once, sends them one batch at a time, and rebases unconfirmed operations on top of remote commits. Operations that no longer apply are dropped with a notice. Undo sends the inverse of the user's own operations as new edits, so it only reverts the user's own changes. The editor never sends `duplicate`: it sends an `insert` of the finished copy, so every client has the same ids.
- **Events:** `GET {live}/:collection/:id/events` (Server-Sent Events): `session` (full state), `commit`, `collaborators`, `awareness`, `saved` (the draft holds the session up to a seq) and `published` (publish, unpublish, revert). A reconnect resumes from `<sessionId>:<seq>` when the commit log still covers it; otherwise the server sends a fresh `session`.
- **Presence:** collaborators (people and AI agents) have stable colors. Awareness (selection, hover, cursor relative to a block, canvas width) goes through `POST {live}/:collection/:id/awareness` and is never stored. The editor shows avatars, live cursors, colored selections, outline dots and a follow mode.
- **Conflicts:** operations apply in server order; the last write wins per prop.
- **Hook changes:** prop `beforeValidate` / `beforeChange` hooks run in the session's draft save, not per keystroke. When they change a value, the save hook puts `{ input, output }` in the request `context`; after the save the session turns the difference into `update` operations and applies them as a commit of the "Field hooks" actor, through the mutex (queued, never awaited by a save, because Revert waits for saves under the mutex). A prop someone changed since the save keeps its newer value. When nothing was committed during the save, the hook commit counts as saved (a `saved` event, no second save, no "Changed" status after Publish). Guarded saves (Publish, REST while editors are open) do the same through `adoptSaved` in the collection `afterChange` hook.
- **Other fields:** Payload's document lock stays on for the Edit view and the settings drawer. The builder view never takes it. The plugin's own saves (session drafts, publish, unpublish, revert) skip the lock and put it back, because Payload deletes the lock on every update. Because autosave also releases the lock, the save hook rejects (409) a save from a form loaded before another person changed one of its fields (`live/fieldsGuard.ts`, an in-memory record per field).
- **Limits:** sessions live in one server process. With more than one app server, route each document to one instance (sticky routing), or move sessions to a shared store.

## 13. AI tools (MCP)

Added to `payload-mcp-toolkit` through `customTools`:

| Tool | Does |
|---|---|
| `listBlocks` | Returns every block with its description and example. |
| `getBlockSchema` | Returns the JSON Schema of one block. |
| `getLayout` | Returns a document's layout as JSON. |
| `applyOperations` | Applies operations to the draft and publishes them to open editors. |
| `insertSection` | Inserts a ready-made section (hero, features, pricing, …). |
| `validateLayout` | Checks a layout against the block schemas and returns errors. |
| `getPreviewUrl` | Returns the draft preview URL. |
| `generateImage` | Generates an image with the site's image adapter (`ai.images`) and saves it in the media collection. |

Ready-made sections are the main unit the AI should use. AI models build better pages from well-designed sections than from single blocks.

**Motion for the AI.** Blocks in `insert` and `update` take `motion` (section 8). The layout guide lists the presets and settings, generated from `MOTION_PRESET_INFO` and `MOTION_SPECS`; the assistant's prompt adds when to use them (subtle, one entrance per section, `trigger: 'load'` on the first section, `stagger` on card grids, `lift`/`shrink` on linking cards). The assistant's repair step turns common near misses (`motion: 'fade-up'`, a kind without its key) into the real shape; anything else gets the operations' error. The starter's sections carry motion, so `insertSection` brings it along.

**Image generation.** An `AiImageAdapter` (`ai.images`, `src/ai/images/`) is separate from the chat `AiAdapter`: chat APIs return no images unless the model is an image-output model, and MCP clients bring their own chat model. One `ImageService` (on `config.custom`) serves the assistant tool, the inspector's Generate action (`POST {api}/builder/ai/image`) and the MCP tool. It checks create access before the paid call, uploads as the user (`overrideAccess: false`), and keeps one hourly count per user in Payload's key-value store (`payload.kv`, by default the hidden `payload-kv` collection), so the count survives a restart. See docs/ai/images.md.

**Saved sections.** Editors save any block (with its children) as a section ("Save as section…"). The plugin owns a `builder-sections` collection (`plugin/sections.ts`; signed-in users by default; `savedSections: false` turns it off). The library lists them under "Saved"; `listSections` / `insertSection` (MCP and the assistant) load them per request, as the user, and accept `saved:<id>`, the document id or the name. The assistant's system prompt stays stable: saved sections go into the per-request context message. The `blocks` field's `beforeValidate` hook runs the props' `beforeValidate` and `beforeChange` hooks (as the layout save does), then logs `validate` messages and publish-only problems as warnings (`runSectionFieldLogic`).

**Editing a saved section in place.** Saved sections are a builder collection: "Edit section" (the library card's menu) opens `{admin}/builder/builder-sections/:id?from=<path>`, with a live session like a page. The collection keeps `blocks` as its storage, so the MCP tools, the assistant, the library and REST read and write it as before. The builder edits a virtual `layout` field (no column; its `afterRead` hook builds `{ version: 1, blocks }`), and the CSS field is virtual too (the site never renders a section directly). `syncSectionBlocks` (`plugin/sectionsBuilder.ts`, after the layout hook) writes the layout to `blocks`. Payload gives collection hooks the incoming data merged with the stored document, so the hook cannot see what the request sent: the layout wins for the session's own saves and guarded saves (the session owns the blocks while it is open) and when it differs from the stored blocks; otherwise incoming `blocks` stay. `blocks` is an own field of the plugin there (no stale-save check) and read-only in the Edit view, so an old copy in a form never wins. No drafts and no versions: sections are never published, and each change saves at once. The top bar shows "Section: <name>", the category (editable), "Pages keep their copy" (inserts are copies, never links) and Back to `from` (`backPath` accepts admin paths only). Thumbnails follow by themselves: their key is a hash of the section's content, and the library reloads saved sections on window focus.

**Section thumbnails.** One hidden canvas iframe (`?mode=thumbnail`, 1280 px wide) renders one section at a time with the app's components, CSS and theme. It copies the rendered DOM into an SVG `<foreignObject>` with the page's CSS (fonts and images inlined as data URLs), draws it on a canvas and returns a WebP data URL (`builder-react/src/canvas/thumbnail/capture.ts`, no dependency). The editor asks only for cards in view (IntersectionObserver), one at a time in idle time, and keeps the pictures in memory and IndexedDB, keyed by a hash of the section content (ids left out), the theme output and the block definitions. A theme save (BroadcastChannel, tab focus) changes the key, so pictures follow the theme. The iframe is removed after 30 s without work. Why not a live scaled render per card: one iframe per card costs too much memory, and one shared live iframe cannot sit under a scrolling list of draggable cards.

## 14. Prototypes (done, 2026-10-03)

All three passed in a real browser. Their findings are folded into sections 7 and 8. The code is on local branches `proto/canvas`, `proto/inspector` and `proto/tailwind-richtext`, with screenshots under `docs/prototypes/` on each branch. Reuse the tested pure modules from them: the operations and drop-target functions (canvas) and `compileClasses` (Tailwind).

The original prototype goals:

1. **Canvas.** Iframe renders a layout from `postMessage`. Rectangle reporting, overlay with hover and selection, and dnd-kit drag into a nested slot. Success: drag a heading into a stack two levels deep, on the canvas, with correct drop indicators.
2. **Inspector with Payload inputs.** `TextInput`, `SelectInput`, `UploadInput` and `RelationshipInput` bound to the editor store, plus the store synced to the JSON field with `useField`. Success: pick an image, the canvas updates, autosave stores it as a draft.
3. **Tailwind and rich text.** `@tailwindcss/browser` in the iframe with the app's theme: typing `bg-primary p-8` shows in under 100 ms, and the save-time compile gives the same CSS. Also try Payload's Lexical editor inside the inspector for a text block. If it needs too much of Payload's form state, use a lighter text editor for blocks and keep Lexical for full rich text fields.

## 15. What happens to the existing code

| Area | Action |
|---|---|
| Customiser view (`views/customiser/`) | Replace with the new editor. Keep the device-size toolbar idea and the click-to-select message. |
| Blocks (`blocks/`) | Rewrite as `defineBlock` configs plus `builder-react` components. Drop depth copies and suffixed slugs. |
| Styles JSON field and `compileBlockStyles` | Replace with `className` and the new CSS generation. |
| Styles panel UI (`components/admin/StylesPanel.tsx`) | Rebuild as Tailwind controls. Reuse its layout ideas. |
| Theme global, ColorPicker, FontSelector, SliderField | Keep the data idea and the pickers. Output Tailwind `@theme` variables. |
| Collections Pages, Posts, TemplateParts | Move to the starter app. The plugin adds builder fields to them. |
| `create-payload-starter` CLI | Rebuild last, once the plugin is stable. |
| Existing content | Starter: local dev data only, re-seed. Sites with a Payload `blocks` field: `migrateBlocksField` (section 6). |

## 16. Build order

1. ~~Prototypes~~ (done, section 14).
2. ~~**Plugin skeleton**~~ (done 2026-10-03): `websiteBuilder()` config, layout field, operations module with tests, editor tab, 5 blocks (stack, grid, heading, text, image), `RenderLayout`, CSS generation.
   - Save rules: missing required props block only publishing; unknown props/keys are warnings; other errors block (`LayoutError.code`).
   - Known gaps: a dev hot reload clears undo history; `duplicate` regenerates child ids randomly, so live sync broadcasts the resulting `insert`, not the `duplicate` op. (Fixed since: empty blocks get canvas placeholders; the `window.__builderEditor` debug hook exists only in development.)
3. ~~**All core blocks and the Styles panel.**~~ Done 2026-10-04: 15 default blocks, visual Styles panel over Tailwind classes, sections library, editor redesign.
4. ~~**AI:**~~ Done 2026-10-04: `builderMcpTools()` for payload-mcp-toolkit, operations endpoint, SSE live events; AI edits flash in open editors without entering the undo history.
5. ~~**Templates and binding.**~~ Done 2026-10-04: templates collection, bindings with one relationship hop and `$url`, Field and Collection list blocks, sample-document preview.
6. ~~**Starter app and CLI**~~ Done 2026-10-04: starter, packaging, docs, the `create-payload-toolkit` CLI.
7. ~~**Multiplayer, presence, AI chat panel, full-screen view, inline text editing, theme in the plugin.**~~ Done 2026-10-04.
8. ~~**"+" between blocks, saved sections, real section thumbnails.**~~ Done 2026-10-04.
9. ~~**References and "Used in".**~~ Done 2026-10-05: `builderRefs`, join fields on media, delete protection, backfill (section 5).
10. ~~**Existing Payload blocks.**~~ Done 2026-10-05: `fromPayloadBlocks`, `fromPayloadComponents`, `PayloadSlot`, `convertPayloadBlocksLayout`, `migrateBlocksField` (section 6).
11. ~~**Server components and site CSS in the canvas.**~~ Done 2026-10-05: `createCanvasServer`, `ServerBlock` with slot outlets, page data and the adapter's `props` option (sections 6, 7, 10); the canvas layout imports the site's CSS (section 8).
12. ~~**Field logic of block props.**~~ Done 2026-10-05: `validate`, field hooks and field `access` with Payload's arguments, the inspector's `validate` endpoint, hook changes to every editor, `legacyFields` for Publish (sections 6 and 12).
13. ~~**Localization.**~~ Done 2026-10-05: one shared structure with translated props (`block.locales`), locale switcher and translation marks in the editor, per-locale validation and field logic, locale-aware API, renderer, MCP and assistant (section 5).
14. ~~**Animations.**~~ Done 2026-10-05: `block.motion` (entrance with stagger, hover, press, scroll, loop), the Motion tab with Preview and "Play animations", the motion runtime on the `motion` package, MCP and assistant support, motion in the starter's sections (section 8, "Motion").

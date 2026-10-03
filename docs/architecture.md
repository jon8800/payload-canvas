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
- Adds the editor as a document tab.
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

A block is `{ id, type, props?, className?, slots?, bindings?, hidden? }`.

- `id` is stable. Selection, AI edits and bindings use the `id`, never an array index.
- `props` holds the block's own field values. `slots` holds child blocks by slot name, with no depth limit. Keeping them apart makes the tree easy to walk.
- Relationship and upload props store IDs. The renderer loads them (section 10).
- `version` lets us migrate the format later.
- The layout is validated on save against the JSON Schema of each block (section 6).

Why one JSON field instead of a Payload `blocks` field: unlimited nesting with no depth copies or `container_1` slugs, small form state, and edits that are plain JSON operations. That makes AI edits, undo and multiplayer simple. The trade-off: Payload no longer validates or populates block props for us. The plugin does that.

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

## 7. The editor

The editor is a tab inside Payload's document view. Payload keeps doing save, drafts, autosave, versions, locking and access control. We do not fork Payload's edit view and we do not import Payload internals.

**How it mounts (proven in prototype 2).** A custom document tab gets no Payload `Form`, so `useField` has nothing to talk to. The working pattern:

- The builder tab renders Payload's public `DefaultEditView`. That gives Payload's own form, save, drafts, autosave, locking and Publish button.
- The editor is the layout field's own `Field` component. A React context makes it render the full editor in the builder tab and a compact read-only view in the normal Edit tab.
- In the builder tab, scoped CSS hides the default fields and sidebar.
- The plugin adds the layout field at the top level and runs last. Plugins like SEO with `tabbedUI` move fields into tabs, and Payload renders only the active tab.

```
┌──────────────┬───────────────────────────────┬──────────────────┐
│ Outline      │ Canvas (iframe + overlay)     │ Inspector        │
│ block tree   │                               │ Block | Document │
│ + block      │                               │ Content / Styles │
│   library    │                               │                  │
└──────────────┴───────────────────────────────┴──────────────────┘
```

**Editor store (client).** One store holds the layout tree, the selection, the hover state and the undo history. It is a small external store read with `useSyncExternalStore`, so only the parts that change re-render. Every change goes through the operations module (section 12).

**Undo.** Every operation returns its inverse operation. Undo applies the inverse of the user's own last operation. This way undo never reverts edits that came from an AI agent or another user. (The canvas prototype stored whole layouts. That is simpler, but it would undo other people's changes.)

**Sync with Payload.** The store writes the layout to the JSON field with Payload's public `useField` hook (`setValue`). From there Payload's own autosave, drafts and versions take over. Rules proven in prototype 2:

- On load, set a "last written" reference before filling the store, so the load never writes back.
- Ignore incoming values that deep-equal the store. Compare without key order, because Postgres `jsonb` reorders keys.
- Load any other incoming value as an external change.
- Autosave does not send server hook changes back to the form. So layout hooks must not rewrite the layout on autosave. Generated data (like CSS) goes in a separate field.

The document's other fields (title, SEO, …) appear in the Document tab through Payload's `RenderFields`. Hide fields with `admin.disabled`, not by removing them, so field paths stay valid.

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
- Device sizes (desktop, tablet, mobile, custom width) resize the iframe. The breakpoint switch in the Styles panel follows the device size.
- Later: inline text editing on the canvas (double-click a text block).

**Inspector.**

- The Content tab renders the selected block's fields with Payload's public input components: `TextInput`, `TextareaInput`, `SelectInput`, `CheckboxInput`, `UploadInput`, `RelationshipInput`, `DatePicker`, plus `useListDrawer` and `useDocumentDrawer` for picking documents. They look exactly like Payload because they are Payload.
- These inputs are controlled components. They read from and write to the editor store, not Payload form state.
- Input adapters (proven in prototype 2): `UploadInput` needs `api={config.routes.api}`. `RelationshipInput` takes and returns `{ relationTo, value }`, so we store only the ID. `SelectInput` returns the option object. `DatePicker` returns a `Date`, stored as an ISO string.
- **Rich text** uses Payload's own Lexical editor through `RenderLexical` from `@payloadcms/richtext-lexical/client`. It takes `value` and `setValue`, needs no `Form`, and points at a richText field config. The plugin adds a hidden `virtual: true` richText field for that. `RenderLexical` is marked experimental. The fallback is a small editor built from the Lexical packages Payload already re-exports. Both store the same Lexical JSON, which Payload's `RichText` component renders.
- The Styles tab holds the Tailwind controls (section 8).

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
- On the frontend: the renderer outputs the stored CSS in a `<style>` tag. Any frontend can use it, with or without its own Tailwind build.

These fix the old problems: compiling against bare Tailwind, overriding theme values, missing classes from component code, and failing in Docker.

## 9. Theme

The Theme global stores design tokens: colors, fonts, radius, spacing scale. The plugin outputs them as CSS variables in Tailwind's `@theme` format, so classes like `bg-primary`, `font-heading` and `rounded-lg` follow the theme. The same output feeds the save-time compile and the editor iframe.

## 10. Rendering

`builder-react` exports:

- `<RenderLayout layout css components />` — a server component that walks the JSON and renders each block with its component. `components` overrides any default block.
- `loadLayoutData(layout, payload)` — loads relationship and upload props in one batch before rendering.
- The default block components: plain React and Tailwind classes, no Payload imports. They work in the editor iframe (client) and on the site (server).

Blocks that need data (for example "latest posts") declare a `load()` function. It runs on the server for the site, and through a plugin endpoint for the editor.

## 11. Templates and binding

- The plugin adds a Templates collection. Each template targets one collection and holds a layout.
- A document in a collection with `templates: true` uses its own template if it has one, then the collection's default template, then a generated default (title plus main content).
- **Field block:** shows any field of the current document by path (`content`, `featuredImage`, `author.name`), rendered by the field's type. This is how a template shows the post body.
- **Binding:** a block stores `bindings: { "text": "title", "image": "author.avatar" }`, keyed by prop path. At render time, bound props take the document's value. Missing values fall back to the literal prop.
- The binding picker lists only compatible fields. It builds the list by walking the target collection's schema, including one relationship hop.
- In the editor, a template previews against a sample document the designer picks.

## 12. Operations, live AI edits and multiplayer

- **Operations:** every edit is a small JSON operation: `insert`, `move`, `update`, `remove`, `duplicate`, `setClassName`, `setBindings`. Operations target block ids.
- **One operations module** applies operations to a layout. It is pure TypeScript with no React and no Payload. The editor, the MCP tools and the server all use it. It is the most tested code in the project.
- **Server channel:** the plugin adds a Server-Sent Events endpoint per document. When an MCP tool changes a draft, the server publishes the operations. An open editor applies them through the same module and shows who made the change (for example a short highlight on the changed block).
- **Conflicts in v1:** operations apply in order, and the last write wins per prop. The editor shows a notice when someone else is editing.
- **Multi-server:** v1 uses an in-process event bus. With more than one app server, swap it for Postgres `LISTEN/NOTIFY`.
- **Later, multiplayer:** add a CRDT (Yjs) on top of the same operations. Presence (cursors, selections) uses the same channel.

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

Ready-made sections are the main unit the AI should use. AI models build better pages from well-designed sections than from single blocks.

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
| Existing content | Local dev data only. Re-seed instead of migrating. |

## 16. Build order

1. ~~Prototypes~~ (done, section 14).
2. ~~**Plugin skeleton**~~ (done 2026-10-03): `websiteBuilder()` config, layout field, operations module with tests, editor tab, 5 blocks (stack, grid, heading, text, image), `RenderLayout`, CSS generation.
   - Save rules: missing required props block only publishing; unknown props/keys are warnings; other errors block (`LayoutError.code`).
   - Known gaps: a dev hot reload clears undo history; `duplicate` regenerates child ids randomly, so live sync broadcasts the resulting `insert`, not the `duplicate` op. (Fixed since: empty blocks get canvas placeholders; the `window.__builderEditor` debug hook exists only in development.)
3. ~~**All core blocks and the Styles panel.**~~ Done 2026-10-04: 15 default blocks, visual Styles panel over Tailwind classes, sections library, editor redesign.
4. ~~**AI:**~~ Done 2026-10-04: `builderMcpTools()` for payload-mcp-toolkit, operations endpoint, SSE live events; AI edits flash in open editors without entering the undo history.
5. ~~**Templates and binding.**~~ Done 2026-10-04: templates collection, bindings with one relationship hop and `$url`, Field and Collection list blocks, sample-document preview.
6. **Starter app and CLI** on top of the plugin. Starter done; packaging, docs and the CLI in progress.
7. **Later:** inline text editing, multiplayer, presence, an AI chat panel in the admin.

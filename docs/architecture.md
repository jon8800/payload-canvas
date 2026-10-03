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
| Style format | Tailwind classes per block. Visual controls read and write classes. A raw class field covers the rest. |
| Frontend | Headless data plus an optional default React renderer. Users can replace any block component. |
| AI | Builder tools added to `payload-mcp-toolkit` through its `customTools` option. |
| Admin UI | Payload CSS variables, Base UI primitives, SCSS. Kept in a thin layer so Payload 4 changes stay cheap. |

## 3. Open decision: what the editor is built on

**Recommendation: build on Puck (`@puckeditor/core`, MIT, v0.23) as a library.** We own every Payload part around it.

Puck is an open-source React visual editor. It gives us:

- An iframe canvas with click-to-select, overlays, an outline tree, viewports, and undo/redo.
- Nested drag-drop through "slot" fields, on the canvas and in the outline.
- A JSON data model: `{ root, content: [{ type, props: { id, … } }] }`.
- `dispatch()` actions (`insert`, `move`, `replace`, `remove`, …) that outside code can call. This is how live AI edits reach an open editor.
- A composable UI (`Puck.Preview`, `Puck.Fields`, `Puck.Outline`) themed with `--puck-*` CSS variables. We map those to Payload's variables.

What we must build ourselves either way:

- Saving through Payload: drafts, versions, autosave, document locking, access control.
- Payload fields (relationship, upload, rich text) inside the block inspector.
- Tailwind controls and CSS generation.
- Live AI edits over a server channel, and later multiplayer (Puck has none).

Risks:

- Puck is pre-1.0. The APIs we rely on most (`overrides`, `plugins`, the drag-drop engine) are marked experimental and change every few months. Mitigation: pin exact versions, and keep all Puck code in one thin layer (Puck config generated from our block registry, plus an action adapter). Our stored data uses Puck's data shape, so leaving Puck later means rewriting the editor, not migrating content.
- Putting Payload fields inside Puck's inspector is the hardest part. We prototype it first (section 13).

**Not recommended:**

- `@delmaredigital/payload-puck` (v0.9.2). One maintainer, two recent security advisories, inline-CSS styles instead of classes, and it does not reuse Payload's fields or document view. We borrow ideas only.
- Our own canvas on Payload form state. Payload form state is a flat map of field paths that rebuilds on the server after changes. It fits a deeply nested live canvas badly, and it means rebuilding drag-drop, overlays and undo from zero.

The rest of this document assumes Puck.

## 4. Packages

```
packages/
  builder/           # the Payload plugin: config, fields, hooks, endpoints, admin editor view
  builder-react/     # default block components and the layout renderer (no Payload, no Puck at render time)
  create-payload-starter/
  shared/
apps/
  starter/           # reference app and dev host for the plugin
```

Package names are placeholders until we pick the public name.

`builder` has three entry points: `.` (server config), `./client` (admin components), `./rsc` (server components for the admin).

## 5. Plugin config

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
- Adds the editor view as a document tab.
- Adds the hooks that generate CSS and validate the layout on save.
- Sets live preview to the `url` function.

The `url` function is the one place that maps a document to its frontend path. Preview, sitemap, link fields and revalidation all use it. No route prefix is hardcoded in the plugin.

## 6. Data model

One `json` field holds the whole layout tree, in Puck's data shape:

```json
{
  "root": { "props": {} },
  "content": [
    {
      "type": "stack",
      "props": {
        "id": "b_8f2k",
        "className": "flex flex-col gap-6 md:flex-row",
        "children": [
          { "type": "heading", "props": { "id": "b_9a1c", "text": "Hello", "level": 2, "className": "text-4xl font-bold" } }
        ]
      }
    }
  ]
}
```

- Every block has a stable `id`. Selection, AI edits and bindings use the `id`, never an array index.
- Nesting uses slot props (`children` above) with no depth limit. No more depth copies or `container_1` slugs.
- Relationship and upload props store IDs. The renderer loads them (section 9).
- The layout is validated on save against the JSON Schema of each block (section 7).

Why one JSON field instead of a Payload `blocks` field: unlimited nesting, small form state, and edits that are plain JSON operations. That makes AI edits, undo and multiplayer simple. The trade-off: Payload no longer validates or populates block props for us. The plugin does that.

## 7. Block contract

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
    example: { text: 'Our services', level: '2', className: 'text-3xl font-semibold' },
  },
})
```

- **Props are declared with Payload field configs.** From one declaration the plugin generates the Puck field config, a JSON Schema for validation and for AI tools, and TypeScript types.
- Simple fields (text, number, select, checkbox, array, group) map to Puck's built-in fields.
- Relationship, upload and rich text fields render as Payload's own field components through a bridge (section 13, prototype 1).
- The React component is registered separately, in `builder-react` or in the app. Config stays server-safe.

## 8. Styling

**Data:** each block has `className`. Variants use normal Tailwind syntax (`md:`, `hover:`, `dark:`).

**Visual controls:** the Styles panel has controls for spacing, size, layout (flex and grid), typography, colors, background, border, radius, shadow, position and effects. Each control reads the current classes and writes classes. A breakpoint switch (base, `sm`, `md`, `lg`, `xl`) and a state switch (default, hover, focus) choose the variant prefix. A raw class input with autocomplete shows every class and accepts any class.

**CSS generation:**

- On save: a hook collects every class in the layout. It compiles them with Tailwind's `compile(css).build(classes)` against the app's own CSS entry file, so theme tokens like `bg-primary` work. The CSS is stored with the document and cached by a hash of the class set.
- In the editor: the canvas iframe compiles classes in the browser with `@tailwindcss/browser`, so a change shows at once.
- On the frontend: the renderer outputs the stored CSS in a `<style>` tag. Any frontend can use it, with or without its own Tailwind build.

These fix the old problems: compiling against bare Tailwind, overriding theme values, missing classes from component code, and failing in Docker.

## 9. Theme

The Theme global stores design tokens: colors, fonts, radius, spacing scale. The plugin outputs them as CSS variables in Tailwind's `@theme` format, so classes like `bg-primary`, `font-heading` and `rounded-lg` follow the theme. The same output feeds the save-time compile and the editor iframe.

## 10. Rendering

`builder-react` exports:

- `<RenderLayout layout css components />` — a server component that walks the JSON and renders each block with its component. `components` overrides any default block.
- `loadLayoutData(layout, payload)` — loads relationship and upload props in one batch before rendering.
- The default block components: plain React, Tailwind classes, no Payload or Puck imports at render time. They work in the editor iframe (client) and on the site (server).

Blocks that need data (for example "latest posts") declare a `load()` function. It runs on the server for the site, and through a plugin endpoint for the editor.

## 11. Editor in the admin

- The editor is a tab inside Payload's document view. Payload keeps doing save, drafts, autosave, versions, locking and access control. We do not fork Payload's edit view.
- The editor reads and writes the layout field through Payload's public `useField` hook.
- Layout: outline (left), canvas (center), inspector (right). The inspector has Block and Document tabs. The Document tab shows the document's other fields (title, SEO, …) using Payload's own field rendering.
- The UI uses Payload CSS variables. Puck's `--puck-*` variables are mapped to them.

## 12. Live AI edits and multiplayer

- **Operations:** every edit is a small JSON operation: `insert`, `move`, `update`, `remove`, `duplicate`. Operations target block ids. They map one-to-one to Puck's `dispatch` actions.
- **One operations module** applies operations to a layout. The editor, the MCP tools and the server all use the same module.
- **Server channel:** the plugin adds a Server-Sent Events endpoint per document. When an MCP tool changes a draft, the server publishes the operations. An open editor applies them with `dispatch` and shows who made the change.
- **Conflicts in v1:** operations apply in order, and the last write wins per prop. The editor shows a notice when someone else is editing.
- **Multi-server:** v1 uses an in-process event bus. With more than one app server, swap it for Postgres `LISTEN/NOTIFY`.
- **Later, multiplayer:** add a CRDT (Yjs) on the same operations. Presence (cursors, selections) uses the same channel.

## 13. Prototypes before the full build

These two parts decide whether the plan holds. Build them first, as throwaway code.

1. **Payload fields inside Puck's inspector.** Render a Payload upload field and a relationship field for the selected block, with Payload's form state, inside a Puck custom field. Success: pick an image, the canvas updates, save works.
2. **Tailwind in the canvas.** Run `@tailwindcss/browser` in the Puck iframe with the app's theme. Success: typing `bg-primary p-8` into the class field shows the result in under 100 ms. Also confirm the save-time compile gives the same CSS.

## 14. Templates and binding

- The plugin adds a Templates collection. Each template targets one collection and holds a layout.
- Each document in a collection with `templates: true` uses its own template if it has one, then the collection's default template, then a generated default (title plus main content).
- **Field block:** shows any field of the current document by path (`content`, `featuredImage`, `author.name`), rendered by the field's type. This is how a template shows the post body.
- **Binding:** a block stores `bindings: { "text": "title", "image": "author.avatar" }`, keyed by prop path. At render time, bound props take the document's value. Missing values fall back to the literal prop.
- The binding picker lists only compatible fields. It builds the list by walking the target collection's schema, including one relationship hop.

## 15. AI tools (MCP)

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

## 16. What happens to the existing code

| Area | Action |
|---|---|
| Customiser view (`views/customiser/`) | Replace with the Puck-based editor. Keep the device-size toolbar idea. |
| Blocks (`blocks/`) | Rewrite as `defineBlock` configs plus `builder-react` components. Drop depth copies and suffixed slugs. |
| Styles JSON field and `compileBlockStyles` | Replace with `className` and the new CSS generation. |
| Styles panel UI (`components/admin/StylesPanel.tsx`) | Rebuild as Tailwind controls. Reuse its layout ideas. |
| Theme global, ColorPicker, FontSelector, SliderField | Keep the data idea and the pickers. Output Tailwind `@theme` variables. |
| Collections Pages, Posts, TemplateParts | Move to the starter app. The plugin adds builder fields to them. |
| `create-payload-starter` CLI | Rebuild last, once the plugin is stable. |
| Existing content | Local dev data only. Re-seed instead of migrating. |

## 17. Build order

1. **Prototypes** (section 13).
2. **Plugin skeleton:** `websiteBuilder()` config, layout field, editor tab with Puck, 5 blocks (stack, grid, heading, text, image), `RenderLayout`, CSS generation.
3. **All core blocks and the Styles panel.**
4. **AI:** operations module, MCP tools, live edits in the open editor.
5. **Templates and binding.**
6. **Starter app and CLI** on top of the plugin.
7. **Later:** multiplayer, presence, an AI chat panel in the admin.

# @payload-toolkit/builder

A visual page builder for Payload CMS 3. It adds a full-screen builder to the collections you choose. Editors drag blocks onto a live canvas, nest them without limit, and style them with Tailwind classes. AI agents can build and edit the same pages over MCP, and an open editor shows each AI change as it happens.

- Works in any Payload 3.90+ app on Next.js 16 and React 19.
- The layout is one JSON field per document. Nothing changes in your other fields.
- The site renders the layout with `@payload-toolkit/builder-react` (React Server Components), or with your own renderer.
- Save, drafts, autosave, versions and access control stay Payload's own.
- Several people (and AI agents) can edit one page at the same time. See [Multiplayer editing](#multiplayer-editing).

Two packages:

| Package | What it holds |
|---|---|
| `@payload-toolkit/builder` | The Payload plugin, the admin editor, block definitions, the CSS compiler, live editing, MCP tools. |
| `@payload-toolkit/builder-react` | `RenderLayout`, the default block components, the canvas runtime, server data helpers. |

## Contents

1. [Requirements](#requirements)
2. [Install](#install)
3. [The builder view](#the-builder-view)
4. [Plugin options](#plugin-options)
5. [Rendering](#rendering)
6. [Custom blocks](#custom-blocks)
7. [Using existing Payload blocks](#using-existing-payload-blocks)
8. [Sections](#sections)
9. [Styling](#styling)
10. [Theme](#theme)
11. [Templates and binding](#templates-and-binding)
12. [References and Used in](#references-and-used-in)
13. [AI assistant](#ai-assistant)
14. [AI editing over MCP](#ai-editing-over-mcp)
15. [Multiplayer editing](#multiplayer-editing)
16. [Production and Docker](#production-and-docker)
17. [Deploying](#deploying)
18. [Troubleshooting](#troubleshooting)

## Requirements

- `payload`, `@payloadcms/ui`, `@payloadcms/richtext-lexical` 3.90 or later
- `next` 16.3 or later, `react` and `react-dom` 19.2 or later
- `tailwindcss` 4.3 or later (the plugin compiles your Tailwind entry CSS)
- Node.js 20.9 or later
- Any Payload database adapter. Postgres and SQLite store the layout as `jsonb`/JSON.

## Install

These steps start from a blank Payload app (`npx create-payload-app -t blank`). They were tested on a fresh app with Payload 3.90.2, Next.js 16.3.3, React 19.2.6, Tailwind 4.3.3 and pnpm.

### 1. Add the packages

```bash
pnpm add @payload-toolkit/builder @payload-toolkit/builder-react tailwindcss @tailwindcss/postcss postcss
```

### 2. Add a collection with pages

Any collection works. This one uses drafts, so the editor gets **Save Draft** and **Publish**.

```ts
// src/collections/Pages.ts
import type { CollectionConfig } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title' },
  access: {
    // Signed-in users see drafts. Visitors see published pages only.
    read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }),
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
  ],
}
```

### 3. Make one block list

The plugin, the site and the canvas must use the same block list. Put it in its own file. Import blocks from `@payload-toolkit/builder/blocks`: that entry has no server code, so client components can import it too.

```ts
// src/builder.ts
import { defaultBlocks } from '@payload-toolkit/builder/blocks'

export const blocks = defaultBlocks({ mediaCollection: 'media', linkCollections: ['pages'] })
```

### 4. Add the Tailwind entry CSS

```css
/* src/app/(frontend)/globals.css */
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.55 0.2 260);
  --color-primary-foreground: oklch(0.98 0 0);
}
```

```js
// postcss.config.mjs
export default {
  plugins: { '@tailwindcss/postcss': {} },
}
```

Import the file in your site layout: `import './globals.css'` in `src/app/(frontend)/layout.tsx`.

### 5. Add the plugin

```ts
// src/payload.config.ts
import { websiteBuilder } from '@payload-toolkit/builder'
import { blocks } from './builder'
import { Pages } from './collections/Pages'

export default buildConfig({
  collections: [Users, Media, Pages],
  // ...
  plugins: [
    // other plugins first
    websiteBuilder({
      collections: { pages: { url: (doc) => `/${doc.slug}` } },
      blocks,
      css: { entry: 'src/app/(frontend)/globals.css' },
    }),
  ],
})
```

Keep `websiteBuilder` **last** in `plugins`. See [Troubleshooting](#troubleshooting).

Then regenerate the import map and the types:

```bash
pnpm payload generate:importmap
pnpm payload generate:types
```

### 6. Add the canvas route

The editor shows the page in an iframe. The iframe loads a route in your app, so the canvas uses your real block components. Give the route its own root layout, without your site header, footer or `globals.css`. The canvas compiles its own CSS in the browser.

```tsx
// src/app/(builder-canvas)/layout.tsx
import { ThemeStyle } from '@payload-toolkit/builder-react/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import type { ReactNode } from 'react'

export default async function CanvasLayout({ children }: { children: ReactNode }) {
  const payload = await getPayload({ config })
  return (
    <html lang="en">
      <head>
        {/* The Theme global's variables and fonts. `live` reloads them after a theme save. */}
        <ThemeStyle payload={payload} live />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

```tsx
// src/app/(builder-canvas)/builder-canvas/page.tsx
'use client'

import { BuilderCanvas } from '@payload-toolkit/builder-react/canvas'
import { blocks } from '@/builder'

export default function CanvasPage() {
  return <BuilderCanvas blocks={blocks} />
}
```

The same page also renders the library's section thumbnails: the editor loads it hidden, with `?mode=thumbnail`, when the **Sections** tab needs pictures. Nothing to add for that.

The default path is `/builder-canvas`. Change it with the `canvasPath` option. If your app has a single root `app/layout.tsx`, move the site into a route group first, so the canvas can have its own root layout. Payload's templates already use `(frontend)` and `(payload)` groups.

### 7. Render pages on the site

```tsx
// src/app/(frontend)/[slug]/page.tsx
import type { GeneratedCss } from '@payload-toolkit/builder'
import { normalizeLayout } from '@payload-toolkit/builder/core'
import { RenderLayout } from '@payload-toolkit/builder-react'
import { loadLayoutData } from '@payload-toolkit/builder-react/server'
import config from '@payload-config'
import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { blocks } from '@/builder'

type Props = { params: Promise<{ slug: string }> }

export default async function Page({ params }: Props) {
  const { slug } = await params
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'pages', where: { slug: { equals: slug } }, limit: 1, draft })
  const page = docs[0]
  if (!page) notFound()

  const layout = await loadLayoutData(normalizeLayout(page.layout), blocks, payload, { draft })
  return <RenderLayout layout={layout} blocks={blocks} css={(page.layoutCss as GeneratedCss | null)?.css} />
}
```

Put `<ThemeStyle payload={payload} />` in the `<head>` of your site's root layout too. See [Theme](#theme).

### 8. Add the standalone tracing lines

Skip this step if you do not use `output: 'standalone'`. On every save, the plugin compiles Tailwind classes. The compile reads your CSS entry and Tailwind's CSS files from disk, so Next's file tracer cannot see them. List them in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/*': [
      './src/app/\\(frontend\\)/globals.css',
      './node_modules/tailwindcss/package.json',
      './node_modules/tailwindcss/*.css',
      // Add every package your CSS entry imports, e.g. './node_modules/tw-animate-css/dist/*.css'
    ],
  },
}
```

Escape `(` and `)` in route group names: the paths are globs.

### 9. Turn off Next's compression

In `next.config.ts`, set `compress: false` and let your reverse proxy compress responses (see [Deploying](#deploying)). Next's built-in gzip adds one listener to the gzip stream for each backpressure event while it streams a large HTML page. The admin and builder pages are large. In production this logs `MaxListenersExceededWarning: 11 drain listeners added to [Gzip]` many times. The listeners are freed when the response ends, so this is only noise, but it hides real warnings.

```ts
const nextConfig: NextConfig = {
  compress: false,
}
```

### 10. Run it

```bash
pnpm dev
```

1. Open `http://localhost:3000/admin` and create the first user.
2. Create a page with a title and a slug, for example `about`.
3. Click the **Builder** tab (or **Open builder** on the layout field). The builder opens full screen. Click or drag blocks from **Add**. Edit content in the right panel. Style blocks in **Styles**.
4. Click **Publish changes** in the top bar and open `http://localhost:3000/about`.

## The builder view

The builder is a full-screen admin view at `/admin/builder/<collection>/<id>`. It has no Payload nav and no document header: one top bar holds everything.

How editors open it:

- the document's **Builder** tab (a link to the view),
- the **Open builder** button on the layout field in the normal Edit view (a new document must be saved first),
- the old tab URL `/admin/collections/<collection>/<id>/builder`, which redirects to the view.

The top bar, left to right:

- **Back** to the document's Edit view, the admin icon (to the dashboard), and `Collection › Title`. Click the title to rename the document: Enter or leaving the field saves it (as a draft when the collection has drafts). Escape cancels.
- The status: **Draft** (never published), **Published**, or **Changed** (published, with newer draft changes). Hover it for the last change, the creation date, the last publish and the number of versions (opens the Versions drawer).
- Undo and redo, the canvas width and the active breakpoint. **Fluid** (the default) fills the space between the sidebars, so the breakpoint follows the free width. Desktop (1280 px), tablet, mobile and a custom width are fixed widths. In a template: the sample document the canvas previews.
- The people on the page, and the save state: **Saving…** while changes are on their way, then **Saved · 12:04**.
- **Preview** opens the draft preview (the collection's `admin.livePreview.url`, else `admin.preview`), or the public page (the plugin's `url` option), in a new tab.
- **Page settings** opens the document's own edit form in a Payload drawer: title, slug, SEO, and for a template its collection and sample document. The top bar updates after each save.
- The AI assistant (with the `ai` option), the keyboard shortcuts, and **Publish changes**. Its menu has **Unpublish**, **Revert to published** (drops all draft changes, after a confirmation), **Versions** and **API** (Payload's own screens, in a drawer over the builder), and links to the Edit view and the live page. In the Versions drawer, open a version to compare it, then **Restore as draft**: every open editor gets the restored layout, and the site keeps the published version until you publish.

The sidebars and the split between the Add panel and the outline resize: drag the edge, or focus it with Tab and use the arrow keys (Shift for larger steps). A double-click or Enter resets the default size. The sizes are kept in the browser.

Publishing. All editors of a document share one live session (see [Multiplayer editing](#multiplayer-editing)). The session saves the layout as a draft about a second after each change. **Publish changes** saves what is still unsaved, then publishes with Payload's Local API as the signed-in user, so access control, hooks and versions work as usual. **Unpublish** sets the document back to draft. **Revert to published** loads the published version into the session, so every open editor reloads the canvas, and saves it again. Every open editor sees the new status at once.

Save rules. Every save checks the layout. A broken layout (wrong shape, duplicate ids, unknown block types, wrong prop types) blocks every save. Unfinished blocks do not block drafts, autosave or live sessions: a missing required prop, a prop whose value does not match its `builderFormat` (for example a half-typed video URL), a block in a slot that refuses it, and a binding the prop cannot use. They block **Publish** only, and the problem list names the block ("Video: this YouTube link does not point to a video"). Click a problem to select the block.

Adding blocks on the canvas. Hover the canvas: a small **+** shows on the edge between two blocks next to the pointer (above or below in a column, left or right in a row), and in the middle of an empty container. Click it to open a picker with the blocks and sections that fit there (slot rules apply). Type to search, use the arrow keys and Enter, or click. The new block goes in exactly that place and is selected. The **+** hides while you drag and while you edit text on the canvas.

Drag and drop. Drag a block by its row in the outline, by the grip on the selected block's bar, or from the **Add** panel. Slot rules apply: a slot that refuses the block is never a target. Escape cancels the drag. One drop is one undo step, and collaborators see the move at once. There are two styles:

- **Drop line** (`'indicator'`, the default). A line or a box shows where the block lands. Blocks move when you drop.
- **Smooth** (`'smooth'`). The block lifts and follows the pointer. The other blocks and the outline rows slide out of the way, so a gap shows where the block lands. In a grid, blocks move into the next cell. On drop, the block slides into the gap. On cancel, it slides back.

Set the default with `websiteBuilder({ editor: { dragMode: 'smooth' } })`. Each user can change it with the grip button in the canvas status bar, next to the zoom. The choice stays in that browser. When the system asks for less motion (`prefers-reduced-motion: reduce`), the editor always uses the drop line. Both styles use the same drop rules, so the same drop gives the same result. Smooth mode moves blocks with CSS transforms only and never changes the layout before the drop.

Access. The view sends signed-out visitors to the login page and back. Users without admin access go to Payload's "unauthorized" page. A document that does not exist, or a collection without the builder, shows "not found". A user who can read but not update the document gets the normal Edit view.

## Plugin options

```ts
websiteBuilder({
  collections: {
    pages: { field: 'layout', url: (doc) => `/${doc.slug}` },
    posts: { templates: true, url: (doc) => `/blog/${doc.slug}` },
  },
  blocks,                      // default: defaultBlocks()
  sections,                    // ready-made sections for the library and AI tools
  savedSections: { slug: 'builder-sections' }, // sections people save; `false` turns it off
  css: {
    entry: 'src/app/(frontend)/globals.css',
    plugins: { '@tailwindcss/typography': typography },
  },
  canvasPath: '/builder-canvas',
  templates: { slug: 'builder-templates' },
  live: { heartbeatMs: 15000 },
  ai: { effort: 'medium' },    // the AI assistant in the editor
  theme: { admin: { group: 'Settings' } }, // the Theme global; `false` leaves it out
  editor: { dragMode: 'smooth' }, // the default drag and drop style; each user can change it
  references: { usedIn: ['media'], protectDelete: ['media'] }, // "Used in" lists; `false` turns them off
})
```

| Option | Type | What it does |
|---|---|---|
| `collections` | `Record<slug, { field?, url?, templates? }>` | The collections that get the builder. Required. |
| `collections[slug].field` | `string` | Name of the layout JSON field. Default `layout`. The generated CSS goes in `<field>Css`. If a `json` field with this name exists (also inside rows, collapsibles or unnamed tabs), the plugin reuses it and moves it to the top level. |
| `collections[slug].url` | `(doc) => string` | The frontend path of a document. AI tools use it for preview links. The collection list block uses it for links. |
| `collections[slug].templates` | `boolean` | Documents render through templates. See [Templates](#templates-and-binding). |
| `blocks` | `BlockDefinition[]` | The blocks editors can use. Default `defaultBlocks()`. |
| `sections` | `SectionDefinition[]` | Ready-made sections. See [Sections](#sections). |
| `savedSections` | `{ slug?, access?, admin?, hooks? } \| false` | The collection for sections people save in the editor. Default slug `builder-sections`; default access: every signed-in user. `false` turns it off. See [Saved sections](#saved-sections). |
| `css.entry` | `string` | Your Tailwind entry CSS, absolute or relative to `process.cwd()`. Required. |
| `css.plugins` | `Record<id, plugin>` | Tailwind plugins by the id your CSS uses in `@plugin "<id>"`. Pass the imported module, so Next bundles it. |
| `canvasPath` | `string` | The canvas route. Default `/builder-canvas`. |
| `templates.slug` | `string` | Slug of the templates collection. Default `builder-templates`. |
| `templates.hooks` | `CollectionConfig['hooks']` | Hooks for the templates collection, for example to revalidate pages. |
| `live.heartbeatMs` | `number` | Interval of the keep-alive message on the live event stream. Default 10 s. |
| `multiplayer` | `boolean` | Deprecated, no effect. Several people can always edit a layout at once, and Payload's document lock stays on for the other fields. See [Multiplayer editing](#multiplayer-editing). |
| `ai` | `AiOptions` | Turns on the AI assistant in the editor. See [AI assistant](#ai-assistant). |
| `theme` | `ThemeOptions \| false` | The Theme global. On by default. `false` leaves it out. See [Theme](#theme). |
| `editor.dragMode` | `'indicator' \| 'smooth'` | The default drag and drop style. `indicator` (the default) shows a drop line; `smooth` lifts the block and moves the other blocks out of the way. Each user can change it in the editor. See [The builder view](#the-builder-view). |
| `css.fontFamilies` | `(payload) => Record<name, family>` | Font families set at runtime some other way than the Theme global, for the Styles panel's Font list. Its names win over the theme's. |
| `references` | `{ field?, usedIn?, protectDelete?, maxListed? } \| false` | Which media and documents each layout uses: "Used in" lists and delete protection. On by default. `false` turns it off. See [References and Used in](#references-and-used-in). |

For each listed collection the plugin adds:

- the layout field (`json`) with the editor as its field component,
- a hidden `<field>Css` field that stores `{ hash, css }`,
- a hidden virtual rich text field, when a block has a rich text prop,
- a hidden `builderRefs` relationship field that lists the media and documents the layout uses (see [References and Used in](#references-and-used-in)),
- the **Builder** document tab, a link to the full-screen view (`/admin/builder/<slug>/<id>`; the plugin adds this root view once for all collections),
- a `beforeChange` hook that validates the layout and compiles its CSS, takes the layout from the live session while one is open, and rejects a save from an out-of-date form (see [Multiplayer editing](#multiplayer-editing)),
- a `beforeOperation` and an `afterChange` hook for the live session and Payload's document lock.

It also adds these endpoints (signed-in users only):

| Endpoint | Use |
|---|---|
| `GET /api/builder/canvas-css` | The stylesheets the canvas compiles from. |
| `GET /api/builder/style-tokens` | Theme tokens and class names for the Styles panel. |
| `GET /api/builder/live/:collection/:id/events` | Server-Sent Events stream of one document's live session. |
| `POST /api/builder/live/:collection/:id/commit` | Applies one batch of operations to the live session (editors). |
| `POST /api/builder/live/:collection/:id/awareness` | Sends your selection and pointer to the other editors. |
| `POST /api/builder/live/:collection/:id/operations` | Applies operations to the live session and returns the new layout (scripts and integrations). |
| `GET /api/builder/live/:collection/:id/meta` | What the builder's top bar shows: title, status, dates, versions count, preview links. |
| `POST /api/builder/live/:collection/:id/publish` | Saves the live session, then publishes the document. |
| `POST /api/builder/live/:collection/:id/unpublish` | Sets the document back to draft. |
| `POST /api/builder/live/:collection/:id/revert` | Drops the draft changes: the live session and the draft get the published version. |
| `POST /api/builder/live/:collection/:id/restore` | Body `{ versionId }`. Restores an older version: the live session and the draft get its layout. With drafts it becomes the draft. |
| `POST /api/builder/ai/chat` | The AI assistant (only with the `ai` option). Streams Server-Sent Events. |
| `GET /api/builder/theme` | The theme as `{ css, fontsHref }` (with the theme on). It uses the global's read access, so it is public by default. |

### Entry points

| Import | Use it in | Holds |
|---|---|---|
| `@payload-toolkit/builder` | `payload.config.ts` (server) | `websiteBuilder`, `defineBlock`, `defaultBlocks`, `fromPayloadBlocks`, `migrateBlocksField`, types |
| `@payload-toolkit/builder/blocks` | anywhere | `defaultBlocks`, `defineBlock`, `linkField`, `fromPayloadBlocks` |
| `@payload-toolkit/builder/core` | anywhere | layout types, `normalizeLayout`, `validateLayout`, `applyOperations`, tree helpers, `convertPayloadBlocksLayout`, `toPayloadBlock` |
| `@payload-toolkit/builder/css` | server | `compileClasses`, `getStyleTokens`, `tracingIncludes` |
| `@payload-toolkit/builder/theme` | anywhere | `themeCss`, `themeVariables`, `themeOutput`, `deriveColors`, `googleFontsHref`, `themeConfigOf`, theme types |
| `@payload-toolkit/builder/theme-client` | Payload import map, or your own fields | `ThemeColorField`, `ThemeFontField`, `ThemeSliderField` |
| `@payload-toolkit/builder/mcp` | server | `builderMcpTools` |
| `@payload-toolkit/builder/live` | server | the live sessions and endpoints |
| `@payload-toolkit/builder/client` | Payload import map only | admin client components (layout field, Builder tab) |
| `@payload-toolkit/builder/rsc` | Payload import map only | admin server components (the builder view, the tab redirect) |

## Rendering

`RenderLayout` is a React Server Component. It walks the layout and renders each block with its component.

| Prop | Type | What it does |
|---|---|---|
| `layout` | `Layout` | The layout, usually after `loadLayoutData`. |
| `blocks` | `BlockDefinition[]` | The same list as the plugin. |
| `css` | `string \| null` | The generated CSS from `<field>Css`. Rendered in a `<style>` tag. |
| `components` | `Record<type, Component>` | Your components, merged over the defaults. |
| `resolveLink` | `(link) => string \| null` | Turns links into an `href`. Default: the URL, or `/<slug>` for a loaded document. |
| `context` | `{ collection, doc }` | The document a template renders. See [Templates](#templates-and-binding). |

`loadLayoutData(layout, blocks, payload, options)` (from `@payload-toolkit/builder-react/server`) loads the documents that upload and relationship props point to, in one `find` per collection. Options: `draft`, `context`, `resolveLink`.

Write a `resolveLink` when your collections have different routes. Pass the same function to `RenderLayout` and to `BuilderCanvas`:

```ts
import type { ResolveLink } from '@payload-toolkit/builder-react'

export const resolveLink: ResolveLink = (link) => {
  if (link.type !== 'reference') return link.url?.trim() || null
  const doc = link.reference?.value as { slug?: string } |const post = docs[0]
  if (!doc?.slug) return null
  return link.reference?.relationTo === 'posts' ? `/blog/${doc.slug}` : `/${doc.slug}`
}
```

### Custom components

Every block component gets the same props:

```ts
type BlockComponentProps = {
  block: Block                      // the stored block
  props: Record<string, unknown>    // props after data loading and link resolution
  className?: string
  slots: Record<string, ReactNode>  // rendered children per slot
  attributes: Record<string, string>                 // spread on the root element
  slotAttributes: Record<string, Record<string, string>> // spread on each slot's container
  mode: 'site' | 'canvas'
}
```

- Spread `attributes` on the root element. In the canvas it holds `data-block-id`, which the editor needs to select and measure the block.
- Props are plain data. A component can be a client component (`'use client'`).
- Use one components map for the site and the canvas, in a file without server code:

```tsx
// src/components/blocks.ts
import type { BlockComponents } from '@payload-toolkit/builder-react'
import { PricingTable } from './PricingTable'

export const components: BlockComponents = { pricingTable: PricingTable }
```

```tsx
<RenderLayout layout={layout} blocks={blocks} components={components} resolveLink={resolveLink} css={css} />
<BuilderCanvas blocks={blocks} components={components} resolveLink={resolveLink} />
```

## Custom blocks

Declare a block with `defineBlock`. Props are Payload field configs. The editor builds its inputs from them, and the plugin builds a JSON Schema for validation and AI tools.

```ts
// src/builder.ts
import { defaultBlocks, defineBlock, linkField } from '@payload-toolkit/builder/blocks'

export const pricingTable = defineBlock({
  type: 'pricingTable',
  label: 'Pricing table',
  icon: 'grid',               // a name from the editor's icon set; unknown names get a generic icon
  category: 'Marketing',      // group in the block library
  fields: [
    { name: 'plan', type: 'text', required: true },
    { name: 'price', type: 'number' },
    linkField({ collections: ['pages'] }),   // prop "link": URL or a page
  ],
  slots: { features: { allow: ['text', 'list'] } },  // named child lists; omit for a leaf block
  defaultClassName: 'flex flex-col gap-4 rounded-xl border p-6',
  classes: ['text-sm', 'font-semibold'],    // classes the component uses itself
  ai: {
    description: 'A pricing card with a plan name, a price and a call to action.',
    example: { props: { plan: 'Pro', price: 29 } },
  },
})

export const blocks = [...defaultBlocks({ linkCollections: ['pages'] }), pricingTable]
```

- `slots` declares where child blocks go. `allow` lists the accepted block types, or `['*']`.
- `parents` limits where a block may go: only directly inside the listed block types (never in the root list). The `listItem` block uses `parents: ['list']`. A new block whose slot accepts exactly one such type starts with one child of it, so a new list starts with one item.
- `classes`: the save hook only sees the classes stored in the layout. List the classes your component hardcodes, so they are in the generated CSS too.
- `admin.custom.builderFormat` on a `text` field names a value check, for example `custom: { builderFormat: 'videoUrl' }` (the Video block's URL). The inspector shows the message while the user types, and a bad value blocks **Publish** but not draft saves. `videoUrl` is the only built-in format. Formats live in a registry in `@payload-toolkit/builder/core` (`FORMATS`, `formatProblem`). The renderer can use the same parser (`parseVideoUrl`).
- `linkField()` stores `{ type, url, reference, newTab }`. The component receives it resolved, with `href`, `target` and `rel`.
- The default blocks are `stack`, `grid`, `heading`, `text`, `richText`, `image`, `video`, `button`, `link`, `menu`, `list` with its `listItem` blocks, `quote`, `divider`, `spacer`, `collectionList` (documents from a collection) and `field` (a field of the document a template renders).
- A list holds its items as `listItem` blocks in its `items` slot, so each item can be selected, dragged, styled and edited on the canvas. Enter at the end of an item adds the next one; Backspace at the start of an item joins it to the one before. Older layouts stored the items as a prop (`props.items: [{ text }]`). `normalizeLayout` turns them into `listItem` blocks when a layout loads, and the List component still renders the old prop until the layout is saved again. A list whose `items` prop is bound to document data keeps the old form.

## Using existing Payload blocks

A site that already has a Payload `blocks` field (for example `pages.layout` with sections and nested blocks) can keep its block configs and its components. The builder gets a field of its own, one script copies the content over, and the old field stays until you remove it.

What carries over:

- **Block configs.** `fromPayloadBlocks()` turns Payload `Block` configs into builder blocks. Every field stays a Payload field config, so the inspector shows it with Payload's own inputs: text, textarea, email, code, number, checkbox, select, radio, date, upload, relationship, rich text, JSON, point, group, array, row, collapsible and tabs (also `hasMany` text and number).
- **Nested blocks fields become slots.** A `blocks` field at the block's own level (also inside rows, collapsibles and unnamed tabs) becomes a slot with the same name. Its `blocks` and `blockReferences` become the slot's `allow`.
- **Conditions.** An `admin.condition` that tests one sibling field, such as `(_, siblingData) => siblingData?.type === 'custom'`, becomes a JSON condition. The inspector hides the field, and an empty required field that is hidden does not block publishing.
- **Components.** `fromPayloadComponents()` renders components written for Payload's data (`{ blockType, ...fields }`) unchanged.
- **Content.** `migrateBlocksField()` converts every document, its drafts and its versions.

### Step by step

These steps assume a site like this: `pages.layout` is a `blocks` field that references section blocks (`fullWidth`, `twoColumn`) from `config.blocks`, and the sections have nested `blocks` fields (`content`, `leftColumn`, `rightColumn`) with leaf blocks.

**1. Install** the packages and add the canvas route, as in [Install](#install).

**2. Give the builder its own field.** Keep `layout` as it is.

```ts
websiteBuilder({
  collections: { pages: { field: 'builderLayout', url: (doc) => `/${doc.slug}` } },
  blocks,
  css: { entry: 'src/app/(frontend)/globals.css' },
})
```

If you give the builder the name of the existing `blocks` field (`field: 'layout'`), the app does not start, and the error points here.

**3. Make builder blocks from your block configs.** Put them in the client-safe blocks file:

```ts
// src/builder.ts
import { defaultBlocks, fromPayloadBlocks } from '@payload-toolkit/builder/blocks'
import { allLeafBlocks, allSectionBlocks } from './blocks'

const siteBlocks = fromPayloadBlocks([...allSectionBlocks, ...allLeafBlocks], {
  // The blocks the page's own blocks field allows. The others go only inside the sections that take them.
  root: ['fullWidth', 'twoColumn'],
  // Builder types become siteHeading, siteImage, …, so they do not clash with the default blocks.
  prefix: 'site',
})

export const blocks = [...defaultBlocks({ linkCollections: ['pages'] }), ...siteBlocks]
```

| Option | What it does |
|---|---|
| `references` | Your `config.blocks`, when the list you pass does not hold every block that `blockReferences` names. |
| `root` | Slugs that may go in the page's root list. Every other block gets `parents`: the blocks whose nested blocks fields take it, as in Payload. Default: every block may go anywhere. |
| `prefix` | Prefix for the builder `type` (`prefix: 'site'` turns `heading` into `siteHeading`). You need it when a slug is also a default block (`heading`, `image`, `button`, `richText`, `list`, `link`, …). The plugin refuses two blocks with the same type. Payload data keeps its `blockType`. |
| `styles` | Adds `className` and the Styles panel. Default `false`: your components style themselves. |
| `category` | Library group for blocks without `admin.group`. Default "Site sections" (blocks with slots) or "Site blocks". |
| `overrides` | Per slug: `label`, `category`, `icon`, `styles`, `defaultClassName`, `classes`, `ai`, `parents`, and `slots` (merged into a slot, for example `{ content: { allow: ['*'] } }`). |
| `onWarning` | Gets the messages about things that do not carry over. Default: `console.warn` outside production. `false` turns them off. |

`labels.singular` becomes the label, and `admin.group` the library category. `interfaceName`, `dbName`, `imageURL` and the block's own admin components are not used.

**4. Wrap your components.** Use the same map as your `RenderBlocks`, keyed by Payload slug:

```ts
// src/components/blocks.ts (client-safe)
import { fromPayloadComponents } from '@payload-toolkit/builder-react'
import { blocks } from '@/builder'
import { FullWidthComponent } from '@/blocks/sections/fullWidth/component'
import { HeadingLeaf } from '@/blocks/leaves/heading/component'

export const components = fromPayloadComponents({ fullWidth: FullWidthComponent, heading: HeadingLeaf /* … */ }, blocks)
```

Each component gets the props it always got: `{ id, blockType, blockName, ...fields }`. `loadLayoutData` loads uploads and relationships (one level deep), and missing fields get their `defaultValue`. Each slot arrives under its field name as an array of Payload-shaped blocks, so `<RenderLeaves blocks={content} />` keeps working. The component also gets a `builder` prop (see below).

**5. Convert the content.** Run a dry run first. It writes nothing and lists what it would do:

```ts
// scripts/migrate-blocks.ts
import config from '@payload-config'
import { formatMigrationReport, migrateBlocksField } from '@payload-toolkit/builder'
import { getPayload } from 'payload'

const payload = await getPayload({ config })
const report = await migrateBlocksField(payload, {
  collection: 'pages',
  from: 'layout',
  to: 'builderLayout',
  dryRun: !process.argv.includes('write'),
})
console.log(formatMigrationReport(report))
process.exit(0)
```

```bash
pnpm payload run scripts/migrate-blocks.ts         # dry run
pnpm payload run scripts/migrate-blocks.ts write   # convert
```

`payload run` drops `--flags`, so the script reads a plain word. The report gives:

- counts for documents and versions,
- the block types without a definition (left out),
- the fields with data that no definition has (left out),
- the layouts that need a fix in the builder (for example a select value that is no longer an option).

Close every builder tab while it runs. An open builder keeps its own copy of the layout and saves it again.

- Every document, every draft and every version is converted in place. No new versions are made, `updatedAt` stays, and the old field never changes.
- A second run skips documents whose builder field has content. `overwrite: true` converts them again (unchanged results are skipped).
- After a real run it refreshes the documents' "Used in" records (`backfillReferences`), because its writes skip the save hook.
- It writes through the database adapter (`updateOne`, `updateVersion`), so no hooks run. It compiles the CSS itself. Tested on Postgres. On MongoDB it converts the documents but not the versions.
- Options: `where` (only some documents), `versions: false`, `overwrite`, `blocks` (default: the plugin's blocks), `log`.

**6. Render pages with the builder.** Change the page route to `RenderLayout` with `page.builderLayout` and `page.builderLayoutCss` (see [step 7 of Install](#7-render-pages-on-the-site)). Pass your wrapped `components` to `RenderLayout` and to `BuilderCanvas`.

**7. Remove the old field later**, once every page renders from the builder. Until then, note that Publish in the builder publishes the whole document, the old field's latest draft included.

### Slots and existing components: the trade-off

A component that renders its children itself (`<RenderLeaves blocks={content} />`) works as it is: the site shows the same HTML. In the editor you can select, move and edit the block, and you can edit and move its children in the outline and the inspector. On the canvas you cannot click or drag those children, because your renderer does not give their elements the builder's block ids.

To make the children editable on the canvas, render the slot with `PayloadSlot`. In the builder it renders the builder's children (each with its block id) in an element that takes the slot's drop attributes. Outside the builder it renders your old code:

```tsx
import { PayloadSlot, type PayloadBlockProps } from '@payload-toolkit/builder-react'

export function TwoColumnComponent({ leftColumn, rightColumn, builder }: PayloadBlockProps<TwoColumnBlock>) {
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <PayloadSlot builder={builder} name="leftColumn" className="space-y-8">
        <RenderLeaves blocks={leftColumn} />
      </PayloadSlot>
      <PayloadSlot builder={builder} name="rightColumn" className="space-y-8">
        <RenderLeaves blocks={rightColumn} />
      </PayloadSlot>
    </div>
  )
}
```

The `builder` prop holds `mode`, `className`, `slots` (rendered children by slot name) and `slotAttributes`. In the canvas, the adapter puts the block id on your component's first element through a `display: contents` wrapper, so the layout stays as on the site. A component that renders nothing gets a small placeholder.

### Limitations

- **Classes in the editor.** The canvas compiles only the classes in the layout and in each block's `classes`. Your components' own Tailwind classes are missing there unless you list them (`overrides: { fullWidth: { classes: [...] } }`) or import your site's compiled CSS in the canvas layout (`src/app/(builder-canvas)/layout.tsx`). On the site, your own Tailwind build covers them as before.
- **Server components that fetch data** (for example a model grid that calls `payload.find`) cannot run in the canvas, which is a client page. Leave them out of the canvas map: the canvas shows "Name: no preview in the editor", and the block stays selectable. The site renders them as usual.
- **Custom admin components** on fields (a custom `Field`) need Payload's form, so the inspector shows the default input for the field type. `fromPayloadBlocks` lists them in a warning.
- **Conditions** that read the document, the user or several fields are not converted: the field always shows (also listed in a warning). `validate` functions, field hooks and function `defaultValue`s of block fields do not run in the builder.
- **Loaded data** is one level deep. A component that needs deeper data loads it itself.
- **Blocks fields inside a group, a named tab or an array** stay props, edited as JSON. Localized block fields are not supported.
- A Payload slug `list` with an `items` array is read as the old built-in list (`normalizeLayout`). Use `prefix` to avoid that.

## Sections

A section is a ready-made block tree: a hero, a feature grid, a footer. Editors insert it from the **Sections** tab. AI agents use sections as their main building unit.

```ts
import type { SectionDefinition } from '@payload-toolkit/builder'

export const sections: SectionDefinition[] = [
  {
    id: 'hero',
    label: 'Hero',
    category: 'Heroes',
    description: 'A large heading with a short text and a button.',
    blocks: [
      {
        id: 'b_hero',
        type: 'stack',
        className: 'flex flex-col items-center gap-6 py-24 text-center',
        slots: {
          children: [
            { id: 'b_title', type: 'heading', props: { text: 'Build faster', level: '1' }, className: 'text-5xl font-bold' },
            { id: 'b_cta', type: 'button', props: { label: 'Start', link: { type: 'url', url: '/contact' } } },
          ],
        },
      },
    ],
  },
]
```

Pass them to `websiteBuilder({ sections })` and to `builderMcpTools({ sections })`. Block ids are regenerated on every insert.

The library shows each section as a real picture: the hidden canvas page (`?mode=thumbnail`) renders one section at a time with your components and theme, at a desktop width of 1280 px, and the editor keeps the picture in IndexedDB. A picture changes when the section, the theme or the block definitions change. Cards show a wireframe until their picture is ready, or when it fails.

### Saved sections

Editors save their own sections: select a block (a whole section, or any block with its children), open **…** on the canvas or in the inspector, and choose **Save as section…**. Give it a name and, if you like, a category. It appears in **Add › Sections** under **Saved**, for everyone who edits pages. Insert it like any section; every insert gets new block ids. The card's **…** menu renames or deletes it. A deleted section stays on the pages that use it.

The plugin stores them in the `builder-sections` collection (next to Templates in the admin nav). The MCP tools and the AI assistant see them too: `listSections` lists them with `saved: true`, and `insertSection` takes `saved:<id>`, the document id or the section's name.

## Styling

- **Classes.** Each block stores Tailwind v4 classes in `className`. Variants use normal Tailwind syntax: `md:flex-row`, `hover:bg-primary`, `dark:text-white`.
- **Styles panel.** Visual controls for layout, spacing, size, position, typography, background, border and effects read and write classes. The breakpoint bar (`base`, `sm`, `md`, `lg`, `xl`, `2xl`) and the state bar (Default, Hover, Focus, Active) set the variant prefix. The **Classes** box accepts any class.
- **Theme tokens.** Classes compile against your CSS entry, so tokens from your `@theme` work: `bg-primary`, `font-heading`, `rounded-card`. The Styles panel lists your colors, fonts and sizes.
- **In the editor.** The canvas compiles the classes in the browser with Tailwind's own compiler. A new class shows at once.
- **On save.** The `beforeChange` hook compiles only the classes the layout uses and stores the CSS in `<field>Css` (`{ hash, css }`). The output holds the utilities, their `@property` and `@keyframes` rules, and the theme variables. It has no Preflight. `RenderLayout` writes it into a `<style>` tag, so the site does not need a Tailwind build of its own. If the site has one, import the same CSS entry in your site layout for Preflight and base styles.
- **Tailwind plugins.** Pass them as a map on the server and in the canvas page. The canvas page must be a client component, because plugins are functions:

```ts
// payload.config.ts
import typography from '@tailwindcss/typography'
websiteBuilder({ css: { entry: 'src/app/(frontend)/globals.css', plugins: { '@tailwindcss/typography': typography } } })
```

```tsx
// builder-canvas/page.tsx ('use client')
import typography from '@tailwindcss/typography'
const plugins = { '@tailwindcss/typography': typography }
export default function CanvasPage() {
  return <BuilderCanvas blocks={blocks} plugins={plugins} />
}
```

- **Theme variables in the canvas.** The canvas gets the Theme global from `<ThemeStyle live />` in its layout. If you set other variables at runtime, render the same tag in the canvas layout's `<head>`.
- **Standalone output** needs `outputFileTracingIncludes`. See [step 8](#8-add-the-standalone-tracing-lines).

## Theme

The plugin adds a **Theme** global (slug `theme-settings`). Editors pick the site's colors, fonts, corner radius and spacing unit with Payload-native color, font and slider pickers. The site and the builder canvas get the theme as CSS variables. Your Tailwind `@theme` maps those variables to classes, so `bg-primary`, `font-heading` and `rounded-lg` follow the theme.

**What editors set, and the variables it writes:**

| Field | Variables |
|---|---|
| Colors: primary, secondary, accent, muted, destructive | `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--accent`, `--accent-foreground`, `--muted`, `--muted-foreground`, `--destructive`, `--destructive-foreground` |
| Colors: background, foreground | `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--border`, `--input` |
| Derived from the colors | `--ring`, `--chart-1` … `--chart-5`, `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` |
| Fonts: body text, headings, code (any Google Font) | `--font-sans`, `--font-heading`, `--font-mono` |
| Corner radius (rem) | `--radius` |
| Spacing unit (px) | `--spacing` (Tailwind's spacing unit: `p-4` is 4 units) |

The names are the shadcn/ui names. Colors are stored as hex and written as `oklch(…)`. Each foreground color is dark or light, whichever reads on its color. Borders and secondary text are mixed from the background and the foreground. An empty field writes nothing, so your CSS default stays.

**1. Map the variables in your CSS entry.** Your `globals.css` stays yours. Set defaults on `:root` and map them in `@theme inline`:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --radius: 0.625rem;
  /* …the other colors you use */
}

@theme {
  --font-sans: ui-sans-serif, system-ui, sans-serif; /* the theme's body font replaces it */
  --font-heading: var(--font-sans);                   /* `font-heading`; the theme's heading font replaces it */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  /* …one --color-* line per color you use */
}
```

A shadcn/ui project already has all of this. Font aliases work too: with `--font-display: var(--font-heading, var(--font-sans))`, `font-display` uses the heading font, or the body font when the theme has no heading font.

**2. Render the theme in the `<head>`** of the site's root layout, and of the canvas layout with `live` ([step 6](#6-add-the-canvas-route)):

```tsx
// src/app/(frontend)/layout.tsx
import { ThemeStyle } from '@payload-toolkit/builder-react/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import type { ReactNode } from 'react'
import './globals.css'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const payload = await getPayload({ config })
  return (
    <html lang="en">
      <head>
        <ThemeStyle payload={payload} />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

`ThemeStyle` writes one `<style>` tag and one Google Fonts `<link>` for the chosen families. Both use React's `precedence`, so React places them in the `<head>` itself and they never cause a hydration mismatch. The rule uses `:root:root { … }`, so it wins over your `:root` defaults in any load order.

| Prop | Default | What it does |
|---|---|---|
| `payload` | required | The Payload instance. |
| `fonts` | `true` | `false` leaves the Google Fonts links out (for self-hosted fonts). |
| `live` | `false` | Reloads the theme in the browser when the global is saved in another tab, or when the page becomes visible again. Use it in the canvas layout. |

Other frontends: `loadTheme(payload)` from `@payload-toolkit/builder-react/server` returns `{ data, css, fontsHref }`. `themeOutput(doc)` from `@payload-toolkit/builder/theme` turns any theme document into the same output. `GET /api/builder/theme` returns it over HTTP.

**Caching.** `ThemeStyle` reads the global once per request, never from Next's data cache. After each save the plugin calls `revalidateTag(<cacheTag>, { expire: 0 })` and `revalidatePath('/', 'layout')`, so statically rendered pages render again with the new theme. Tag your own cached theme reads with the cache tag. Saves with `context: { disableRevalidate: true }` (seed scripts) skip this.

**Styles panel.** The color swatches read the canvas, so they show the theme's colors. The Font list shows the theme's families ("Inter", not `var(--font-sans)`).

**Options:**

```ts
websiteBuilder({
  // …
  theme: {
    slug: 'theme-settings',        // default
    label: 'Theme',                // default
    access: { update: isAdmin },   // default: anyone reads, signed-in users update
    admin: { group: 'Settings' },  // merged into the global's admin config (group, livePreview, …)
    hooks: { afterChange: [log] }, // run after the plugin's own hooks
    cacheTag: 'theme-settings',    // default: the slug
  },
})
```

`theme: false` leaves out the global, the endpoint and the theme fonts in the Styles panel. The plugin throws an error if a global with the same slug exists already.

**The pickers on other fields.** They work on any text field (the slider also on number fields):

```ts
{ name: 'brandColor', type: 'text', admin: { components: { Field: '@payload-toolkit/builder/theme-client#ThemeColorField' } } }
{ name: 'titleFont', type: 'text', admin: { components: { Field: '@payload-toolkit/builder/theme-client#ThemeFontField' } } }
{ name: 'gap', type: 'number', admin: { components: { Field: '@payload-toolkit/builder/theme-client#ThemeSliderField' }, custom: { min: 0, max: 64, step: 4, unit: 'px' } } }
```

## Templates and binding

Templates let one layout render many documents, for example every post. Turn them on per collection:

```ts
websiteBuilder({
  collections: {
    pages: { url: (doc) => `/${doc.slug}` },
    posts: { templates: true, url: (doc) => `/blog/${doc.slug}` },
  },
  templates: { slug: 'builder-templates' },   // optional; this is the default
  // ...
})
```

What the plugin adds:

- A templates collection (`builder-templates`) with drafts and the builder. Each template has a target collection (`targetCollection`), a "default for this collection" checkbox (`isDefault`) and a sample document for the editor preview (`previewDocument`).
- A `template` relationship in the sidebar of every document in a collection with `templates: true`.

Which template a document uses: its own `template`, else the newest default template of its collection, else none. Templates with an empty layout are skipped.

### Bindings and dynamic blocks

- A **binding** connects a block prop to a document field: `bindings: { "text": "title", "image": "author.avatar" }`. Paths are dot paths from the document root. At render time the prop takes the document's value. A missing value falls back to the prop's own value. In the editor, the binding picker lists only compatible fields of the target collection, including one relationship hop.
- The **Field** block (`field`) shows one field of the document by path, rendered by its type: rich text, an upload as an image, a date, a relationship's title, or text. Use it for the post body.
- The **Collection list** block (`collectionList`) lists the latest documents of a collection (`collection`, `limit`, `sort`, `excludeCurrent`). Its `item` slot is the design of one item and repeats for every document. Blocks in it bind to the item's fields, for example a heading with `bindings: { "text": "title" }` and a link with `bindings: { "link": "$url" }` (the item's URL from the collection's `url` option). The site shows published documents only. It works on normal pages too, not only in templates.

### Render a document through its template

```tsx
import { RenderLayout } from '@payload-toolkit/builder-react'
import { loadLayoutData, loadTemplate } from '@payload-toolkit/builder-react/server'

// depth: 1, so bound uploads and relationships are documents, not IDs
const { docs } = await payload.find({ collection: 'posts', where: { slug: { equals: slug } }, limit: 1, depth: 1, draft })
const post = docs[0]
if (!post) notFound()

const found = await loadTemplate(payload, { collection: 'posts', doc: post, draft })
if (!found) notFound()   // or render a fallback

const context = { collection: 'posts', doc: post }
const layout = await loadLayoutData(found.layout, blocks, payload, { draft, context, resolveLink })

return <RenderLayout layout={layout} css={found.css} context={context} blocks={blocks} resolveLink={resolveLink} />
```

- `loadTemplate(payload, { collection, doc, templatesSlug?, draft? })` returns `{ template, layout, css }` or `null`. Without `draft` it uses published templates only.
- `loadLayoutData(layout, blocks, payload, { draft, context, resolveLink })` resolves bindings and Field blocks against `context`, loads collection lists, and loads upload and relationship props. Pass the same `context` to `RenderLayout`.
- `getByPath(doc, path)` and `resolveBindings(layout, context, blocks)` from `@payload-toolkit/builder/core` do the same work for a custom renderer.

## References and Used in

A layout is one JSON value, so Payload cannot see which images and documents a page uses. The plugin keeps a list of them in a hidden field. With it, Payload shows where a media file is used, refuses to delete a file that a page still uses, and gives search and sitemap code clean relation data.

What the plugin adds:

- **A hidden `builderRefs` field** on every builder collection, the templates collection and the saved sections collection. It is a polymorphic `relationship` field with `hasMany`. It points at every collection the blocks can reference: the `relationTo` of upload and relationship props, the collections of link fields, and the upload collections when a block has a rich text prop.
- **A save hook** that fills the field from the layout on every save that sends the layout: the live session's draft saves, publish, the Edit view, the REST API and the Local API. The field is server-owned. The hook ignores values that clients send. A save without the layout keeps the stored list.
- **"Used in"** on the media collection: a "Used in" section in the edit view lists the pages, posts, templates and sections that use the file, one Payload `join` field per builder collection (`usedInPages`, `usedInBuilderTemplates`, …). Empty lists are hidden. The REST and Local APIs return the same join fields.
- **Delete protection** on the media collection: deleting a file that a builder document still uses fails with "This document is still used by Home (Pages), About (Pages) and 3 more. Remove it from those documents first." The edit view, the list view's bulk delete and the API all show this message.

What counts as a reference:

- Upload and relationship props, also inside groups, arrays, blocks fields and named tabs. Nested slots and hidden blocks count.
- Link groups (`linkField()`) of type "Page or document". A URL link that still holds an old document choice does not count.
- Upload, relationship and internal link nodes in rich text props.
- Not bindings: a bound prop reads the rendered document at runtime, so it has no fixed ID. The prop's own value (its fallback) counts.
- IDs of documents that do not exist are left out, so a save never fails on a deleted image.

Which version counts. Collections with drafts have two states. The delete protection checks both the published document and the latest draft. "Used in" in the admin shows the latest drafts. When a draft no longer uses a file but the published page still does, the delete is refused, but "Used in" does not list that page. Publish the page, then delete the file.

Options:

```ts
websiteBuilder({
  // ...
  references: {
    field: 'builderRefs',          // name of the hidden field
    usedIn: ['media', 'forms'],     // collections that show "Used in"; default: the upload collections the blocks use
    protectDelete: ['media'],       // collections that refuse to delete used documents; default: the same upload collections
    maxListed: 5,                   // how many documents the error message names
  },
})
```

- `references: false` turns all of this off.
- To delete a used document anyway, pass the context flag: `payload.delete({ collection: 'media', id, context: { builderForceDelete: true } })` (`FORCE_DELETE_CONTEXT` from `@payload-toolkit/builder`). Postgres removes the deleted document from every `builderRefs` list.
- `findReferrers(payload, { relationTo: 'media', value: id })` from `@payload-toolkit/builder` returns the builder documents that use a document (published and latest draft), for your own checks.
- Search and sitemaps can query the field like any relationship: `where: { builderRefs: { equals: { relationTo: 'media', value: id } } }`.

**Existing documents.** Documents saved before this version have an empty list until their next save. To fill them now, run the backfill once:

```ts
// scripts/backfill-references.ts — run with `pnpm payload run ./scripts/backfill-references.ts`
import { getPayload } from 'payload'
import config from '@payload-config'
import { backfillReferences } from '@payload-toolkit/builder'

const payload = await getPayload({ config })
console.log(await backfillReferences(payload))
process.exit(0)
```

It writes only the `builderRefs` field of each document and of each latest draft, through the database adapter: no hooks run, no new versions, and `updatedAt` does not change. It skips documents that are already right, so you can run it again.

**Database schema.** The field adds rows to the builder collections' `_rels` tables (and their version tables). In development, `pnpm dev` pushes the change. Before a production deploy, create a migration with `pnpm payload migrate:create`.

## AI assistant

The editor gets an **Assistant** panel. The user types a request, for example "add a pricing section with three tiers", and the model edits the open page. Each change appears on the canvas as it happens. One reply is one undo step. The assistant never saves or publishes: the editor saves the page as usual.

It works with OpenRouter, Cloudflare AI Gateway, any OpenAI-compatible API (OpenAI, Groq, Ollama, …) and Anthropic. Full guide: [docs/ai/providers.md](https://github.com/jon8800/payload-toolkit/blob/main/docs/ai/providers.md).

No API key? Claude Code and Codex can edit pages with your Claude or ChatGPT plan over MCP: [docs/ai/connect-claude-code-and-codex.md](https://github.com/jon8800/payload-toolkit/blob/main/docs/ai/connect-claude-code-and-codex.md). The panel shows the commands (link icon in its header).

### Turn it on

```ts
websiteBuilder({
  collections,
  blocks,
  sections,
  css: { entry: 'src/app/(frontend)/globals.css' },
  ai: {},
})
```

Then give the server a key. The quickest is an [OpenRouter](https://openrouter.ai/keys) key in `.env`; restart the server after:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

With only that key set, the plugin uses OpenRouter and the cheap model `openai/gpt-6-luna`. Other setups:

```bash
BUILDER_AI_PROVIDER=openrouter          # anthropic | openrouter | cloudflare | openai-compatible
BUILDER_AI_MODEL=google/gemini-3.8-flash
```

Or set the provider in code. Code wins over the environment:

```ts
ai: { provider: { type: 'openrouter' }, model: 'google/gemini-3.8-flash' }
ai: { provider: { type: 'cloudflare', accountId: '…', gatewayId: 'my-gateway' }, model: 'openai/gpt-5.2' }
ai: { provider: { type: 'openai-compatible', baseURL: 'http://localhost:11434/v1' }, model: 'llama3.3' }
ai: { provider: { type: 'anthropic' } } // needs `pnpm add @anthropic-ai/sdk` and ANTHROPIC_API_KEY
```

Without a key the panel shows a setup card that names the variable to set.

### Options

| Option | Default | What it does |
|---|---|---|
| `provider` | from the environment | Which API: see above and [providers.md](https://github.com/jon8800/payload-toolkit/blob/main/docs/ai/providers.md). |
| `model` | `BUILDER_AI_MODEL`, else `claude-opus-5-5` (Anthropic) or `openai/gpt-6-luna` (OpenRouter) | The model id in the provider's naming. Required for Cloudflare and OpenAI-compatible. |
| `effort` | `medium` (Anthropic) | How much the model thinks: `low`, `medium`, `high`, `xhigh`, `max`. OpenRouter gets it as `reasoning.effort` when set. Others ignore it. |
| `apiKey` | the SDK's own lookup | Anthropic only: an explicit API key. Other providers take `apiKey` inside `provider`. |
| `instructions` | none | Extra rules for the assistant, for example your brand voice. Added to the end of the system prompt. |
| `maxSteps` | `12` | Maximum tool rounds per user message. |
| `maxTokens` | `32000` (Anthropic) | Output limit per model call. Sent to OpenAI-compatible APIs only when set. |
| `mediaCollection` | `media` | The upload collection the assistant picks images from. |
| `fallbacks` | on for `claude-opus-5-5` | Anthropic only: when a safety classifier declines a request, the API retries it on Anthropic's recommended fallback model. |

### What it can do

- Insert ready-made sections and then change their text, images and classes. It prefers your sections over building from single blocks.
- Add, move, duplicate, hide and remove blocks, and change props and Tailwind classes. It knows your theme colors, fonts and breakpoints, the selected block and the canvas width.
- Pick images from the media library (it searches alt text and file names as the signed-in user).
- In templates, bind block props to document fields.

Every change goes through the same operations as the editor and is checked against the block schemas. A change that would make the layout invalid is rolled back, and the model gets the error and tries again.

### Access

`POST /api/builder/ai/chat` needs a signed-in user who may update the document (Payload access control, `overrideAccess: false`). Media searches run as that user too.

### Cost

You pay the provider for each request. Each request sends the system prompt (blocks, sections, theme, tools; about 8,000 tokens in the starter), the conversation and the current layout. A typical request ("add a pricing section") takes two to four model calls.

- OpenRouter `openai/gpt-6-luna` ($0.10 / $0.50 per million tokens): well under one US cent per request.
- Anthropic `claude-opus-5-5` at `medium` effort ($4 / $20 per million tokens): roughly 5 to 30 US cents per request. The fixed prompt is cached, so repeat requests within 5 minutes read it at a tenth of the price or less.

Long conversations and large pages cost more. Start a new conversation when the topic changes. Changing the provider or model starts a new chat.

### Privacy

The page content goes to the provider you pick (and through OpenRouter or Cloudflare when you use them): the layout JSON (all text, classes and media IDs), the conversation, media search results (alt text, file names, URLs), and for templates a summary of the sample document. Do not turn the assistant on for content that must not leave your servers. Check the provider's data policy.

### Testing without a key

`BUILDER_AI_FAKE=1` (test only, ignored when `NODE_ENV=production`) replaces the model with a scripted one, for every provider, with no network calls. It inserts the first hero section at the top of the page, then changes its heading, and streams a few sentences. Use it to try the panel without an API key.

## AI editing over MCP

The builder adds tools to [`payload-mcp-toolkit`](https://www.npmjs.com/package/payload-mcp-toolkit). An AI agent reads the blocks and sections, edits the draft layout, and every open editor shows the change at once.

```bash
pnpm add payload-mcp-toolkit zod
```

```ts
import { mcpToolkitPlugin } from 'payload-mcp-toolkit'
import { builderMcpTools } from '@payload-toolkit/builder/mcp'

const collections = { pages: { url: (doc) => `/${doc.slug}` } }

plugins: [
  mcpToolkitPlugin({
    customTools: builderMcpTools({ blocks, sections, collections }),
  }),
  websiteBuilder({ collections, blocks, sections, css: { entry: 'src/app/(frontend)/globals.css' } }),
]
```

- Agents connect to `POST <your site>/api/mcp` with an API key from **Admin > MCP > API Keys**. Claude Code and Codex setup: [docs/ai/connect-claude-code-and-codex.md](https://github.com/jon8800/payload-toolkit/blob/main/docs/ai/connect-claude-code-and-codex.md).
- Tools (`listSections` and `insertSection` include [saved sections](#saved-sections)): `listBlocks`, `getBlockSchema`, `listSections`, `insertSection`, `getLayout`, `applyOperations`, `validateLayout`, `getPreviewUrl`, plus `listTemplates` and `getBindingSources` for templates.
- Every tool checks the key's access to the collection. Handlers run as the key's user with `overrideAccess: false`.
- Writes are commits to the document's live session, like an editor's own changes. Open editors show them at once, and the agent appears in the collaborator list while it works. The draft is saved about a second later. `getLayout` returns the session's layout, unsaved changes included.
- `builderMcpTools` options: `blocks`, `sections`, `collections` (the same map as the plugin), `siteUrl` (default: Payload `serverURL`, then `NEXT_PUBLIC_SERVER_URL`), `apiKeyCollection`.

## Multiplayer editing

Several people can have the same page open in the builder. Each change shows for the others at once, with their selections and pointers in their own color. AI agents over MCP join the same way.

How it works:

- The server keeps one live session per open document, in memory. The session holds the layout and a sequence number `seq`.
- An editor applies its own change at once, then sends it to `commit`. The server applies changes in the order they arrive, raises `seq` by 1, and sends each change to every open editor. A change that no longer applies (for example, someone deleted its block) is rejected, and that editor drops it.
- The server saves the session as a draft about 1 second after the last change (at the latest every 5 seconds). The save runs as the person who made the last change, with their access rules, and the normal save hook compiles the CSS.
- While a session is open, the session owns the layout. Any other save of the document gets the session's layout: a stale autosave from another tab, a REST update, or **Publish**. Publish therefore publishes what everyone sees in the editor.
- Every editor gets a `saved` event after each save and a `published` event after Publish, Unpublish or Revert, so the top bar shows the same status for everyone.
- The session closes 60 seconds after the last editor leaves and its draft is saved.

The other fields (title, slug, SEO, …) are edited in Payload's Edit view or in the builder's **Page settings** drawer. They are protected in two ways:

- **Payload's document lock stays on.** The first person who changes a field in the Edit view or the settings drawer takes the lock. A second person who opens the form sees Payload's "locked by" dialog and can view it read-only or take over. The builder view itself never takes the lock, so layout editing, Publish, Unpublish, Revert and AI edits keep working while someone has the form open. These saves skip the lock and keep it.
- **Out-of-date forms cannot undo newer changes.** Payload removes the lock after every save of the lock holder, autosave included, so on a collection with autosave the lock is often gone. The plugin therefore also checks each save from the Edit view or the drawer. If the form was loaded before someone else changed a field, and the save would put back the old value, the save fails with 409: "Not saved. Ana changed Title after you opened this form. Reload it to get their changes, then make your edit again." The record of who changed what lives in server memory, so it starts empty after a restart. Two tabs of the same person are not checked against each other.

To turn the lock off for a collection, set `lockDocuments: false` on it. The out-of-date check still runs.

Limits:

- Sessions live in the memory of one server process. With more than one app server, route all requests for a document to the same server (sticky routing), or keep one app server.
- Two people who change the same prop at the same time: the later change wins.
- On SIGINT/SIGTERM the plugin saves unsaved session edits before the process exits. To make that possible, it holds back `process.exit` for at most 3 seconds, and only while unsaved edits exist. A hard kill (`SIGKILL`, a crash) can still lose the last 1–5 seconds of edits.
- Two people typing in the same text field at the same moment: the later value wins for the whole field.

## Production and Docker

- **Database schema.** In development, Payload's Postgres adapter pushes schema changes on `pnpm dev`. For production, create migrations with `pnpm payload migrate:create` and run them on start with `prodMigrations` in `postgresAdapter`, or run `pnpm payload migrate` in your deploy step. Never run `payload migrate` against a development database that uses push.
- **Standalone output** needs `outputFileTracingIncludes`. See [step 8](#8-add-the-standalone-tracing-lines).
- **Media.** Keep `public/media` (or your upload directory) on a volume.
- **Secrets.** `PAYLOAD_SECRET` and `DATABASE_URL` are read at runtime.
- The starter app in this repository has a working `Dockerfile` for a pnpm monorepo.

## Deploying

Run **one server process** for the app. Live sessions, the event streams and the record that protects the other fields live in that process's memory. Several app servers, a cluster or a serverless platform would split one document's editors across processes, and they would not see each other's edits.

Put a reverse proxy in front for TLS. This nginx config works:

```nginx
server {
  listen 443 ssl;
  http2 on;                      # recommended, see below
  server_name example.com;
  # ssl_certificate …; ssl_certificate_key …;

  client_max_body_size 50m;      # media uploads

  gzip on;                       # the app has compress: false, so nginx compresses
  gzip_proxied any;
  gzip_types text/css application/javascript application/json image/svg+xml text/x-component;
  # text/html is always compressed. text/event-stream is not in the list, so it stays uncompressed.

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';   # HTTP/1.1 to the app, without "Connection: close"
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Notes:

- **The event stream must not be buffered.** The live endpoint (`/api/builder/live/…/events`) sends `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform`, so nginx streams it and compression skips it. Next's own compression is off (`compress: false`, install step 9), so the stream is never compressed inside the app either. Behind nginx, an edit reaches the other editors in about 10 ms. With another proxy or a CDN, turn off response buffering and compression for `text/event-stream`.
- **Idle streams stay open.** The server sends a heartbeat every 10 s (`live.heartbeatMs`). That is well inside nginx's default `proxy_read_timeout` of 60 s. If you raise the heartbeat interval, keep it below your proxy's read timeout.
- **Use HTTP/2 to the browser.** Over HTTP/1.1 a browser opens at most 6 connections per site, and each open builder tab keeps one of them for its event stream. With several builder tabs open, the admin and the site in the same browser start to wait for connections. HTTP/2 sends everything over one connection.
- **Database schema.** This version keeps Payload's document lock on for builder collections (earlier versions set `lockDocuments: false`). That adds one column per builder collection to `payload_locked_documents_rels`. Create a migration (`pnpm payload migrate:create`) and run it before you start the new version, or every save of a builder document fails with "column … does not exist".
- **References need a migration too.** The `builderRefs` field (see [References and Used in](#references-and-used-in)) adds columns to the `_rels` tables of every builder collection and their version tables. Create a migration with `pnpm payload migrate:create` before you deploy, then run `backfillReferences(payload)` once.

## Troubleshooting

**The admin crashes with errors from `@payloadcms/ui` hooks (for example a missing provider), or fields render blank.** Your app has two copies of `@payloadcms/ui`. Check:

```bash
pnpm why @payloadcms/ui
```

All entries must show one version. Pin `payload`, `@payloadcms/*` and `next` to the same versions across your workspace, then run `pnpm install`. In a monorepo, check that the app and the builder resolve to the same folder: `readlink -f node_modules/@payloadcms/ui` (or `Get-Item node_modules\@payloadcms\ui | Select-Object Target` in PowerShell).

**The builder is empty, or the log says the layout field "is no longer a top-level field".** Another plugin moved the field into tabs after the builder added it (for example `seoPlugin({ tabbedUI: true })`). Put `websiteBuilder` last in `plugins`.

**"Collection "x" does not exist".** The plugin runs before the collection is added. Add the collection in `collections`, or put `websiteBuilder` after the plugin that adds it.

**The builder shows "Module not found", "not found" or no editor.** Run `pnpm payload generate:importmap` after you add or update the plugin.

**The canvas stays blank or shows "Canvas CSS failed to load".** Check that `/builder-canvas` (or your `canvasPath`) renders, that it uses a root layout with `<html>` and `<body>`, and that `css.entry` points to a file that exists.

**A class shows in the editor but not on the site.** The site must pass `css={page.<field>Css?.css}` to `RenderLayout`. Classes that a component hardcodes must be listed in the block's `classes`.

**The production log repeats `MaxListenersExceededWarning: 11 drain listeners added to [Gzip]`.** Next's built-in compression leaks one listener per backpressure event while it streams a large HTML page. The builder does not cause it. Set `compress: false` in `next.config.ts` and compress in your reverse proxy. See install step 9.

**Saving fails in production with "Cannot read stylesheet".** Standalone output is missing a CSS file. Add it to `outputFileTracingIncludes`.

**Saving fails with "Tailwind plugin "x" is used by @plugin in the CSS entry but is not in the plugins map".** Add the plugin to `css.plugins` and to the canvas page's `plugins`.

**"Collection "pages" already has a "blocks" field named "layout"".** The builder needs a `json` field. Give it its own name (`field: 'builderLayout'`) and convert the content: see [Using existing Payload blocks](#using-existing-payload-blocks).

**"Two blocks have the type "heading"".** A block made with `fromPayloadBlocks` has the same type as another block. Set `prefix` in `fromPayloadBlocks`.

**After adding `payload-mcp-toolkit`, `user.email` fails to typecheck.** The toolkit adds an API-key auth strategy, so `req.user` and `payload.auth()` can return an API key. Check `'email' in user` before you read user fields.

**Turbopack.** The packages work with Turbopack (`next dev` and `next build`, the default in Next 16) and webpack. They ship `.scss` files for the admin, which Next compiles the same way it compiles Payload's own SCSS.

## License

MIT

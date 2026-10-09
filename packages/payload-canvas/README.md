# Payload Canvas

<p align="center">
  <a href="https://github.com/jon8800/payload-canvas/blob/main/docs/media/drag-and-drop.mp4"><img src="https://raw.githubusercontent.com/jon8800/payload-canvas/main/docs/media/drag-and-drop.gif" width="960" alt="Dragging a section on the canvas while the other sections slide out of the way, reordering it in the Layers tree, and dropping a ready-made section onto the page"></a>
</p>

<table>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/jon8800/payload-canvas/main/docs/media/builder-dark.png" alt="The builder with a button selected and the Styles panel open"><br><sub>The full-screen builder: Layers, the live canvas, and the Styles panel.</sub></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/jon8800/payload-canvas/main/docs/media/ai-assistant.png" alt="The AI assistant after the request 'Make the hero headline punchier'"><br><sub>The AI assistant edits the page from a prompt.</sub></td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/jon8800/payload-canvas/main/docs/media/multiplayer.png" alt="Another editor's cursor and selection on the canvas"><br><sub>Multiplayer: another editor's cursor and selection show live.</sub></td>
    <td><img src="https://raw.githubusercontent.com/jon8800/payload-canvas/main/docs/media/sections.png" alt="The Sections tab with section thumbnails"><br><sub>Ready-made sections with real thumbnails.</sub></td>
  </tr>
</table>

A visual page builder for Payload CMS 3. It adds a full-screen builder to the collections you choose. Editors drag blocks onto a live canvas, nest them without limit, and style them with Tailwind classes. AI agents can build and edit the same pages over MCP, and an open editor shows each AI change as it happens.

The npm package is `payload-canvas`.

- Works in any Payload 3.90+ app on Next.js 16 and React 19.
- The layout is one JSON field per document. Nothing changes in your other fields.
- The site renders the layout with `payload-canvas/react` (React Server Components), or with your own renderer.
- Save, drafts, autosave, versions and access control stay Payload's own.
- Several people (and AI agents) can edit one page at the same time. See [Multiplayer editing](#multiplayer-editing).

One package holds everything: the Payload plugin and admin editor (`payload-canvas`), and the React renderer and canvas runtime for your site (`payload-canvas/react`). See [Entry points](#entry-points).

**Quick start.** Add the builder to an existing Payload app with the [install guide](#install) (about ten minutes). Or create a new project from the starter app:

```bash
npx create-payload-canvas my-website
```

## Contents

1. [Requirements](#requirements)
2. [Install](#install)
3. [The builder view](#the-builder-view)
4. [Inline editing](#inline-editing)
5. [Plugin options](#plugin-options)
6. [Rendering the layout on your site](#rendering-the-layout-on-your-site)
   - [Custom components](#custom-components)
7. [Server components in the canvas](#server-components-in-the-canvas)
8. [Custom blocks](#custom-blocks)
   - [Validation, hooks and access on block fields](#validation-hooks-and-access-on-block-fields)
9. [Using existing Payload blocks](#using-existing-payload-blocks)
10. [Sections](#sections)
11. [Styling](#styling)
12. [Animations](#animations)
13. [Theme](#theme)
14. [Templates and binding](#templates-and-binding)
15. [References and Used in](#references-and-used-in)
16. [Localization](#localization)
17. [AI assistant](#ai-assistant)
18. [AI editing over MCP](#ai-editing-over-mcp)
19. [Multiplayer editing](#multiplayer-editing)
20. [Production and Docker](#production-and-docker)
21. [Deploying](#deploying)
22. [Troubleshooting](#troubleshooting)
23. [Limits](#limits)

## Requirements

- `payload`, `@payloadcms/ui`, `@payloadcms/richtext-lexical` 3.90 or later (Payload 3 only, not the Payload 4 canary)
- `next` 16.3 or later, `react` and `react-dom` 19.2 or later
- `tailwindcss` 4.3 or later (the plugin compiles your Tailwind entry CSS)
- Node.js 20.9 or later
- Any Payload database adapter. Postgres and SQLite store the layout as `jsonb`/JSON.

You do not need `transpilePackages` or a `sass` install. The package ships compiled JavaScript. The admin styles are `.scss` files, and Next compiles them with the `sass` that `@payloadcms/next` already installs, the same way it compiles Payload's own admin styles.

Peer dependencies:

| Package | Range | Needed for |
|---|---|---|
| `payload`, `@payloadcms/ui`, `@payloadcms/richtext-lexical` | `^3.90.0` | everything |
| `next` | `^16.3.0` | everything |
| `react`, `react-dom` | `^19.2.0` | everything |
| `tailwindcss` | `^4.3.0` | the CSS compile on save and in the canvas |
| `@anthropic-ai/sdk` | `>=0.131.0`, optional | only the `/ai/anthropic` adapter |
| `payload-mcp-toolkit` | `>=0.9.0`, optional | only `builderMcpTools()` (`/mcp`) |
| `zod` | `^3.25 \|\| ^4`, optional | only `builderMcpTools()` (`/mcp`) |

## Install

These steps start from a blank Payload app with Postgres:

```bash
npx create-payload-app@latest -n my-site -t blank --db postgres --use-pnpm
```

They were tested step by step on such an app with Payload 3.90.2, Next.js 16.3.3, React 19.2.6, Tailwind 4.3.3, TypeScript 5.7 and pnpm 10, in `next dev` and in `next build` + `next start`. An existing Payload app works the same way: skip what you already have.

### 1. Add the package

```bash
pnpm add payload-canvas tailwindcss @tailwindcss/postcss postcss
```

With npm: `npm install payload-canvas tailwindcss @tailwindcss/postcss postcss`.

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

The plugin, the site and the canvas must use the same block list. Put it in its own file. Import blocks from `payload-canvas/blocks`: that entry has no server code, so client components can import it too.

```ts
// src/builder.ts
import { defaultBlocks } from 'payload-canvas/blocks'

export const blocks = defaultBlocks({ mediaCollection: 'media', linkCollections: ['pages'] })
```

### 4. Add the Tailwind entry CSS

This file is your site's CSS. The plugin also compiles each page's classes from it. The variables on `:root` are defaults: the plugin's **Theme** global overrides them, so editors can change the colors, fonts and radius in the admin. See [Theme](#theme).

```css
/* src/app/(frontend)/globals.css */
@import "tailwindcss";

/* Defaults. The Theme global (admin > Theme) overrides them. */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.55 0.2 260);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --border: oklch(0.922 0 0);
  --radius: 0.625rem;
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
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-border: var(--border);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

```js
// postcss.config.mjs
export default {
  plugins: { '@tailwindcss/postcss': {} },
}
```

The site layout imports this file in [step 7](#7-render-pages-on-the-site). The blank template has `src/app/(frontend)/styles.css` with a dark style for its welcome page, and its rules fight Tailwind's. Delete the file and the `import './styles.css'` line in `src/app/(frontend)/page.tsx`. Step 7 replaces the layout that imports it too.

### 5. Add the plugin

```ts
// src/payload.config.ts
import { websiteBuilder } from 'payload-canvas'
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

The editor shows the page in an iframe. The iframe loads a route in your app, so the canvas uses your real block components and your CSS. Give the route its own root layout, without your site header and footer, and import your site's CSS in it.

```tsx
// src/app/(builder-canvas)/layout.tsx
import { ThemeStyle } from 'payload-canvas/react/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import type { ReactNode } from 'react'

// Your site's CSS: it holds every class Tailwind found in your files.
import '../(frontend)/globals.css'

export default async function CanvasLayout({ children }: { children: ReactNode }) {
  const payload = await getPayload({ config })
  return (
    <html lang="en">
      {/* The same body classes as your site layout. */}
      <body className="font-sans antialiased">
        {/* The Theme global's variables and fonts (React moves them into the head). `live` reloads
            them after a theme save. Not in a <head> element: `live` adds a client component, and
            Next's metadata then fails to hydrate on some loads. */}
        <ThemeStyle payload={payload} live />
        {children}
      </body>
    </html>
  )
}
```

```tsx
// src/app/(builder-canvas)/builder-canvas/page.tsx
'use client'

import { BuilderCanvas } from 'payload-canvas/react/canvas'
import { blocks } from '@/builder'
import { builderCanvas } from './actions'

export default function CanvasPage() {
  return <BuilderCanvas blocks={blocks} server={builderCanvas} />
}
```

```ts
// src/app/(builder-canvas)/builder-canvas/actions.ts
'use server'

import config from '@payload-config'
import { createCanvasServer, type CanvasServerRequest } from 'payload-canvas/react/server'
import { blocks } from '@/builder'

const canvas = createCanvasServer({ config, blocks })

export async function builderCanvas(request: CanvasServerRequest) {
  return canvas(request)
}
```

The server action renders the blocks the canvas cannot render itself: server components that load data. It is optional. Without it, those blocks show "Name: no preview in the editor". See [Server components in the canvas](#server-components-in-the-canvas).

How the canvas gets its CSS, in this order:

1. **Your site's CSS.** Tailwind puts every class it finds in your files into it, so your components' own classes work on the canvas as on the site. Blocks do not have to list them in `classes`.
2. **The theme** (`ThemeStyle`). Its `:root:root` rule wins over the `:root` defaults in your CSS.
3. **The CSS for the classes in the layout** and in each block's `classes`. The canvas compiles it in the browser (about 4 ms per new class) from the same entry file as the save hook, and puts it after your CSS. On the site, the generated CSS also comes after your CSS, so the canvas shows the same result. This CSS also holds Preflight and your base styles a second time. Both copies come from the same entry file, so they are identical and change nothing.

The generated CSS styles only block elements, so it never changes the order of your own classes. Every rule in it matches only elements with the class `builder-css`, and `RenderLayout` adds that class to the `className` of every block with classes. Example: a header layout uses `flex`, and your component has `flex md:grid`. Your component's element has no `builder-css`, so the generated `flex` does not reach it, and your site's CSS makes it `grid` from `md` up. A block's element has all its classes in the generated CSS, which is in Tailwind's order and comes last. The rules use `:where(.builder-css)`, which adds no specificity.

Earlier versions told you to leave your site's CSS out of the canvas, because the canvas compiles the full CSS for the layout's classes itself. That missed the classes your components use themselves. If you skip the import, the canvas still works, but only the classes in the layout and in each block's `classes` have CSS.

The same page also renders the library's section thumbnails: the editor loads it hidden, with `?mode=thumbnail`, when the **Sections** tab needs pictures. Nothing to add for that. A thumbnail copies the page's stylesheets into the picture, and it waits for server blocks before it takes the picture.

The default path is `/builder-canvas`. Change it with the `canvasPath` option. If your app has a single root `app/layout.tsx`, move the site into a route group first, so the canvas can have its own root layout. Payload's templates already use `(frontend)` and `(payload)` groups.

### 7. Render pages on the site

The site layout imports your CSS and renders the Theme global's variables and fonts in the `<head>`. Replace the blank template's layout with this one:

```tsx
// src/app/(frontend)/layout.tsx
import { ThemeStyle } from 'payload-canvas/react/server'
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
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
```

The page route loads a page by its slug and renders its layout:

```tsx
// src/app/(frontend)/[slug]/page.tsx
import type { GeneratedCss } from 'payload-canvas'
import { normalizeLayout } from 'payload-canvas/core'
import { RenderLayout } from 'payload-canvas/react'
import { loadLayoutData } from 'payload-canvas/react/server'
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

`page.layout` and `page.layoutCss` exist in `payload-types.ts` after `generate:types` (step 5). The `draft` flag shows drafts only in Next's draft mode, so the site shows the published version.

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
3. Click the **Builder** tab (or **Open builder** on the layout field). The builder opens full screen. Click or drag blocks from the **Blocks** tab. Double-click text on the canvas to edit it in place, or edit it in the right panel. Style the selected block in **Styles**.
4. Click **Publish changes** in the top bar and open `http://localhost:3000/about`.

In development, Payload's Postgres adapter pushes the new tables and columns on `pnpm dev`. Before your first production deploy, create a migration and commit it:

```bash
pnpm payload migrate:create
```

Run it in production with `pnpm payload migrate`, or with `prodMigrations` in `postgresAdapter`. Never run `payload migrate` on a development database that uses push. See [Production and Docker](#production-and-docker).

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

The left sidebar has three tabs: **Layers** (the block tree), **Blocks** and **Sections**. Each fills the sidebar. Alt+1, Alt+2 and Alt+3 (⌥1, ⌥2, ⌥3 on a Mac) open them, and the browser keeps the last tab. To drop a block or section into the tree, drag it onto the **Layers** tab and hold it there for a moment: the tab opens.

The sidebars resize: drag the edge, or focus it with Tab and use the arrow keys (Shift for larger steps). A double-click or Enter resets the default size. The sizes are kept in the browser.

The canvas frame resizes too. Drag the handle on its left or right edge: the frame stays centered and shows its width and breakpoint while you drag. Hold Shift to snap to the breakpoint and device widths. The new width is a custom width. Double-click a handle (or press Enter on it) to go back to the device you started from, or to fluid. The stage scrolls sideways only when the frame is wider than the stage, for example a fixed width at 100 % zoom.

Publishing. All editors of a document share one live session (see [Multiplayer editing](#multiplayer-editing)). The session saves the layout as a draft about a second after each change. **Publish changes** saves what is still unsaved, then publishes with Payload's Local API as the signed-in user, so access control, hooks and versions work as usual. **Unpublish** sets the document back to draft. **Revert to published** loads the published version into the session, so every open editor reloads the canvas, and saves it again. Every open editor sees the new status at once.

Save rules. Every save checks the layout. A broken layout (wrong shape, duplicate ids, unknown block types, wrong prop types) blocks every save. Unfinished blocks do not block drafts, autosave or live sessions: a missing required prop, a prop whose value does not match its `builderFormat` (for example a half-typed video URL), a value outside the field's limits (`minLength`, `maxLength`, `min`, `max`, `minRows`, `maxRows`, an email address without a valid form), a message from the field's own `validate` function, a block in a slot that refuses it, and a binding the prop cannot use. All of these can be true while someone is still typing. They block **Publish** only, and the problem list names the block ("Video: this YouTube link does not point to a video", "Product: SKU: use a SKU like ABC-123"). Click a problem to select the block. See [Validation, hooks and access on block fields](#validation-hooks-and-access-on-block-fields).

Adding blocks on the canvas. Hover the canvas: a small **+** shows on the edge between two blocks next to the pointer (above or below in a column, left or right in a row), and in the middle of an empty container. Click it to open a picker with the blocks and sections that fit there (slot rules apply). Type to search, use the arrow keys and Enter, or click. The new block goes in exactly that place and is selected. The **+** hides while you drag and while you edit text on the canvas.

Drag and drop. Drag a block by its row in the outline, by the grip on the selected block's bar, or from the **Blocks** and **Sections** tabs. Slot rules apply: a slot that refuses the block is never a target. Escape cancels the drag. One drop is one undo step, and collaborators see the move at once. There are two styles:

- **Drop line** (`'indicator'`, the default). A line or a box shows where the block lands. Blocks move when you drop.
- **Smooth** (`'smooth'`). The block lifts and follows the pointer. The other blocks and the outline rows slide out of the way, so a gap shows where the block lands. In a grid, blocks move into the next cell. On drop, the block slides into the gap. On cancel, it slides back.

Set the default with `websiteBuilder({ editor: { dragMode: 'smooth' } })`. Each user can change it with the grip button in the canvas status bar, next to the zoom. The choice stays in that browser. When the system asks for less motion (`prefers-reduced-motion: reduce`), the editor always uses the drop line. Both styles use the same drop rules, so the same drop gives the same result. Smooth mode moves blocks with CSS transforms only and never changes the layout before the drop.

Access. The view sends signed-out visitors to the login page and back. Users without admin access go to Payload's "unauthorized" page. A document that does not exist, or a collection without the builder, shows "not found". A user who can read but not update the document gets the normal Edit view.

## Inline editing

Text and images edit in place on the canvas, in every block: the default blocks, your own components, and existing Payload components adopted with `fromPayloadComponents`. You do not need to change your components.

### Text

- Hover text that can be edited: the cursor turns into a text cursor and a faint dashed outline shows.
- Double-click the text, or select the block and press Enter. Type. Escape ends editing. In a one-line text field, Enter ends it too. In a textarea, Enter adds a line break and Ctrl+Enter ends editing.
- Rich text opens a small Lexical editor with a toolbar (paragraph and heading types, lists, bold, italic, links). Ctrl+K adds a link.
- One editing session is one undo step. Collaborators see the typing live.
- A prop bound to document data, and a prop the user may not change (field `access`), stay closed: the editor says why.

**How the canvas finds the text.** After a block renders, the canvas compares the block's props with the text of its elements:

- It looks at text, textarea and richText fields, also inside groups, array rows (`headingLines.0.text`, `cards.2.heading`) and `hasMany` text fields (`tags.1`). A field with no value counts as its `defaultValue`, as your component renders it.
- An element matches a prop when its text equals the prop's value. Runs of whitespace count as one space. Rich text matches without any whitespace, because paragraphs have no separator in the DOM.
- The smallest element with that text wins. A value split across elements (an accent word in a `<span>`) maps to the element around both parts. Icons and empty decoration inside the element stay out of the editing.
- Rich text maps to its container (the `<div>` around the paragraphs), never to one paragraph, so the editor can add paragraphs.
- The canvas does not guess. Nothing is marked when one value shows in two visible elements, when two props have the same text, or when one element matches two props.
- Blocks rendered on the server ([Server components in the canvas](#server-components-in-the-canvas)) map the same way. When editing ends, the value is saved and the server renders the block again.

**Limits.** The text on screen must equal the prop. These cases stay in the inspector:

- Text your component changes in JavaScript: `.toUpperCase()`, truncation, a heading split into words, markup such as `*accent*` that becomes a `<span>`. (CSS `text-transform: uppercase` is fine: the DOM text is unchanged.)
- A prop shown inside a sentence with other text in the same element (`<p>Call us on {phone}</p>`).
- The same text twice on the block (a marquee that repeats its items).

**Mark the element yourself** when the automatic mapping cannot find it. `editableText(mode, path)` returns the attribute in the canvas and nothing on the site. A mark always wins over the automatic mapping.

```tsx
import { editableText, type PayloadBlockProps } from 'payload-canvas/react'

export function Hero({ heading, builder }: PayloadBlockProps<HeroBlock>) {
  // The site shows "*Your* day" with an accent span. The mark tells the canvas which prop it is.
  return <h1 {...editableText(builder.mode, 'heading')}>{heading}</h1>
}
```

Put the mark on the element that holds the text and nothing else.

### Images

Every image that shows an upload prop can be replaced on the canvas:

- Hover the image: a **Replace** chip shows in its top left corner. Text over an image (a hero heading) wins: hover a free part of the image.
- Double-click the image, or click the chip, to open the media popover:
  - **Choose from library**: Payload's list drawer for the field's upload collection.
  - **Upload a file**: a file picker. The file goes to the upload collection with its name as alt text.
  - **Generate image**: the AI image action. Shown when `ai.images` is set up. See [Image generation](#image-generation).
  - **Remove**: empties the field. Not shown for required fields.
  - **Alt text**: saved in the block's own alt prop when it has one next to the upload (`alt`, `altText`, `<field>Alt`). Otherwise it is saved on the media document, so it changes everywhere that file is used.
- Drag an image file from your computer onto an image on the canvas to upload it and replace the image.
- When several uploads lie under the pointer (a video and its poster, a background under a photo), the popover has a list to pick one.
- Every replace is one undo step, and collaborators see it at once. Alt text saved on the media document is not part of the undo history.

**How the canvas finds the images.** It reads the URLs of `<img>` (also `srcset` and `<picture>` sources), `<video>` (the file and the poster), inline `background-image` styles and, for uploads still not found, CSS backgrounds from classes. It compares them with every URL of the block's media documents: the file, the thumbnail and each image size. `next/image` URLs (`/_next/image?url=…`) count as the image they wrap. Uploads in array rows (`photos.3.image`) and `hasMany` uploads (`gallery.2`) work too.

**Limits.** An image whose URL is not one of the block's uploads cannot be replaced on the canvas (an image from page data, a fixed file in `/public`). An empty upload field has no URL to match: mark its placeholder. Images inside rich text are edited in the inspector.

**Mark the element yourself** with `editableImage(mode, path)`. The default Image block marks its image and its empty placeholder this way:

```tsx
import { editableImage } from 'payload-canvas/react'

{photo ? <img {...editableImage(builder.mode, 'photo')} src={photo.url} alt="" /> : <div {...editableImage(builder.mode, 'photo')}>Add a photo</div>}
```

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
  ai: { adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }) }, // the AI assistant
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
| `collections[slug].legacyFields` | `string[]` | Top-level fields the builder replaced but the collection still has (the old `blocks` field after `migrateBlocksField`). **Publish** in the builder keeps their published value, so only the builder content goes live. See [Using existing Payload blocks](#using-existing-payload-blocks), step 7. |
| `collections[slug].localization` | `'props' \| false` | With Payload `localization` on: `'props'` (the default) translates localized props in one shared layout; `false` keeps one set of values. See [Localization](#localization). |
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
| `POST /api/builder/live/:collection/:id/validate` | Body `{ block }`. Runs the `validate` functions of the block's props and returns `{ problems: [{ propPath, message }] }`. The inspector calls it while someone edits. |
| `POST /api/builder/ai/chat` | The AI assistant (only with the `ai` option). Streams Server-Sent Events. |
| `GET /api/builder/theme` | The theme as `{ css, fontsHref }` (with the theme on). It uses the global's read access, so it is public by default. |

### Entry points

| Import | Use it in | Holds |
|---|---|---|
| `payload-canvas` | `payload.config.ts` (server) | `websiteBuilder`, `defineBlock`, `defaultBlocks`, `fromPayloadBlocks`, `migrateBlocksField`, types |
| `payload-canvas/blocks` | anywhere | `defaultBlocks`, `defineBlock`, `linkField`, `fromPayloadBlocks`, `BUILDER_CSS_CLASS`, `withBuilderCssClass` |
| `payload-canvas/core` | anywhere | layout types, `normalizeLayout`, `validateLayout`, `applyOperations`, tree helpers, `convertPayloadBlocksLayout`, `toPayloadBlock` |
| `payload-canvas/css` | server | `compileClasses`, `getStyleTokens`, `tracingIncludes` |
| `payload-canvas/theme` | anywhere | `themeCss`, `themeVariables`, `themeOutput`, `deriveColors`, `googleFontsHref`, `themeConfigOf`, theme types |
| `payload-canvas/theme-client` | Payload import map, or your own fields | `ThemeColorField`, `ThemeFontField`, `ThemeSliderField` |
| `payload-canvas/mcp` | server | `builderMcpTools` |
| `payload-canvas/ai` | server | the `AiAdapter` type and helpers for writing an adapter |
| `payload-canvas/ai/openrouter`, `/ai/cloudflare-gateway`, `/ai/cloudflare-workers-ai`, `/ai/openai-compatible`, `/ai/anthropic`, `/ai/fake` | `payload.config.ts` (server) | one AI adapter each. See [Adapters](#adapters). |
| `payload-canvas/ai/images/openrouter`, `/ai/images/openai`, `/ai/images/cloudflare-workers-ai`, `/ai/images/fake` | `payload.config.ts` (server) | one image adapter each. See [Image generation](#image-generation). |
| `payload-canvas/live` | server | the live sessions and endpoints |
| `payload-canvas/client` | Payload import map only | admin client components (layout field, Builder tab) |
| `payload-canvas/rsc` | Payload import map only | admin server components (the builder view, the tab redirect) |
| `payload-canvas/react` | your site and the canvas (server and client) | `RenderLayout`, `defaultComponents`, `fromPayloadComponent(s)`, `withPageData`, `renderOnServer`, `editableText`, `editableImage`, link helpers, `ThemeLive`, types |
| `payload-canvas/react/server` | server only | `loadLayoutData`, `loadTemplate`, `loadTheme`, `ThemeStyle`, `createCanvasServer` (they call Payload's Local API) |
| `payload-canvas/react/canvas` | client only | `BuilderCanvas`, the runtime for the editor's iframe |
| `payload-canvas/protocol`, `/css-browser` | used by `payload-canvas/react` | the editor–canvas message types, the in-browser CSS compiler. You do not import them yourself. |

Every entry point is ESM with `.d.ts` types. Client components keep their `'use client'` directive in the build.

## Rendering the layout on your site

`RenderLayout` is a React Server Component. It walks the layout and renders each block with its component. It comes from `payload-canvas/react`. The helpers that call Payload (`loadLayoutData`, `loadTemplate`, `ThemeStyle`, `createCanvasServer`) come from `payload-canvas/react/server`, and the editor's canvas (`BuilderCanvas`) comes from `payload-canvas/react/canvas`. See [Entry points](#entry-points). The full page route is in [Install, step 7](#7-render-pages-on-the-site), the canvas route in [step 6](#6-add-the-canvas-route), and the theme in [Theme](#theme).

| Prop | Type | What it does |
|---|---|---|
| `layout` | `Layout` | The layout, usually after `loadLayoutData`. |
| `blocks` | `BlockDefinition[]` | The same list as the plugin. |
| `css` | `string \| null` | The generated CSS from `<field>Css`. Rendered in a `<style>` tag. |
| `components` | `Record<type, Component>` | Your components, merged over the defaults. |
| `resolveLink` | `(link) => string \| null` | Turns links into an `href`. Default: the URL, or `/<slug>` for a loaded document. |
| `context` | `{ collection, doc }` | The document a template renders. See [Templates](#templates-and-binding). |
| `pageData` | `Record<string, unknown>` | Data the page loads once for its blocks. See [Page data](#page-data-and--block-context--components). |

`loadLayoutData(layout, blocks, payload, options)` (from `payload-canvas/react/server`) loads the documents that upload and relationship props point to, in one `find` per collection. Options: `draft`, `context`, `resolveLink`.

Write a `resolveLink` when your collections have different routes. Pass the same function to `RenderLayout` and to `BuilderCanvas`:

```ts
import type { ResolveLink } from 'payload-canvas/react'

export const resolveLink: ResolveLink = (link) => {
  if (link.type !== 'reference') return link.url?.trim() || null
  // The loaded document after loadLayoutData, or still an ID.
  const doc = link.reference?.value as { slug?: string } | null | undefined
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
import type { BlockComponents } from 'payload-canvas/react'
import { PricingTable } from './PricingTable'

export const components: BlockComponents = { pricingTable: PricingTable }
```

```tsx
<RenderLayout layout={layout} blocks={blocks} components={components} resolveLink={resolveLink} css={css} />
<BuilderCanvas blocks={blocks} components={components} resolveLink={resolveLink} />
```

`BuilderCanvas` takes the same `blocks`, `components` and `resolveLink` as `RenderLayout`. It also takes `plugins` (your Tailwind plugins map, see [Styling](#styling)) and `server` (a server action made with `createCanvasServer`, see [Server components in the canvas](#server-components-in-the-canvas)).

## Server components in the canvas

Some block components load their own data: a model grid that calls `payload.find`, a review carousel, a blog listing, a FAQ from a collection. They are async server components, and they import Payload and your config. The canvas iframe is a client page, so it cannot import them. The canvas sends these blocks to a server action in the canvas route instead. The action renders them with your site's components and sends back the result as React Server Component output. Client components inside it (a carousel, a lightbox) work in the canvas as on the site. You do not change your components.

You keep two component maps:

- **The client-safe map** (`components`): for the canvas. It must not import server code.
- **The server map**: the client-safe map plus the server components. The site and the server action use it.

**1. Make the server map** in a file that only server code imports:

```ts
// src/components/blocks.server.ts
import { fromPayloadComponents } from 'payload-canvas/react'
import { blocks } from '@/builder'
import { ModelGridLeaf } from '@/blocks/leaves/modelGrid/component'
import { components } from './blocks'

export const serverComponents = {
  ...components,
  ...fromPayloadComponents({ modelGrid: ModelGridLeaf }, blocks),
}
```

**2. Give it to the server action** (see [step 6 of Install](#6-add-the-canvas-route)):

```ts
const canvas = createCanvasServer({ config, blocks, components: serverComponents, resolveLink })
```

**3. Render the site with it:** `<RenderLayout components={serverComponents} … />`.

The canvas renders a block on the server when:

- the block type has no component in the canvas's `components` (the default blocks always have one),
- its component is an `async` function, or
- its component is marked: `renderOnServer(Component)`, or `fromPayloadComponent(Component, { render: 'server' })`.

`createCanvasServer` options:

| Option | What it does |
|---|---|
| `config` | Your Payload config. Required. |
| `blocks` | The block definitions. Default: the plugin's `blocks`. |
| `components` | The server map. |
| `resolveLink` | The same link resolver as the site. |
| `pageData` | `({ payload, user, document, context, locale }) => data`: the page data. `locale` is the language the editor shows (null without localization); load your data in it. See below. |

How it works in the editor:

- The first render shows a gray box with the block's name. Then the server output shows.
- After a change to the block (its props, its classes or its children), the canvas asks again 250 ms after the last change, and at the latest after 1 s. The changes of several blocks go in one request, because Next runs server actions one at a time. The old output stays on the screen until the new one is ready. It dims only when the answer takes longer than 300 ms.
- The canvas keeps the results by the block's content, so undo shows the earlier output at once. A block that did not change never asks again while the editor is open. Data that changes somewhere else (a new post) shows when you open the editor again.
- The data loads as on the site (`loadLayoutData`): the latest drafts, uploads and relationships one level deep, and the user's access for collection lists. In a template, bindings use the sample document.
- Only signed-in users of the admin collection get an answer.
- When a component fails, that block shows "Name: the preview failed" with the error. The other blocks are not affected.
- Selecting, dragging, the outline and the inspector work as for every block. The editor puts the block id on the first element of the output.
- Text and images edit on the canvas as in other blocks ([Inline editing](#inline-editing)). When editing ends, the block renders on the server again with the new value.

### Slots in server-rendered blocks

The server renders each slot of the block as a small client component, a slot outlet. In the canvas, the outlet shows the children the canvas renders itself. So:

- Children that your component renders through the builder (`PayloadSlot`, or `slots` in a builder component) stay fully editable on the canvas: select, drag, drop, double-click to edit text. They update at once, without a request to the server. A child can be a server-rendered block too.
- Children that your component renders itself (`<RenderLeaves blocks={content} />`) render on the server with the block. They show correctly, but you cannot select them on the canvas. Edit them in the outline and the inspector. This is the same as for client components that render their own children.
- The server output can depend on the children's data, so a change to a child also asks for the parent again (after the same 250 ms). The parent keeps its output on the screen meanwhile, and children in outlets update at once.

Why not static HTML: the canvas would have to inject markup that React does not own. Client components inside it would not run, and the children in its slots could not stay live React elements.

### Page data and `{ block, context }` components

Some sites load data once per page and give it to every block, for example `<RenderBlocks blocks={blocks} context={{ services, reviewAggregate }} />`, with components written as `function Hero({ block, context })`. Use the adapter's `props` option for them:

```ts
export const components = fromPayloadComponents({ hero: HeroBlockRenderer, cta: CTABlockRenderer }, blocks, {
  props: (block, context) => ({ block, context }),
})
```

`block` holds `{ id, blockType, blockName, ...fields }`, with each slot as a nested array. `context` is the page data. The third argument is the `builder` prop.

Give the page data with one function, on the site and in the canvas:

```ts
// src/lib/pageData.ts (server)
export async function loadPageData(payload: Payload) {
  const services = await payload.find({ collection: 'services', depth: 1 })
  return { services: services.docs }
}
```

```tsx
// The site
<RenderLayout layout={layout} components={serverComponents} pageData={await loadPageData(payload)} … />
```

```ts
// The canvas server action
createCanvasServer({ config, blocks, components: serverComponents, pageData: ({ payload }) => loadPageData(payload) })
```

The loader also gets `user`, `document` (the document open in the builder, `{ collection, id }`) and `context` (a template's sample document). The canvas loads the page data once, before its first render, and server-rendered blocks get it on every render. The page data must be plain data.

Only components that ask for the page data get it: every `fromPayloadComponent` component, and components marked with `withPageData(Component)` (they get it as `pageData`). So a client component does not carry the page data in the page's payload.

## Custom blocks

Declare a block with `defineBlock`. Props are Payload field configs. The editor builds its inputs from them, and the plugin builds a JSON Schema for validation and AI tools.

```ts
// src/builder.ts
import { defaultBlocks, defineBlock, linkField } from 'payload-canvas/blocks'

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
  // classes: only for a component in a package your CSS does not scan (see below)
  ai: {
    description: 'A pricing card with a plan name, a price and a call to action.',
    example: { props: { plan: 'Pro', price: 29 } },
  },
})

export const blocks = [...defaultBlocks({ linkCollections: ['pages'] }), pricingTable]
```

- `slots` declares where child blocks go. `allow` lists the accepted block types, or `['*']`. `max` caps the number of direct children: a full slot refuses insert, move, paste and duplicate (also from MCP and the assistant), and the canvas offers no drop target or "+" there. `min` is the fewest children: fewer block **Publish** but not draft saves.
- `parents` limits where a block may go: only directly inside the listed block types (never in the root list). The `listItem` block uses `parents: ['list']`. A new block whose slot accepts exactly one such type starts with one child of it, so a new list starts with one item.
- `classes`: classes your component uses itself that your site's CSS does not have. Components in your app need no list: Tailwind finds their classes in your files, and the site's CSS has them on the site and on the canvas. List classes only for a component in a package that your CSS entry does not scan (no `@source` for it). The generated CSS styles only elements with the class `builder-css` (`BUILDER_CSS_CLASS` from `payload-canvas/blocks`), so add that class to each element that uses the listed classes. The built-in Menu block does this for its toggle, panel and links.
- Block fields keep Payload's `validate`, `hooks` and `access`. See [Validation, hooks and access on block fields](#validation-hooks-and-access-on-block-fields).
- `admin.custom.builderFormat` on a `text` field names a value check, for example `custom: { builderFormat: 'videoUrl' }` (the Video block's URL). The inspector shows the message while the user types, and a bad value blocks **Publish** but not draft saves. `videoUrl` is the only built-in format. Formats live in a registry in `payload-canvas/core` (`FORMATS`, `formatProblem`). The renderer can use the same parser (`parseVideoUrl`).
- `linkField()` stores `{ type, url, reference, newTab }`. The component receives it resolved, with `href`, `target` and `rel`.
- The default blocks are `stack`, `grid`, `heading`, `text`, `richText`, `image`, `video`, `button`, `link`, `menu`, `list` with its `listItem` blocks, `quote`, `divider`, `spacer`, `collectionList` (documents from a collection) and `field` (a field of the document a template renders).
- The `menu` block folds its links into a "Menu" button and a panel on small screens. Set `ctaLabel` and `cta` (a link) to add a button as the last row of that panel, for example the header's call to action, which a header hides on phones. The inline links, and so the wide-screen header, do not change.
- The `field` block renders rich text with the `prose` typography (and `max-w-none`) when its own `className` has no `prose` class. Add `prose prose-lg` or another `prose` class to take control.
- A list holds its items as `listItem` blocks in its `items` slot, so each item can be selected, dragged, styled and edited on the canvas. Enter at the end of an item adds the next one; Backspace at the start of an item joins it to the one before. Older layouts stored the items as a prop (`props.items: [{ text }]`). `normalizeLayout` turns them into `listItem` blocks when a layout loads, and the List component still renders the old prop until the layout is saved again. A list whose `items` prop is bound to document data keeps the old form.

### Validation, hooks and access on block fields

Block props live inside one JSON field, so Payload itself never runs the field logic of block fields. The plugin runs it, with the arguments Payload passes. It works the same for `defineBlock` fields and for blocks made with `fromPayloadBlocks()`, at any depth (groups, named tabs, rows, collapsibles, arrays and `blocks` fields inside props).

```ts
defineBlock({
  type: 'product',
  label: 'Product',
  fields: [
    { name: 'sku', type: 'text', validate: (value) => !value || /^[A-Z]{3}-\d{3}$/.test(value) || 'Use a SKU like ABC-123' },
    { name: 'slug', type: 'text', hooks: { beforeChange: [({ value }) => slugify(value)] } },
    { name: 'note', type: 'text', access: { read: ({ req }) => Boolean(req.user?.isAdmin) } },
    { name: 'price', type: 'number', access: { update: ({ req }) => Boolean(req.user?.isAdmin) } },
  ],
})
```

What runs where:

| Field logic | Runs | Effect |
|---|---|---|
| `validate` | On **Publish** (the builder's button, REST, Local API): every block, after the hooks. In the inspector: the server checks the selected block about half a second after each change (`POST …/validate`). The MCP `validateLayout` tool lists the messages as warnings. | A message blocks **Publish** only, never a draft, autosave or a live session save. It shows under the field and in the problem list. |
| `hooks.beforeValidate`, `hooks.beforeChange` | On every save on the server: the live session's draft save (about 1 s after the last change, never per keystroke), Publish, Unpublish, Revert, Restore, REST, Local API, GraphQL. | The returned value is stored. Every open editor gets it at once (see below). |
| `hooks.afterChange` | After every save. | As in Payload: the returned value changes only the saved document that the API returns, not the stored data. |
| `hooks.afterRead` | On every read: REST, GraphQL, the Local API, versions, and when the builder loads the document into its live session. | The returned value is what the reader gets. |
| `access.read` | On every read, unless `overrideAccess`. In the builder: when it opens, and again after edits to blocks that have access rules. | The prop is left out of what the user gets. A REST save from that user that leaves it out keeps the stored value. The builder's inspector hides the prop from that user, and inline editing on the canvas refuses it. |
| `access.update` (`access.create` for a new document) | On every live edit (people, the operations endpoint, MCP agents, the AI assistant) and on other saves, unless `overrideAccess`. In the builder: as `access.read`. | A live edit that changes the prop is refused as a whole, with "You cannot change Price (Product). Nothing was applied." Other saves keep the stored value, as Payload does. A new block may hold the prop only empty, at its default value, or as a copy of a value already on the page (duplicate, paste). The builder's inspector shows the prop read-only, with a lock and a tooltip. Inline editing on the canvas refuses it with "You cannot change Price. You do not have permission to edit it." |

Arguments. `validate(value, options)` gets the field config spread in, plus `data` (the whole document), `siblingData` (the block's props, or the group or array row), `blockData` (the block in Payload's shape, `{ id, blockType, ...props }`), `req`, `id`, `operation`, `collectionSlug`, `path`, `previousValue`, `event` (`'submit'`, or `'onChange'` from the inspector), `overrideAccess` and `preferences`. Hooks get `value`, `data`, `siblingData`, `blockData`, `originalDoc`, `previousDoc` (afterChange), `previousValue`, `previousSiblingDoc`, `req`, `operation`, `field`, `path`, `schemaPath`, `context`, `collection`, `global` (null), `overrideAccess`, `siblingFields`, and in afterRead also `findMany`, `depth`, `currentDepth`, `draft` and `showHiddenFields`. `path` is the value's place in the document, for example `['layout', 'blocks', 0, 'props', 'items', 1, 'label']`. `schemaPath` is `['layout', '<block type>', 'items', 'label']`.

Access in the builder. When the builder opens, the server runs `access.read` and `access.update` of every block prop for the signed-in user and sends the answer with the document (`GET …/meta`, field `fieldAccess`). The functions get the same arguments as above, with the stored values of the default locale. The answer has one rule per block type (for new blocks) and one per block whose data changes the answer (for example `update: ({ siblingData }) => !siblingData.locked`). After someone adds, removes or changes a block that has access rules, the editor asks again about a second later (`GET …/access`). The server keeps each block's answer for 30 seconds per user, so it runs only the functions of blocks that changed. A function that throws counts as "no".

Skipped, as in Payload: `validate` of a field its condition hides. Also skipped: `validate` of a prop the block binds to document data.

Hook values and several editors. The live session saves its layout about a second after the last change. When a hook changes a value in that save, the session applies the stored value as one more change from "Field hooks", so every open editor shows it (for example "Red Shoe" becomes "red-shoe" in every inspector). When nobody changed anything during the save, that change counts as saved: no second save. A value someone changed again during the save keeps their newer value, and the next save runs the hook on it. Publish, REST and other saves while the builder is open work the same way.

Payload's own default validators are not called again for block fields: the builder's own check already covers types, required props, lengths, ranges, row counts and email addresses. The plugin reads `validate`, `hooks` and `access` once, when it starts, because Payload later adds its defaults to the same field objects.

Limits:

- `access.read` hides a prop in the builder's inspector, but it does not keep the value secret from editors. Everyone who edits the page shares one live session, and the session sends the whole layout to every editor's browser. The canvas renders what the site renders, so a component that shows the prop shows it on the canvas too. Keep real secrets out of blocks, or give the people who must not see them no update access to the document.
- In an array, a row that refuses a field locks that field in every row of the inspector. The server still checks each row.
- On a collection without drafts, nothing is "published", so `validate` messages never block a save. They show in the inspector.
- Saved sections (`builder-sections`) store blocks without running their field hooks.
- `migrateBlocksField` writes through the database adapter, so no hooks run. The values come from the old field, where Payload already ran the hooks.

## Using existing Payload blocks

A site that already has a Payload `blocks` field (for example `pages.layout` with sections and nested blocks) can keep its block configs and its components. The builder gets a field of its own, one script copies the content over, and the old field stays until you remove it.

What carries over:

- **Block configs.** `fromPayloadBlocks()` turns Payload `Block` configs into builder blocks. Every field stays a Payload field config, so the inspector shows it with Payload's own inputs: text, textarea, email, code, number, checkbox, select, radio, date, upload, relationship, rich text, JSON, point, group, array, row, collapsible and tabs (also `hasMany` text and number).
- **Nested blocks fields become slots.** A `blocks` field at the block's own level (also inside rows, collapsibles and unnamed tabs) becomes a slot with the same name. Its `blocks` and `blockReferences` become the slot's `allow`, and its `maxRows` and `minRows` become the slot's `max` and `min`.
- **Conditions.** An `admin.condition` that tests one sibling field, such as `(_, siblingData) => siblingData?.type === 'custom'`, becomes a JSON condition. The inspector hides the field, and an empty required field that is hidden does not block publishing.
- **Components.** `fromPayloadComponents()` renders components written for Payload's data (`{ blockType, ...fields }`) unchanged.
- **Field logic.** `validate`, field hooks and field `access` of the block fields run in the builder and the API, as in Payload. See [Validation, hooks and access on block fields](#validation-hooks-and-access-on-block-fields).
- **Content.** `migrateBlocksField()` converts every document, its drafts and its versions.
- **Canvas editing.** Text and images of your components edit in place on the canvas, with no marks in your code. See [Inline editing](#inline-editing).

### Step by step

These steps assume a site like this: `pages.layout` is a `blocks` field that references section blocks (`fullWidth`, `twoColumn`) from `config.blocks`, and the sections have nested `blocks` fields (`content`, `leftColumn`, `rightColumn`) with leaf blocks.

**1. Install** the package and add the canvas route, as in [Install](#install).

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
import { defaultBlocks, fromPayloadBlocks } from 'payload-canvas/blocks'
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
import { fromPayloadComponents } from 'payload-canvas/react'
import { blocks } from '@/builder'
import { FullWidthComponent } from '@/blocks/sections/fullWidth/component'
import { HeadingLeaf } from '@/blocks/leaves/heading/component'

export const components = fromPayloadComponents({ fullWidth: FullWidthComponent, heading: HeadingLeaf /* … */ }, blocks)
```

Each component gets the props it always got: `{ id, blockType, blockName, ...fields }`. `loadLayoutData` loads uploads and relationships (one level deep), and missing fields get their `defaultValue`. A field someone cleared (`null` or `''`) stays empty, as in Payload. Each slot arrives under its field name as an array of Payload-shaped blocks, so `<RenderLeaves blocks={content} />` keeps working. The component also gets a `builder` prop (see below).

- **Components that take `{ block, context }`** instead of the fields as props: add `{ props: (block, context) => ({ block, context }) }` as the third argument. `context` is the page data. See [Page data](#page-data-and--block-context--components).
- **Components that load data** (async server components, or components that import Payload): leave them out of this client-safe map and put them in the server map. The canvas renders them on the server. See [Server components in the canvas](#server-components-in-the-canvas). A section whose file imports such a component (through its own `RenderLeaves`) goes in the server map too.

**5. Convert the content.** Run a dry run first. It writes nothing and lists what it would do:

```ts
// scripts/migrate-blocks.ts
import config from '@payload-config'
import { formatMigrationReport, migrateBlocksField } from 'payload-canvas'
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

- Every document, every draft and every version is converted in place. No new versions are made, `updatedAt` and `createdAt` stay (the writes pass `updatedAt: null`, which every Payload adapter reads as "keep"), and the old field never changes.
- Field values: a stored `null` of a field with a `defaultValue` stays `null` (the field was cleared, so the default does not come back). A field with no key in the old data gets its default, as a new block does.
- A second run skips documents whose builder field has content. `overwrite: true` converts them again (unchanged results are skipped).
- After a real run it refreshes the documents' "Used in" records (`backfillReferences`), because its writes skip the save hook.
- It writes through the database adapter (`updateOne`, `updateVersion`), so no hooks run. It compiles the CSS itself. Tested on Postgres. On MongoDB it converts the documents but not the versions.
- Options: `where` (only some documents), `versions: false`, `overwrite`, `blocks` (default: the plugin's blocks), `log`.

**6. Render pages with the builder.** Change the page route to `RenderLayout` with `page.builderLayout` and `page.builderLayoutCss` (see [step 7 of Install](#7-render-pages-on-the-site)). Pass your wrapped `components` to `RenderLayout` and to `BuilderCanvas`.

**7. Keep the old field out of Publish, and remove it later.** Payload publishes the whole document. Without more setup, **Publish** in the builder would also publish the old field's latest draft (for example an edit someone made in the Edit view after the migration). List the old field in `legacyFields`:

```ts
websiteBuilder({
  collections: { pages: { field: 'builderLayout', legacyFields: ['layout'], url: (doc) => `/${doc.slug}` } },
  // …
})
```

Then **Publish** in the builder sends the old field's published value with the publish, so the site keeps it. The newer draft of the old field stays in the version history, but it is no longer the latest draft. A document that was never published has no published value to keep, so its old field goes live as it is. Publishing from the Edit view or the REST API is not changed. Remove the field and its name in `legacyFields` once every page renders from the builder. The migration report reminds you of this option.

### Slots and existing components: the trade-off

A component that renders its children itself (`<RenderLeaves blocks={content} />`) works as it is: the site shows the same HTML. In the editor you can select, move and edit the block, and you can edit and move its children in the outline and the inspector. On the canvas you cannot click or drag those children, because your renderer does not give their elements the builder's block ids.

To make the children editable on the canvas, render the slot with `PayloadSlot`. In the builder it renders the builder's children (each with its block id) in an element that takes the slot's drop attributes. Outside the builder it renders your old code:

```tsx
import { PayloadSlot, type PayloadBlockProps } from 'payload-canvas/react'

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

The `builder` prop holds `mode`, `className`, `slots` (rendered children by slot name) and `slotAttributes`. In the canvas, the adapter puts the block id on your component's first element. It adds no wrapper element, so the layout stays as on the site: container rules such as `space-y-8` and `divide-y` reach your elements. A component that renders nothing gets a small placeholder.

### Limitations

- **Classes in the editor.** Your components' own Tailwind classes come from your site's CSS, which the canvas layout imports ([step 6 of Install](#6-add-the-canvas-route)). A canvas route without that import has CSS only for the block elements' classes.
- **Server components that load data** render on the server for the canvas, through the canvas server action ([Server components in the canvas](#server-components-in-the-canvas)). Without the action, the canvas shows "Name: no preview in the editor", and the block stays selectable. Their output updates after a short wait (250 ms after the last change, plus the request), not at once. Data that changes somewhere else shows when the editor opens again.
- **Custom admin components** on fields (a custom `Field`) need Payload's form, so the inspector shows the default input for the field type. `fromPayloadBlocks` lists them in a warning.
- **Conditions** that read the document, the user or several fields are not converted: the field always shows (also listed in a warning). Function `defaultValue`s of block fields do not run in the builder. `validate`, field hooks and field `access` do run: see [Validation, hooks and access on block fields](#validation-hooks-and-access-on-block-fields).
- **Loaded data** is one level deep. A component that needs deeper data loads it itself.
- **Blocks fields inside a group, a named tab or an array** stay props, edited as JSON. Localized block fields are not supported.
- A Payload slug `list` with an `items` array is read as the old built-in list (`normalizeLayout`). Use `prefix` to avoid that.

## Sections

A section is a ready-made block tree: a hero, a feature grid, a footer. Editors insert it from the **Sections** tab. AI agents use sections as their main building unit.

```ts
import type { SectionDefinition } from 'payload-canvas'

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

Editors save their own sections: select a block (a whole section, or any block with its children), open **…** on the canvas or in the inspector, and choose **Save as section…**. Give it a name and, if you like, a category. It appears in **Add › Sections** under **Saved**, for everyone who edits pages. Insert it like any section; every insert gets new block ids. The card's **…** menu edits, renames or deletes it. A deleted section stays on the pages that use it.

**Edit section** (in the card's **…** menu) opens the section in the full-screen builder, like a page, at `/admin/builder/builder-sections/<id>`. The top bar shows "Section: <name>" and its category; click either to change it. **Back** returns to the page you came from. Sections have no drafts: each change saves to the section at once, and the library pictures follow on their own. Pages that already inserted the section keep their own copy. A change applies only to later inserts; the top bar says so ("Pages keep their copy"). The section's **Builder** tab in the admin opens the same view.

The collection stores the blocks in its `blocks` field. The builder edits a virtual `layout` field (no database column) that reads from `blocks`, and a save hook writes the layout back to `blocks`. While the section is open in the builder, the live session owns its blocks: a REST save of `blocks` gets the session's blocks, as on pages. Otherwise a REST or MCP save of `blocks` works as before.

The plugin stores them in the `builder-sections` collection (next to Templates in the admin nav). The MCP tools and the AI assistant see them too: `listSections` lists them with `saved: true`, and `insertSection` takes `saved:<id>`, the document id or the section's name.

A saved section runs the same field logic as a page save: the `beforeValidate` and `beforeChange` hooks of block props change its values before it is stored. The props' `validate` messages and other problems that block **Publish** (a missing required prop, a value outside its limits) do not stop the save: a section is never published. They go to the server log as warnings.

## Styling

- **Classes.** Each block stores Tailwind v4 classes in `className`. Variants use normal Tailwind syntax: `md:flex-row`, `hover:bg-primary`, `dark:text-white`.
- **Styles panel.** Visual controls for layout, spacing, size, position, typography, background, border and effects read and write classes. The breakpoint bar (`base`, `sm`, `md`, `lg`, `xl`, `2xl`) and the state bar (Default, Hover, Focus, Active) set the variant prefix. The **Classes** box accepts any class.
- **Theme tokens.** Classes compile against your CSS entry, so tokens from your `@theme` work: `bg-primary`, `font-heading`, `rounded-card`. The Styles panel lists your colors, fonts and sizes.
- **In the editor.** The canvas compiles the classes in the browser with Tailwind's own compiler. A new class shows at once.
- **On save.** The `beforeChange` hook compiles only the classes the layout uses and stores the CSS in `<field>Css` (`{ hash, css }`). The output holds the utilities, their `@property` and `@keyframes` rules, and the theme variables. It has no Preflight. `RenderLayout` writes it into a `<style>` tag, so the site does not need a Tailwind build of its own. If the site has one, import the same CSS entry in your site layout for Preflight and base styles.
- **Block elements only.** Every generated rule matches only elements with the class `builder-css` (`.flex:where(.builder-css)`). `RenderLayout` adds it to each block's `className`, so a block component needs nothing. Your own components keep the order of your site's CSS, even when a layout on the page uses the same classes. If you render layouts with your own renderer, add `builder-css` to each element that gets a block's classes (`withBuilderCssClass` from `payload-canvas/blocks`).
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

- **Theme variables in the canvas.** The canvas gets the Theme global from `<ThemeStyle live />` in its layout. If you set other variables at runtime, render the same tag in the canvas layout too.
- **Standalone output** needs `outputFileTracingIncludes`. See [step 8](#8-add-the-standalone-tracing-lines).

## Animations

Editors and the AI can add motion to any block without code: an entrance when the block scrolls into view, hover and press effects, a scroll effect such as parallax, and a loop. The site plays them with the [`motion`](https://motion.dev) package (its DOM API). Animations are data, not classes.

### In the editor

- Select a block and open the **Motion** tab in the inspector (next to Content and Styles). It has four sections: **Entrance**, **Hover and press**, **Scroll** and **Loop**. Pick a preset, then adjust its settings.
- **Preview** plays the block's animation once on the canvas. Picking a preset also plays it.
- The canvas shows every block at rest, so it never moves while you edit. **Play animations** (the icon button in the status bar under the canvas) plays the page as visitors see it: entrances on scroll, hover, parallax and loops.
- Layers marks animated blocks with a small icon. Its tooltip names the animations.
- **Copy styles** and **Paste styles** carry the animations with the classes. **Reset styles** removes classes only.
- Changes go through the normal operations, so undo and multiplayer work as for any edit.

### Data

A block stores its animations in `motion`. Every kind is optional. Times are milliseconds, distances pixels. `motion` is left out when it holds nothing.

```json
{
  "id": "b_cards",
  "type": "grid",
  "className": "grid grid-cols-3 gap-6",
  "motion": {
    "enter": { "preset": "fade-up", "stagger": 80 },
    "hover": { "preset": "lift" },
    "press": { "preset": "shrink" }
  }
}
```

| Kind | Presets | Settings (default) |
|---|---|---|
| `enter` | `fade`, `fade-up`, `fade-down`, `fade-left`, `fade-right`, `zoom-in`, `zoom-out`, `blur-in`, `wipe-up`, `wipe-down`, `wipe-left`, `wipe-right` | `duration` (600), `delay` (0), `easing` (`ease-out`, `ease-in-out`, `linear`, `spring`, `bouncy`), `distance` (24, fade-up/down/left/right), `trigger` (`view`, or `load` for the first section), `amount` in view 0-1 (0.2), `offset` px inside the window (0), `repeat` (false: once), `stagger` |
| `hover` | `lift`, `grow`, `tilt` | `distance` (lift, 4), `scale` (grow, 1.03), `angle` (tilt, 6) |
| `press` | `shrink` | `scale` (0.97) |
| `scroll` | `parallax`, `fade`, `zoom` | `distance` (parallax, 60; negative moves with the scroll), `scale` (zoom start, 0.9) |
| `loop` | `float`, `pulse` | `duration` (3000 float, 1500 pulse), `distance` (float, 8), `scale` (pulse, 1.04) |

- **Stagger.** `enter.stagger` is the gap in milliseconds between children. The block itself stays still, and its direct child blocks play the entrance one after another. Use it on grids and lists of cards, and on Collection lists. A child's own entrance does not play there (its hover, press, scroll and loop do).
- **Edits.** An `update` operation takes `motion` as a patch: each kind listed replaces that kind, `null` removes a kind, kinds left out stay, and `motion: null` removes all. The operations refuse unknown presets, unknown keys and values out of range, with a message that names the problem.
- The presets, limits and defaults live in `core/motion.ts` (`MOTION_SPECS`, `MOTION_PRESET_INFO`). The layout JSON Schema has the motion schema under `$defs.$motion`. The MCP tools and the assistant document it from the same source.

### On the site

- `RenderLayout` puts each animated block's settings on its root element: `data-motion` (JSON), plus `data-motion-item` on the children of a staggering block. Block components need nothing: the attributes come in `attributes`, which every component spreads on its root element.
- When a layout has motion, `RenderLayout` also renders `<MotionStyle blocks={layout.blocks} />` (a small `<style>` in the head, once per page) and `<MotionRuntime />` (a client component that renders nothing). Pages without motion get neither, and load no motion code.
- `MotionRuntime` loads the runtime as its own chunk (about 14 KB gzipped, Motion included) and starts it once per page, however many layouts render it. The runtime finds the elements, watches for new ones (client navigation, streaming), and drives them:
  - Entrances run on the Web Animations API (`animate` from `motion/mini`), so the browser runs them off the main thread. They animate only `opacity`, `transform`, `filter` and `clip-path`, then hand the element back to its classes. Nothing changes layout, so there is no layout shift.
  - Hover and press use Motion's `hover` and `press` gestures with short springs. Hover runs only on devices with a fine pointer. Press does not make a block focusable.
  - Scroll effects use Motion's `scroll`, which uses a native `ViewTimeline` where the browser has one. Scroll and loop effects use the separate `translate`, `scale` and `opacity` properties, so they add to the other effects.
  - Loops pause while the block is out of view.
- **Entrances on load start at first paint.** An entrance with `trigger: "load"` plays in plain CSS: `MotionStyle` writes one rule per such block (it matches the block's `data-motion` value) with keyframes from the same preset data. It does not wait for JavaScript, so the block paints with the page. The runtime sees the CSS animation and leaves the block alone.
- **Entrances on scroll: no flash, and nothing hidden without JavaScript.** The style hides these blocks until the runtime takes them over, only under `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`. Visitors and crawlers without JavaScript see every block. The hiding is a 1.2-second CSS animation, so if the runtime never starts (a script error), the blocks show after 1.2 seconds.
- **Keep the largest element still.** Do not put an entrance on the page's main title or hero image: it is the page's Largest Contentful Paint. Animate the text and buttons around it. The starter's hero sections do this.
- **Reduced motion.** When the visitor's system asks for less motion (`prefers-reduced-motion: reduce`), nothing is hidden and blocks in the window at load show at once. Blocks further down fade in briefly as they scroll into view. Hover, press, parallax, zoom and loops do not run. The scroll fade stays.

### Custom components and renderers

- A custom block component spreads `attributes` on its root element, as before. That is all it needs.
- A component made with `fromPayloadComponent` gets the attributes on its class wrapper (`className: 'wrap'`, the default, for blocks with styles). Without a wrapper, they go on the component's first element after hydration, so an entrance above the fold can flash once on load. Keep the wrapper for animated blocks.
- Your own renderer: put `motionAttributes(block.motion, isStaggerChild)` (from `payload-canvas/core`) on each block's root element, and render `<MotionStyle blocks={layout.blocks} />` and `<MotionRuntime />` from `payload-canvas/react` once on pages with motion. Without `blocks`, entrances on load wait for the runtime like entrances on scroll. `startMotion()` and `previewMotion(element)` are exported for other setups.
- Parallax on an image inside a frame: give the frame `overflow-hidden` and a fixed height, and make the image taller than the frame (for example `h-[120%]`), so the moving image never shows an edge.

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

**2. Render the theme in the `<head>`** of the site's root layout, and in the `<body>` of the canvas layout with `live` ([step 6](#6-add-the-canvas-route); React moves its tags into the head):

```tsx
// src/app/(frontend)/layout.tsx
import { ThemeStyle } from 'payload-canvas/react/server'
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

For about 90 popular families (Inter, Roboto, Newsreader, Hanken Grotesk and others in `theme/fallbacks.ts`) the `<style>` tag also holds a fallback `@font-face` (`'Inter Fallback'`: Arial or Times New Roman, scaled with `size-adjust` and the ascent, descent and line-gap overrides), and `--font-sans` lists it after the family. The text then keeps its size and line height when the web font loads, so the swap moves nothing (on the demo home page, CLS fell from 0.0007 to 0.00004). Other families keep the plain `sans-serif` or `serif` fallback.

| Prop | Default | What it does |
|---|---|---|
| `payload` | required | The Payload instance. |
| `fonts` | `true` | `false` leaves the Google Fonts links out (for self-hosted fonts). |
| `live` | `false` | Reloads the theme in the browser when the global is saved in another tab, or when the page becomes visible again. Use it in the canvas layout. |

Other frontends: `loadTheme(payload)` from `payload-canvas/react/server` returns `{ data, css, fontsHref }`. `themeOutput(doc)` from `payload-canvas/theme` turns any theme document into the same output. `GET /api/builder/theme` returns it over HTTP.

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
{ name: 'brandColor', type: 'text', admin: { components: { Field: 'payload-canvas/theme-client#ThemeColorField' } } }
{ name: 'titleFont', type: 'text', admin: { components: { Field: 'payload-canvas/theme-client#ThemeFontField' } } }
{ name: 'gap', type: 'number', admin: { components: { Field: 'payload-canvas/theme-client#ThemeSliderField' }, custom: { min: 0, max: 64, step: 4, unit: 'px' } } }
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
import { RenderLayout } from 'payload-canvas/react'
import { loadLayoutData, loadTemplate } from 'payload-canvas/react/server'

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
- `getByPath(doc, path)` and `resolveBindings(layout, context, blocks)` from `payload-canvas/core` do the same work for a custom renderer.

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
- To delete a used document anyway, pass the context flag: `payload.delete({ collection: 'media', id, context: { builderForceDelete: true } })` (`FORCE_DELETE_CONTEXT` from `payload-canvas`). Postgres removes the deleted document from every `builderRefs` list.
- `findReferrers(payload, { relationTo: 'media', value: id })` from `payload-canvas` returns the builder documents that use a document (published and latest draft), for your own checks.
- Search and sitemaps can query the field like any relationship: `where: { builderRefs: { equals: { relationTo: 'media', value: id } } }`.

**Existing documents.** Documents saved before this version have an empty list until their next save. To fill them now, run the backfill once:

```ts
// scripts/backfill-references.ts — run with `pnpm payload run ./scripts/backfill-references.ts`
import { getPayload } from 'payload'
import config from '@payload-config'
import { backfillReferences } from 'payload-canvas'

const payload = await getPayload({ config })
console.log(await backfillReferences(payload))
process.exit(0)
```

It writes only the `builderRefs` field of each document and of each latest draft, through the database adapter: no hooks run, no new versions, and `updatedAt` does not change. It skips documents that are already right, so you can run it again.

**Database schema.** The field adds rows to the builder collections' `_rels` tables (and their version tables). In development, `pnpm dev` pushes the change. Before a production deploy, create a migration with `pnpm payload migrate:create`.

## Localization

Turn on Payload's `localization`, and builder pages translate. Every language shares one layout: the same blocks, order, classes and bindings. Only the text props differ per language. This is the Webflow model.

```ts
buildConfig({
  localization: { locales: [{ code: 'en', label: 'English' }, { code: 'de', label: 'Deutsch' }], defaultLocale: 'en', fallback: true },
  plugins: [websiteBuilder({ … })],
})
```

**Which props translate.** A prop translates when its field config says `localized: true`, as in Payload. A group or array that holds a localized field translates as a whole. The default blocks mark their text as localized: heading, text, rich text, button label, image alt text, list items, quote and source, menu links and name, and the field block's fallback. Images, links, numbers, selects and checkboxes are shared. Add `localized: true` to the fields of your own blocks. Without Payload localization, `localized` does nothing.

**How it is stored.** The default language stays in `props`. Each other language keeps only its own values in `locales`:

```json
{ "id": "b_1", "type": "heading", "props": { "text": "Hello", "level": "2" }, "locales": { "de": { "text": "Hallo" } } }
```

A value a language does not have falls back, as Payload's `fallback` and `fallbackLocale` say (text and textarea also fall back when empty). Layouts saved before localization keep working: their values are the default language.

**The editor.**

- The top bar has a language switcher (the globe). The canvas shows the chosen language, and the inspector edits it. The address keeps it as `?locale=de`, Payload's convention, so a reload opens the same language.
- In another language than the default, a translated field says **Translated** (with **Use English**, which removes the translation). An untranslated field says **Not translated · shows English**: text fields show the English text as a greyed placeholder, other fields show the English value greyed. **Copy English** copies the value, so you can change it. A note above the tabs has **Copy N fields from English** for the whole block.
- The outline marks blocks with untranslated text with an orange dot.
- Inline editing on the canvas writes the shown language.
- Blocks, order, classes and fields that are not localized change every language. The inspector says so, and the first such edit in another language shows a notice.
- A new block holds its text in the language you add it in. Add a heading in German, and its text is German only: English has no text for it yet. This covers blocks from the Blocks tab, the "+" between blocks, a new list item (Enter) and blocks the assistant adds. Pasted, duplicated and section content keeps its own languages.
- A field that has text in another language but none in the default language says **Missing in English**. In English it has **Copy German**, and the note above the tabs copies every such field at once. The outline dot and the language switcher count these fields in the default language too.
- Related documents load in the shown language: collection lists, images and relationships, the template's preview document and server-rendered blocks. Switching the language loads them again.
- Collaborators see each other's language in the avatar (a small "DE") and in its tooltip. Structure changes reach everyone at once; each person sees the text of their own language. Undo stays per person.

**Saving and publishing.** Every save checks the translations too. The default language must fill every required prop. Another language needs its own value only when it has no fallback (`fallback: false`). The publish problem list names the language: "Heading: fill in text (DE)". A required prop that only another language has names the default language: "Heading: fill in text (EN)". So a block added in German blocks Publish until someone writes its English text. Field `validate`, `hooks` and `access` of localized props run for each language's values too, with `req.locale` set to that language.

**The site and the API.** Read a document with a locale and the layout comes back in that language, with fallback, without `locales`:

- REST: `GET /api/pages/1?locale=de` (add `&fallback-locale=none` for no fallback). `?locale=all` gives the stored form with `locales`.
- Local API: `payload.find({ collection: 'pages', locale: 'de' })`.
- A save with a locale (`PATCH /api/pages/1?locale=de`, the Edit view in German) writes the localized props to that language and keeps the others, as Payload does for localized fields. A value equal to the fallback the reader saw stays a fallback.

Render the site with the same locale everywhere:

```tsx
const page = await payload.find({ collection: 'pages', where, locale })
const template = await loadTemplate(payload, { collection: 'posts', doc: post, draft, locale })
const layout = await loadLayoutData(page.layout, blocks, payload, { draft, locale })   // documents and lists in German too
```

`loadLayoutData` also resolves a layout in the stored form (`localizeLayout` from `/server` does it alone). The generated CSS is the same for every language, because classes are shared. Bindings read the document you pass, so load it with the same `locale`.

**AI and MCP.** `getLayout` and `applyOperations` take `locale`. `getLayout` returns that language's view, the localized props of each block type and the untranslated props per block. `applyOperations` with a locale writes that language's text, also the text of blocks it inserts; other changes affect every language. `insertSection` keeps the section's own text. In the editor, the assistant works in the language you have open. Operations name their language as `update { id, props, locale }` and `insert { block, to, locale }` (the block's localized props are that language's).

**References.** Every language's values count: a German image is "used" too.

**Per collection.** `collections: { pages: { localization: false } }` keeps one set of values for every language. A separate layout per language (`localized: true` on the whole field, so the structure differs per language) is not supported yet.

**Limits.**

- Classes and structure are always shared.
- `migrateBlocksField` keeps translations. When the old `blocks` field, or a field inside its blocks, is localized, it reads every language and stores each language's own values of localized props in `locales`. When the whole `blocks` field is localized, the default language gives the structure, and other languages' blocks match it by block id, then by position and type. The report lists blocks it could not match, and fields that differ per language but are not marked `localized: true` (add it to keep them).

## AI assistant

The editor gets an **Assistant** panel. The user types a request, for example "add a pricing section with three tiers", and the model edits the open page. Each change appears on the canvas as it happens. One reply is one undo step. The assistant never saves or publishes: the editor saves the page as usual.

An **adapter** connects the assistant to a model API, the same way Payload uses adapters for the database, storage and email. Each built-in adapter has its own import path, so your site loads only the one you use. Full guide: [docs/ai/providers.md](https://github.com/jon8800/payload-canvas/blob/main/docs/ai/providers.md).

No API key? Claude Code and Codex can edit pages with your Claude or ChatGPT plan over MCP: [docs/ai/connect-claude-code-and-codex.md](https://github.com/jon8800/payload-canvas/blob/main/docs/ai/connect-claude-code-and-codex.md). The panel shows the commands (link icon in its header).

### Turn it on

```ts
import { openRouterAdapter } from 'payload-canvas/ai/openrouter'

websiteBuilder({
  collections,
  blocks,
  sections,
  css: { entry: 'src/app/(frontend)/globals.css' },
  ai: {
    adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }),
  },
})
```

Then put the key in `.env` and restart the server. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

The default model is `openai/gpt-6-luna`: cheap and good at tool calls. Pick another one with `model`.

Without an adapter, or without a key, the panel shows a setup card. The card says what to set.

### Adapters

| Import | Adapter | Notes |
|---|---|---|
| `payload-canvas/ai/openrouter` | `openRouterAdapter({ apiKey, model?, siteUrl? })` | One key for hundreds of models. Easiest start. |
| `payload-canvas/ai/cloudflare-gateway` | `cloudflareGatewayAdapter({ accountId, gatewayId, model, gatewayToken?, apiKey? })` | Cloudflare AI Gateway in front of OpenAI, Anthropic, Google and others. Supports stored keys and unified billing. |
| `payload-canvas/ai/cloudflare-workers-ai` | `cloudflareWorkersAIAdapter({ accountId, apiToken, model?, gatewayId? })` | Models that run on Cloudflare (Workers AI). Only models with function calling work. |
| `payload-canvas/ai/openai-compatible` | `openAICompatibleAdapter({ baseURL, model, apiKey? })` | OpenAI, Groq, Together, Ollama, LM Studio, vLLM and other Chat Completions servers. |
| `payload-canvas/ai/anthropic` | `anthropicAdapter({ apiKey?, model? })` | The Anthropic Messages API with prompt caching, adaptive thinking and the refusal fallback. Needs `pnpm add @anthropic-ai/sdk`. |
| `payload-canvas/ai/fake` | `fakeAdapter()` | A scripted model for tests and demos. No network, no cost. Never use it in production. |

Examples:

```ts
ai: { adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY, model: 'google/gemini-3.8-flash' }) }
ai: { adapter: openAICompatibleAdapter({ baseURL: 'http://localhost:11434/v1', model: 'llama3.3' }) }
ai: { adapter: anthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }) }
```

You choose the adapter in your own config code, so you decide which environment variables to read. The starter picks `fakeAdapter()` when `BUILDER_AI_FAKE=1` (development only), else OpenRouter when `OPENROUTER_API_KEY` is set, else no adapter.

### Options

| Option | Default | What it does |
|---|---|---|
| `adapter` | none | The model API. See [Adapters](#adapters). Without it the panel shows the setup card. |
| `effort` | the adapter's default (Anthropic: `medium`) | How much the model thinks: `low`, `medium`, `high`, `xhigh`, `max`. Anthropic and OpenRouter use it. `openAICompatibleAdapter` sends it as `reasoning_effort` with `reasoningEffort: true`. |
| `instructions` | none | Extra rules for the assistant, for example your brand voice. Added to the end of the system prompt. |
| `maxSteps` | `12` | Maximum tool rounds per user message. |
| `mediaCollection` | `media` | The upload collection the assistant picks images from, and where generated images go. |
| `images` | none | The image adapter. See [Image generation](#image-generation). |
| `imageLimits` | `{ perRequest: 3, perHour: 20 }` | Images per assistant reply, and per user per hour. |
| `imageMarkerField` | `generatedBy` | A media field that gets a note on generated images, when the collection has it. `false` turns it off. |

The model, the key, `maxTokens` and provider settings belong to the adapter. See [providers.md](https://github.com/jon8800/payload-canvas/blob/main/docs/ai/providers.md) for each adapter's options.

### Write your own adapter

An adapter is a plain object of type `AiAdapter` from `payload-canvas/ai`. You do not need to change the plugin.

```ts
type AiAdapter = {
  name: string            // short id, e.g. "my-api". Part of the chat identity.
  label: string           // shown in the panel
  model: string
  ready: boolean          // false: the panel shows the setup card
  setupProblem?: string | null // one sentence for the developer, e.g. "Set MY_API_KEY."
  keyEnv?: string | null  // shown in the setup card
  keyUrl?: string | null  // "Get an API key" link
  stream(request: AiModelRequest): AsyncIterable<AiModelEvent>
}
```

`stream` runs one model call. The request has `system` (parts; `cache: true` marks a stable prefix you may cache), `messages` (the conversation), `tools`, `effort` and `signal`. Yield these events, in order:

- `{ type: 'text', text }`: assistant text as it arrives.
- `{ type: 'toolStart', id, name }`: optional. The panel shows a running chip.
- `{ type: 'toolCall', id, name, input }`: one complete tool call. Add `error` when the arguments could not be read: the tool does not run, and the model gets the error.
- `{ type: 'usage', usage: { inputTokens, outputTokens } }`: optional.
- `{ type: 'done', stopReason, content }`: `stopReason` is `end_turn`, `tool_use`, `max_tokens`, `refusal` or `pause_turn`. `content` is the assistant message the chat stores and sends back next time. Use the block types `text` and `tool_use` (add your own types for data you must send back, such as reasoning).
- `{ type: 'error', code, message }`: `code` is `auth` (the panel shows the setup card), `aborted`, `api_error` or `invalid_output` (the loop calls the model again). Yield it instead of throwing.

Stored messages use the block types `text`, `tool_use` and `tool_result`. The agent loop runs the tools and adds the `tool_result` blocks.

This example wraps a Chat Completions endpoint without streaming, in about 40 lines:

```ts
import { chatTools, parseArguments, toChatMessages, type AiAdapter, type AiContentBlock } from 'payload-canvas/ai'

export function myAdapter({ url, apiKey, model }: { url: string; apiKey?: string; model: string }): AiAdapter {
  return {
    name: 'my-api',
    label: 'My API',
    model,
    ready: Boolean(apiKey),
    setupProblem: apiKey ? null : 'Set MY_API_KEY in .env and restart the server.',
    keyEnv: 'MY_API_KEY',
    async *stream({ system, messages, tools, signal }) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: toChatMessages(system, messages), tools: chatTools(tools) }),
        signal,
      }).catch((error: Error) => error)
      if (response instanceof Error) {
        yield { type: 'error', code: signal?.aborted ? 'aborted' : 'api_error', message: response.message }
        return
      }
      if (!response.ok) {
        yield { type: 'error', code: response.status === 401 ? 'auth' : 'api_error', message: `My API returned ${response.status}.` }
        return
      }
      const data = await response.json()
      const message = data.choices[0].message
      const content: AiContentBlock[] = []
      if (message.content) {
        yield { type: 'text', text: message.content }
        content.push({ type: 'text', text: message.content })
      }
      for (const call of message.tool_calls ?? []) {
        const parsed = parseArguments(call.function.arguments)
        const input = 'input' in parsed ? parsed.input : {}
        content.push({ type: 'tool_use', id: call.id, name: call.function.name, input })
        yield { type: 'toolCall', id: call.id, name: call.function.name, input, ...('error' in parsed ? { error: parsed.error } : {}) }
      }
      yield { type: 'done', stopReason: message.tool_calls?.length ? 'tool_use' : 'end_turn', content }
    },
  }
}
```

For a streaming OpenAI-format API, `createOpenAIFormatAdapter({ name, label, model, url, authHeaders, keyHint })` from the same import does all of this, with streaming, retries and timeouts. The built-in OpenRouter and Cloudflare adapters use it.

### Image generation

The assistant, the inspector (a **Generate image** button under every upload field) and MCP clients can make new images. The site saves each image in the media collection, with alt text. Image generation has its own adapter, so it works with any chat model, and also for Claude Code or Codex over MCP:

```ts
import { openRouterImageAdapter } from 'payload-canvas/ai/images/openrouter'

ai: {
  adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }),
  images: openRouterImageAdapter({ apiKey: process.env.OPENROUTER_API_KEY }), // default model: black-forest-labs/flux.2-klein-4b
}
```

| Import | Adapter |
|---|---|
| `payload-canvas/ai/images/openrouter` | `openRouterImageAdapter({ apiKey, model? })`: every image model on OpenRouter. About 1.5 US cents per image with the default model. |
| `payload-canvas/ai/images/openai` | `openAIImageAdapter({ apiKey, model?, baseURL?, quality? })`: the OpenAI Images API and compatible servers. |
| `payload-canvas/ai/images/cloudflare-workers-ai` | `cloudflareWorkersAIImageAdapter({ accountId, apiToken, model? })`: FLUX and other models on Cloudflare. |
| `payload-canvas/ai/images/fake` | `fakeImageAdapter()`: a local gradient PNG for tests. |

A chat model does not return images through the chat API, even when its app can make images. That is why the image adapter is a separate setting. Without it, the Generate button stays hidden and the `generateImage` tool says what to set up. Uploads run as the signed-in user, after a `create` access check. Limits, cost, the "generated by" note and writing your own `AiImageAdapter`: [docs/ai/images.md](https://github.com/jon8800/payload-canvas/blob/main/docs/ai/images.md).

### What it can do

- Insert ready-made sections and then change their text, images and classes. It prefers your sections over building from single blocks.
- Add, move, duplicate, hide and remove blocks, and change props and Tailwind classes. It knows your theme colors, fonts and breakpoints, the selected block and the canvas width.
- Pick images from the media library (it searches alt text and file names as the signed-in user), or generate new ones with `ai.images`.
- In templates, bind block props to document fields.

Every change goes through the same operations as the editor and is checked against the block schemas. A change that would make the layout invalid is rolled back, and the model gets the error and tries again.

### Access

`POST /api/builder/ai/chat` needs a signed-in user who may update the document (Payload access control, `overrideAccess: false`). Media searches run as that user too.

### Cost

You pay the provider for each request. Each request sends the system prompt (blocks, sections, theme, tools; about 8,000 tokens in the starter), the conversation and the current layout. A typical request ("add a pricing section") takes two to four model calls.

- OpenRouter `openai/gpt-6-luna` ($0.10 / $0.50 per million tokens): well under one US cent per request.
- Anthropic `claude-opus-5-5` at `medium` effort ($4 / $20 per million tokens): roughly 5 to 30 US cents per request. The fixed prompt is cached, so repeat requests within 5 minutes read it at a tenth of the price or less.

Long conversations and large pages cost more. Start a new conversation when the topic changes. Changing the adapter or the model starts a new chat.

### Privacy

The page content goes to the provider you pick (and through OpenRouter or Cloudflare when you use them): the layout JSON (all text, classes and media IDs), the conversation, media search results (alt text, file names, URLs), and for templates a summary of the sample document. Do not turn the assistant on for content that must not leave your servers. Check the provider's data policy.

### Testing without a key

`fakeAdapter()` from `payload-canvas/ai/fake` is a scripted model with no network calls. It lists the sections, inserts a hero section at the top of the page, changes its heading, and streams a few sentences. In the starter, set `BUILDER_AI_FAKE=1` in `.env` (ignored when `NODE_ENV=production`) and restart the server. For your own tests, pass `fakeAdapter({ steps: [...] })` with one scripted reply per model call.

## AI editing over MCP

The builder adds tools to [`payload-mcp-toolkit`](https://www.npmjs.com/package/payload-mcp-toolkit). An AI agent reads the blocks and sections, edits the draft layout, and every open editor shows the change at once.

```bash
pnpm add payload-mcp-toolkit zod
```

```ts
import { mcpToolkitPlugin } from 'payload-mcp-toolkit'
import { builderMcpTools } from 'payload-canvas/mcp'

const collections = { pages: { url: (doc) => `/${doc.slug}` } }

plugins: [
  mcpToolkitPlugin({
    customTools: builderMcpTools({ blocks, sections, collections }),
  }),
  websiteBuilder({ collections, blocks, sections, css: { entry: 'src/app/(frontend)/globals.css' } }),
]
```

- Agents connect to `POST <your site>/api/mcp` with an API key from **Admin > MCP > API Keys**. Claude Code and Codex setup: [docs/ai/connect-claude-code-and-codex.md](https://github.com/jon8800/payload-canvas/blob/main/docs/ai/connect-claude-code-and-codex.md).
- Sign-in with the website account (OAuth, no key to copy) is a `payload-mcp-toolkit` feature: pass `oauth: { canAuthorize, access: 'editor' }` to `mcpToolkitPlugin()` and add the discovery rewrites. The starter shows the setup, and the doc above has the Claude Code and Codex commands. API keys keep working next to it.
- Tools (`listSections` and `insertSection` include [saved sections](#saved-sections)): `listBlocks`, `getBlockSchema`, `listSections`, `insertSection`, `getLayout`, `applyOperations`, `validateLayout`, `getPreviewUrl`, `generateImage`, plus `listTemplates` and `getBindingSources` for templates.
- `generateImage` makes an image with the site's image adapter (`ai.images` in `websiteBuilder`) and saves it in the media collection. Clients that cannot make images (Claude Code with a Claude plan) use the site's adapter this way. The key needs `create` on the media collection.
- Every tool checks the key's access to the collection. Handlers run as the key's user with `overrideAccess: false`.
- Writes are commits to the document's live session, like an editor's own changes. Open editors show them at once, and the agent appears in the collaborator list while it works. The draft is saved about a second later. `getLayout` returns the session's layout, unsaved changes included.
- `builderMcpTools` options: `blocks`, `sections`, `collections` (the same map as the plugin), `siteUrl` (default: Payload `serverURL`, then `NEXT_PUBLIC_SERVER_URL`), `apiKeyCollection`, `mediaCollection` (default `media`, the same as `ai.mediaCollection`).

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

**A class shows in the editor but not on the site.** The site must pass `css={page.<field>Css?.css}` to `RenderLayout` (or use `compilePageCss`). The element with the block's classes must also have the class `builder-css`: `RenderLayout` adds it to the `className` prop, so check that the component puts `className` on the element. Classes that a component in a package hardcodes must be listed in the block's `classes`, and the element needs `builder-css` too.

**The production log repeats `MaxListenersExceededWarning: 11 drain listeners added to [Gzip]`.** Next's built-in compression leaks one listener per backpressure event while it streams a large HTML page. The builder does not cause it. Set `compress: false` in `next.config.ts` and compress in your reverse proxy. See install step 9.

**Saving fails in production with "Cannot read stylesheet".** Standalone output is missing a CSS file. Add it to `outputFileTracingIncludes`.

**Saving fails with "Tailwind plugin "x" is used by @plugin in the CSS entry but is not in the plugins map".** Add the plugin to `css.plugins` and to the canvas page's `plugins`.

**"Collection "pages" already has a "blocks" field named "layout"".** The builder needs a `json` field. Give it its own name (`field: 'builderLayout'`) and convert the content: see [Using existing Payload blocks](#using-existing-payload-blocks).

**"Two blocks have the type "heading"".** A block made with `fromPayloadBlocks` has the same type as another block. Set `prefix` in `fromPayloadBlocks`.

**After adding `payload-mcp-toolkit`, `user.email` fails to typecheck.** The toolkit adds an API-key auth strategy, so `req.user` and `payload.auth()` can return an API key. Check `'email' in user` before you read user fields.

**Turbopack.** The package works with Turbopack (`next dev` and `next build`, the default in Next 16) and webpack. It ships `.scss` files for the admin, which Next compiles the same way it compiles Payload's own SCSS.

## Limits

This is version 0.1. Before 1.0, a minor version can change the API. Known limits:

- **Payload 3 only.** Payload 4 (canary today) changes the admin UI. The builder does not support it yet.
- **Next.js and React only.** The admin editor and the canvas need a Next.js app (Payload's own requirement). Other frontends can render the stored JSON with their own code.
- **`RenderLayout` needs React Server Components.** `RenderLayout` and the `payload-canvas/react/server` helpers need the Next.js App Router (or another RSC framework).
- **The canvas runtime runs only in the editor's iframe.** `payload-canvas/react/canvas` belongs on the canvas route and nowhere else.
- **Tailwind CSS v4 only.** Styles are Tailwind classes, compiled from your Tailwind v4 entry CSS.
- **One server process.** Live sessions live in memory. See [Multiplayer editing](#multiplayer-editing) and [Deploying](#deploying). Serverless platforms are not supported.
- **Tested databases.** Postgres is tested end to end. Other Payload adapters store the layout in a JSON field and should work, but are not tested.
- **The editor's own labels are in English.** Payload's inputs inside it follow the admin language.

## License

MIT

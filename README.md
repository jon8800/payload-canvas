# Payload Canvas

**A visual drag-and-drop website builder for [Payload CMS](https://payloadcms.com) 3.**

<p align="center">
  <a href="docs/media/drag-and-drop.mp4"><img src="docs/media/drag-and-drop.gif" width="960" alt="Dragging a section on the canvas while the other sections slide out of the way, reordering it in the Layers tree, and dropping a ready-made section onto the page"></a>
  <br>
  <sub>Smooth drag and drop: move a section on the canvas, reorder it in Layers, drop in a ready-made section. <a href="docs/media/drag-and-drop.mp4">Watch the MP4</a>.</sub>
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/media/builder-dark.png" alt="The builder in dark theme with a button selected and the Styles panel open"><br><sub>The full-screen builder: Layers, the live canvas, and the Styles panel.</sub></td>
    <td width="50%"><img src="docs/media/builder-light.png" alt="The builder in light theme"><br><sub>The same editor in Payload's light theme.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/media/ai-assistant.png" alt="The AI assistant after the request 'Make the hero headline punchier'"><br><sub>The AI assistant edits the page from a prompt and lists what it changed.</sub></td>
    <td><img src="docs/media/multiplayer.png" alt="Another editor's cursor and selection on the canvas"><br><sub>Multiplayer: another editor's cursor and selection show live.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/media/sections.png" alt="The Sections tab with section thumbnails"><br><sub>Ready-made sections with real thumbnails. Drag one onto the page.</sub></td>
    <td><img src="docs/media/site-desktop.png" alt="The Northwind Studio demo site on desktop"><br><sub>The demo site the starter can seed.</sub></td>
  </tr>
</table>

<details>
<summary>More screenshots: the Styles panel, the demo site on a phone</summary>
<br>
<table>
  <tr>
    <td width="50%" align="center"><img src="docs/media/styles-panel.png" width="300" alt="The Styles panel with typography, background and border controls"><br><sub>The Styles panel reads and writes Tailwind classes, per breakpoint and state.</sub></td>
    <td width="50%" align="center"><img src="docs/media/site-mobile.png" width="300" alt="The Northwind Studio demo site on a phone"><br><sub>The demo site on a phone.</sub></td>
  </tr>
</table>
</details>

Install Payload Canvas as a plugin in any Payload app, or start from the starter app in this repository.

- Editors build pages on a live canvas: drag blocks, nest them, style them, publish.
- Developers keep full control: blocks are Payload field configs, components are plain React, styles are Tailwind classes.
- AI agents build and edit pages over MCP. An open editor shows each AI change as it happens.

## Packages

| Package | What it is |
|---|---|
| [`payload-canvas`](packages/payload-canvas/README.md) | The Payload plugin and the React renderer in one package: the full-screen builder, block definitions, the CSS compiler, live editing, the AI assistant, MCP tools, and `RenderLayout` with the default block components and the canvas runtime (`payload-canvas/react`). |
| [`create-payload-canvas`](packages/create-payload-canvas/README.md) | A CLI that creates a new project from the starter app. |

Requirements: Payload 3.90+, Next.js 16.3+, React 19.2+, Tailwind CSS 4.3+, Node.js 20.9+.

## Features

- **Full-screen builder** for any collection you list, opened from the document's **Builder** tab. Payload keeps save, drafts, autosave, versions, locking and access control.
- **16 nestable blocks**: stack, grid, heading, text, rich text (Payload's Lexical editor), image, video, button, link, menu, list, quote, divider, spacer, collection list (documents from any collection), and field (shows a document field in templates). Add your own with `defineBlock`, or reuse your existing Payload blocks with `fromPayloadBlocks`.
- **Live canvas** in an iframe that renders your real components, including server components. Drag and drop on the canvas and in the layers tree, a "+" between blocks, fluid, desktop, tablet, mobile and custom widths.
- **Inline editing**: double-click text or an image on the canvas to change it in place, in the default blocks and in your own components.
- **Styles panel**: visual controls that read and write Tailwind v4 classes, with breakpoints and hover/focus states. Your `@theme` tokens appear in the pickers.
- **Theme global**: editors pick colors, fonts (any Google Font), radius and spacing. The site gets them as CSS variables.
- **CSS on save**: only the classes a page uses, compiled against your own Tailwind entry. Works in standalone output and Docker.
- **Sections**: ready-made block trees for editors and AI agents, and sections that editors save themselves.
- **Templates and binding**: one layout for every post, with block props bound to document fields, plus a collection list block for "latest posts" sections.
- **Animations**: entrance, hover, press, scroll and loop effects per block, on the `motion` package.
- **Multiplayer**: several people and AI agents edit one page at the same time, with presence.
- **Localization**: one shared layout with translated props.
- **References**: "Used in" lists on media, and delete protection for files a page still uses.
- **AI assistant** in the editor, with adapters for OpenRouter, Cloudflare, OpenAI-compatible servers and Anthropic, plus image generation.
- **AI over MCP**: tools for [`payload-mcp-toolkit`](https://www.npmjs.com/package/payload-mcp-toolkit) to list blocks, insert sections and apply edits, with live updates in open editors.
- **Headless friendly**: the layout is JSON. Render it with `payload-canvas/react` or your own code.

## Quick start

### Add the builder to your Payload app

```bash
pnpm add payload-canvas tailwindcss @tailwindcss/postcss postcss
```

Then follow the [install guide](packages/payload-canvas/README.md#install): add the plugin, a canvas route and a page route. It takes about ten minutes.

### Or start a new project from the starter

```bash
pnpm create payload-canvas my-website
cd my-website
pnpm dev
```

The CLI copies the starter app, creates a Postgres database, writes `.env`, installs, and can seed demo content. Open http://localhost:3000/admin and create the first user.

Common flags (full list in [`packages/create-payload-canvas`](packages/create-payload-canvas/README.md)):

| Flag | Meaning |
|---|---|
| `-y`, `--yes` | Ask nothing. Use defaults and seed demo content. |
| `--db-url <url>` | Postgres URL. Or use `--db-host`, `--db-port`, `--db-user`, `--db-password`, `--db-name`. |
| `--seed` / `--no-seed` | Seed demo content, or not. |
| `--no-install` | Only create the files. |
| `--reuse-db` / `--skip-db` | Use a database that already exists / do not touch Postgres. |
| `--packages <path>` | Pack the `payload-canvas` package from a checkout of this repo, instead of using the version on npm. |

```bash
# Non-interactive, for CI and agents
npx create-payload-canvas my-website --yes --db-url postgresql://postgres:postgres@localhost:5432/my_website
```

The CLI never runs `payload migrate`. Before your first production deploy, run `pnpm payload migrate:create` in your app and commit the files. Migrations belong to the app, not to the plugin.

## Repository layout

```
payload-toolkit/
  apps/
    starter/                 # Reference app: Payload + Next.js site that uses the builder
  packages/
    payload-canvas/          # payload-canvas: the Payload plugin, admin editor and React renderer
    create-payload-canvas/   # create-payload-canvas: CLI that scaffolds the starter
  docs/
    architecture.md          # the design of the plugin
  scripts/
    build-package.mjs        # builds a package from src to dist
```

## Development

Requirements: Node.js 24, pnpm 10, PostgreSQL.

```bash
pnpm install
cp apps/starter/.env.example apps/starter/.env   # set DATABASE_URL and PAYLOAD_SECRET
pnpm --filter payload-starter dev                # http://localhost:3000/admin
```

In the repository, the starter compiles `payload-canvas` from `src` (`transpilePackages`), so edits show without a build step. The schema syncs on `pnpm dev` (Payload's push mode). Do not run `payload migrate` against the development database.

| Command (repo root) | What it does |
|---|---|
| `pnpm build:packages` | Builds every package in `packages/` to `dist/` (ESM JavaScript and `.d.ts`). |
| `pnpm build` | Builds the packages and the starter. |
| `pnpm test` | Runs the package tests (`node --test`). |
| `pnpm typecheck` | Type-checks every workspace project. |
| `pnpm lint` | Runs Oxlint. |
| `pnpm pack:packages` | Packs the two published packages into `dist-packages/` as `.tgz` files. |

### Publishing

The two packages point their `exports` at `src` for development. `publishConfig` points them at `dist`, and pnpm swaps the fields when it packs or publishes. pnpm also replaces `workspace:*` with the real version. `prepack` runs the build, so a pack or a publish always ships a fresh `dist`.

Always publish with **pnpm**, not `npm publish`: only pnpm applies `publishConfig.exports`.

```bash
# 1. Check each package: the build runs, and pnpm lists the files it would publish.
pnpm --filter payload-canvas publish --dry-run --no-git-checks
pnpm --filter create-payload-canvas publish --dry-run --no-git-checks

# 2. Publish.
npm login
pnpm --filter payload-canvas publish
pnpm --filter create-payload-canvas publish
```

Both packages have `publishConfig.access: public`. The names `payload-canvas` and `create-payload-canvas` are unscoped, so you need no npm organization.

The build (`scripts/build-package.mjs`) compiles each file with TypeScript, adds `.js` to relative imports, copies `.scss` files, and checks that `publishConfig.exports` matches `exports`. When you add an entry to `exports`, add the matching `dist` entry to `publishConfig.exports`; the build prints it for you. Test files (`*.test.ts`, `*.test-data.ts`) stay out of `dist`.

## Docker

The starter's image builds from the repository root.

```bash
cd apps/starter
pnpm payload migrate:create initial    # once, and after every schema change
docker compose up -d db
docker compose run --rm migrate
docker compose up -d --build app       # http://localhost:3000
```

- `next build` reads the database while it prerenders pages, so the build needs a database that already has the schema. The compose file connects the build to the published `db` port through `host.docker.internal`.
- In production, Payload does not push schema changes. Create migrations with `pnpm payload migrate:create` and apply them with the `migrate` service. Or add `prodMigrations` to `postgresAdapter`, so the app runs them on start.
- The app reads `DATABASE_URL` and `PAYLOAD_SECRET` at runtime. Set `PAYLOAD_SECRET` in a `.env` file next to `docker-compose.yml`.
- Uploads go to the `media` volume (`/app/apps/starter/public/media`). The app runs as a non-root user.

## License

[MIT](LICENSE)

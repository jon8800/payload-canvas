# payload-toolkit

A visual website builder for [Payload CMS](https://payloadcms.com) 3. Install it as a plugin in any Payload app, or start from the starter app in this repository.

- Editors build pages on a live canvas: drag blocks, nest them, style them, publish.
- Developers keep full control: blocks are Payload field configs, components are plain React, styles are Tailwind classes.
- AI agents build and edit pages over MCP. An open editor shows each AI change as it happens.

![The Builder tab: block library, canvas and Styles panel](docs/screenshots/design/16-light-1440.png)

> Screenshots live in `docs/screenshots/`. That folder is ignored by git for now, so the images show only in a local checkout.

| | |
|---|---|
| ![Sections library](docs/screenshots/design/17-light-1440-sections.png) | ![Styles panel color picker](docs/screenshots/styles-panel/03-color-picker.png) |
| ![The starter home page](docs/screenshots/starter/site-home.png) | ![Rich text in the inspector](docs/screenshots/blocks/04-richtext-inspector.png) |

## Features

- **Builder tab** in Payload's document view, for any collection you list. Payload keeps save, drafts, autosave, versions, locking and access control.
- **15 nestable blocks**: stack, grid, heading, text, rich text (Payload's Lexical editor), image, video, button, link, list, quote, divider, spacer, collection list (documents from any collection), and field (shows a document field in templates). Add your own with `defineBlock`.
- **Live canvas** in an iframe that renders your real components. Drag and drop on the canvas and in the outline tree. Desktop, tablet, mobile and custom widths.
- **Styles panel**: visual controls that read and write Tailwind v4 classes, with breakpoints and hover/focus states. Your `@theme` tokens appear in the pickers.
- **CSS on save**: only the classes a page uses, compiled against your own Tailwind entry. Works in standalone output and Docker.
- **Sections**: ready-made block trees (hero, features, pricing, footer) for editors and AI agents.
- **Templates and binding**: one layout for every post, with block props bound to document fields, plus a collection list block for "latest posts" sections.
- **AI over MCP**: tools for [`payload-mcp-toolkit`](https://www.npmjs.com/package/payload-mcp-toolkit) to list blocks, insert sections and apply edits, with live updates in open editors.
- **Headless friendly**: the layout is JSON. Render it with `@payload-toolkit/builder-react` or your own code.

## Quick start

### Add the builder to your Payload app

```bash
pnpm add @payload-toolkit/builder @payload-toolkit/builder-react tailwindcss @tailwindcss/postcss postcss
```

Then follow the [install guide](packages/builder/README.md#install): add the plugin, a canvas route and a page route. It takes about ten minutes.

### Or start a new project from the starter

```bash
npx create-payload-toolkit my-website
cd my-website
pnpm dev
```

Open http://localhost:3000/admin and create the first user. See [`packages/create-payload-starter`](packages/create-payload-starter/README.md) for the flags.

## Repository layout

```
payload-toolkit/
  apps/
    starter/                 # Reference app: Payload + Next.js site that uses the builder
  packages/
    builder/                 # @payload-toolkit/builder: the Payload plugin and admin editor
    builder-react/           # @payload-toolkit/builder-react: renderer, default blocks, canvas
    create-payload-starter/  # create-payload-toolkit: CLI that scaffolds the starter
    shared/                  # deprecated, kept for reference
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

In the repository, the starter compiles the packages from `src` (`transpilePackages`), so edits show without a build step. The schema syncs on `pnpm dev` (Payload's push mode). Do not run `payload migrate` against the development database.

| Command (repo root) | What it does |
|---|---|
| `pnpm build:packages` | Builds every package in `packages/` to `dist/` (ESM JavaScript and `.d.ts`). |
| `pnpm build` | Builds the packages and the starter. |
| `pnpm test` | Runs the package tests (`node --test`). |
| `pnpm typecheck` | Type-checks every workspace project. |
| `pnpm lint` | Runs Oxlint. |
| `pnpm pack:packages` | Packs both builder packages into `dist-packages/` as `.tgz` files. |

### Publishing

The packages point their `exports` at `src` for development. `publishConfig` points them at `dist`, and pnpm swaps the fields when it packs or publishes. `prepack` runs the build, so `pnpm publish` always ships a fresh `dist`.

```bash
pnpm --filter @payload-toolkit/builder publish
pnpm --filter @payload-toolkit/builder-react publish
```

The build (`scripts/build-package.mjs`) compiles each file with TypeScript, adds `.js` to relative imports, copies `.scss` files, and checks that `publishConfig.exports` matches `exports`. When you add an entry to `exports`, add the matching `dist` entry to `publishConfig.exports`; the build prints it for you.

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

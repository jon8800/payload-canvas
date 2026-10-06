# payload-toolkit

A visual website builder for [Payload CMS](https://payloadcms.com) 3. Install it as a plugin in any Payload app, or start from the starter app in this repository.

- Editors build pages on a live canvas: drag blocks, nest them, style them, publish.
- Developers keep full control: blocks are Payload field configs, components are plain React, styles are Tailwind classes.
- AI agents build and edit pages over MCP. An open editor shows each AI change as it happens.

## Packages

| Package | What it is |
|---|---|
| [`@payload-toolkit/builder`](packages/builder/README.md) | The Payload plugin: the full-screen builder, block definitions, the CSS compiler, live editing, the AI assistant, MCP tools. |
| [`@payload-toolkit/builder-react`](packages/builder-react/README.md) | `RenderLayout` for your site, the default block components, the canvas runtime. |
| [`create-payload-toolkit`](packages/create-payload-starter/README.md) | A CLI that creates a new project from the starter app. |

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
- **Headless friendly**: the layout is JSON. Render it with `@payload-toolkit/builder-react` or your own code.

## Quick start

### Add the builder to your Payload app

```bash
pnpm add @payload-toolkit/builder @payload-toolkit/builder-react tailwindcss @tailwindcss/postcss postcss
```

Then follow the [install guide](packages/builder/README.md#install): add the plugin, a canvas route and a page route. It takes about ten minutes.

### Or start a new project from the starter

```bash
pnpm create payload-toolkit my-website
cd my-website
pnpm dev
```

The CLI copies the starter app, creates a Postgres database, writes `.env`, installs, and can seed demo content. Open http://localhost:3000/admin and create the first user.

Common flags (full list in [`packages/create-payload-starter`](packages/create-payload-starter/README.md)):

| Flag | Meaning |
|---|---|
| `-y`, `--yes` | Ask nothing. Use defaults and seed demo content. |
| `--db-url <url>` | Postgres URL. Or use `--db-host`, `--db-port`, `--db-user`, `--db-password`, `--db-name`. |
| `--seed` / `--no-seed` | Seed demo content, or not. |
| `--no-install` | Only create the files. |
| `--reuse-db` / `--skip-db` | Use a database that already exists / do not touch Postgres. |
| `--packages <path>` | Pack the builder packages from a checkout of this repo, instead of using the versions on npm. |

```bash
# Non-interactive, for CI and agents
npx create-payload-toolkit my-website --yes --db-url postgresql://postgres:postgres@localhost:5432/my_website
```

The CLI never runs `payload migrate`. Before your first production deploy, run `pnpm payload migrate:create` in your app and commit the files. Migrations belong to the app, not to the plugin.

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
| `pnpm pack:packages` | Packs the three published packages into `dist-packages/` as `.tgz` files. |

### Publishing

The packages point their `exports` at `src` for development. `publishConfig` points them at `dist`, and pnpm swaps the fields when it packs or publishes. pnpm also replaces `workspace:*` with the real version. `prepack` runs the build, so a pack or a publish always ships a fresh `dist`.

Always publish with **pnpm**, not `npm publish`: only pnpm applies `publishConfig.exports`.

```bash
# 1. Check every package: the build runs, and pnpm lists the files it would publish.
pnpm --filter @payload-toolkit/builder publish --dry-run --no-git-checks
pnpm --filter @payload-toolkit/builder-react publish --dry-run --no-git-checks
pnpm --filter create-payload-toolkit publish --dry-run --no-git-checks

# 2. Publish, builder first: builder-react has it as a peer dependency.
npm login
pnpm --filter @payload-toolkit/builder publish
pnpm --filter @payload-toolkit/builder-react publish
pnpm --filter create-payload-toolkit publish
```

The `@payload-toolkit` scope must exist on npm as an organization (or a user) that you can publish to. Each package has `publishConfig.access: public`.

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

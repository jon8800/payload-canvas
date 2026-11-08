# create-payload-canvas

<p align="center">
  <a href="https://github.com/jon8800/payload-canvas/blob/main/docs/media/drag-and-drop.mp4"><img src="https://raw.githubusercontent.com/jon8800/payload-canvas/main/docs/media/drag-and-drop.gif" width="960" alt="Dragging a section on the canvas while the other sections slide out of the way, reordering it in the Layers tree, and dropping a ready-made section onto the page"></a>
</p>

Creates a new Payload CMS website builder project from the Payload Canvas starter.

Requirements: Node.js 20.9 or later, a running PostgreSQL server, and pnpm (npm works too). The starter itself is downloaded from GitHub, so the first run needs network access.

```bash
pnpm create payload-canvas my-website
# or
npx create-payload-canvas my-website
```

The CLI asks for the project name, your Postgres details, which starter features to keep, and whether to seed demo content. It asks nothing when you pass `--yes`, or when the input is not a terminal (CI, agents). Every question has a flag.

## What it does

1. Checks Postgres first: the server must be reachable, and the database must not exist yet. If something is wrong, it stops before it writes any file.
2. Copies the starter app (`apps/starter`) and the AI guides it links to (`docs/ai`).
   - Inside a checkout of the repo, it copies from the checkout.
   - Anywhere else, it downloads the repo from GitHub (`jon8800/payload-canvas`).
3. Leaves out repo-only files: `node_modules`, `.next`, `.turbo`, `.env`, `next-env.d.ts`, Docker files (they expect the monorepo), `scripts/setup.ts` and its helpers `scripts/lib/create-database.ts` and `scripts/lib/generate-env.ts`, `scripts/_*`, `docs/qa`, screenshots, and uploaded files in `public/media`.
4. Removes the starter features you left out (see [Features](#features)).
5. Sets the package name, removes the repo-only scripts and the dev dependencies they needed, and points `payload-canvas` at a source (see below).
6. Writes `.env` from `.env.example` with your `DATABASE_URL` and a new random `PAYLOAD_SECRET`.
7. Creates the database.
8. Installs dependencies with pnpm (npm if pnpm is missing).
9. Runs `seed:demo` if you chose to seed. On a fresh database the seed creates the tables. Without the demo seed, it runs `seed:classes`, which adds the editable classes that the ready-made sections use.
10. Prints a summary with the exact next commands.

It never runs `payload migrate`. Local development uses `push: true`, so the schema syncs when you run `pnpm dev`.

## Features

The starter has a few parts you can leave out. All of them are kept by default. Without `--yes`, the CLI shows a list with all of them checked. Uncheck the ones you do not want. A `--no-<feature>` flag leaves a feature out without asking.

| Feature | Flag | What you lose |
|---|---|---|
| Admin look | `--no-look` | Neutral colors and finer details in the admin (`src/admin/look`). |
| Sidebar navigation | `--no-nav` | The grouped sidebar with icons (`src/admin/nav`). The admin uses Payload's default sidebar. |
| Dashboard widgets | `--no-dashboard` | Quick actions, recent edits, drafts, form messages, site checks, scheduled publishes and analytics (`src/admin/dashboard`). The admin shows Payload's collection cards. |
| Demo content | `--no-demo` | The demo pages, posts and images seed (`scripts/seed-demo.ts` and the `seed:demo` script). This also turns off seeding. |
| AI assistant | `--no-ai` | The chat panel in the page builder, and its settings in `.env`. |

The CLI deletes the feature's files and removes its lines from `src/payload.config.ts`, `src/app/(payload)/custom.scss`, `.env.example` and the admin import map. The project type-checks with any mix of features.

## Flags

| Flag | Meaning |
|---|---|
| `[project-dir]` | Folder to create. Its name is the package name. Lowercase letters, numbers, `-` and `_`. The folder must not exist, or must be empty. Default with `--yes`: `my-website`. |
| `-y`, `--yes` | Ask nothing. Use defaults. Seeds demo content unless you pass `--no-seed`. |
| `--db-url <url>` | `postgresql://user:password@host:5432/name`. Replaces the five flags below. |
| `--db-host <host>` | Default `localhost`. |
| `--db-port <port>` | Default `5432`. |
| `--db-user <user>` | Default `postgres`. |
| `--db-password <pw>` | Default `postgres`. |
| `--db-name <name>` | Default: the project name, with `_` instead of `-`. |
| `--reuse-db` | Use the database if it already exists. Without this flag, an existing database is an error. |
| `--skip-db` | Do not connect to Postgres. Writes `.env` only. This also skips seeding. |
| `--seed` / `--no-seed` | Seed demo content, or not. |
| `--no-install` | Do not install. This also skips seeding. |
| `--no-look`, `--no-nav`, `--no-dashboard`, `--no-demo`, `--no-ai` | Leave out a starter feature. See [Features](#features). `--no-demo` also turns off seeding. |
| `--github` | Download the starter from GitHub, even when the CLI runs inside a checkout. |
| `--ref <name>` | Branch or tag to download. Default `main`. |
| `--packages <path>` | Path to a checkout of the repo. The CLI packs the `payload-canvas` package from there. |
| `-h`, `--help` | Show help. |

## Where the package comes from

| Case | `payload-canvas` in the new project |
|---|---|
| The CLI runs inside a checkout, or you pass `--packages <path>` | a `file:./.tarballs/...` tarball, packed with `pnpm pack` (it builds `dist/` first). Commit `.tarballs/` with the project. |
| Neither | The version on npm (`^0.5.1`). |

Without `--packages`, and outside a checkout, the CLI checks the npm registry first. If the package is not on npm (for example, a `--ref` with an unreleased version), it stops before it writes any file and tells you to use `--packages <path>` or `--no-install`.

## Examples

```bash
# Interactive
pnpm create payload-canvas

# Fully non-interactive, with demo content
npx create-payload-canvas my-website --yes --db-url postgresql://postgres:postgres@localhost:5432/my_website

# Only the files, no install, no database
npx create-payload-canvas my-website --yes --no-install --skip-db

# Without the AI assistant and the demo content
npx create-payload-canvas my-website --yes --no-ai --no-demo

# From GitHub, with the package from a local checkout (before it is published)
npx create-payload-canvas my-website --yes --github --packages C:\code\payload-canvas

# Use a database that already exists
npx create-payload-canvas my-website --yes --db-name my_site --reuse-db
```

## After it finishes

```bash
cd my-website
pnpm dev
```

Open http://localhost:3000/admin and create the first user.

Before your first production deploy, run this in the project and commit the new files in `src/migrations`:

```bash
pnpm payload migrate:create
```

Migrations belong to your app, not to the plugin. Do not run `payload migrate` on your local database.

## Errors it explains

- Postgres is not running, the host is wrong, or the password is wrong.
- The database already exists (use `--reuse-db` or another `--db-name`).
- The folder already exists and is not empty.
- The `payload-canvas` package is not on npm.
- The GitHub download fails, or the `--ref` does not exist.

If the copy or pack step fails, the CLI deletes the half-made folder. If the install fails, it keeps the folder so you can fix the problem and run `pnpm install` there.

## Maintainers

- The GitHub owner is `GITHUB_OWNER` in `src/config.ts`. The list of files the CLI leaves out is `SKIP_NAMES` and `SKIP_PATHS` in the same file.
- The starter's `starter-features.json` lists each feature's files and scripts. In code, a line with `@feature:<id>` starts a part that belongs to a feature, and a line with `@end:<id>` ends it. The prompt and the flags come from `FEATURES` in `src/config.ts`. Add a new feature in both places.
- `pnpm check:features` copies the starter for every mix of features, applies it, and runs the starter's TypeScript check. Run it after you change a feature. `pnpm test` runs the unit tests.
- After copying, the CLI checks the new project for leftovers (`workspace:` links, paths into `packages/`, `baseUrl`, Docker files) and prints a warning for each one it finds.
- Build with `pnpm build`. Run from the repo with `node dist/index.js`. `pnpm pack` builds first (`prepack`).

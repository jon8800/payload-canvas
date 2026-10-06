# create-payload-toolkit

Creates a new Payload CMS website builder project from the payload-toolkit starter.

Requirements: Node.js 20.9 or later, a running PostgreSQL server, and pnpm (npm works too). The starter itself is downloaded from GitHub, so the first run needs network access.

```bash
pnpm create payload-toolkit my-website
# or
npx create-payload-toolkit my-website
```

The CLI asks for the project name, your Postgres details, and whether to seed demo content. It asks nothing when you pass `--yes`, or when the input is not a terminal (CI, agents). Every question has a flag.

## What it does

1. Checks Postgres first: the server must be reachable, and the database must not exist yet. If something is wrong, it stops before it writes any file.
2. Copies the starter app (`apps/starter`) and the AI guides it links to (`docs/ai`).
   - Inside a payload-toolkit checkout, it copies from the checkout.
   - Anywhere else, it downloads the repo from GitHub (`jon8800/payload-toolkit`).
3. Leaves out repo-only files: `node_modules`, `.next`, `.turbo`, `.env`, `next-env.d.ts`, Docker files (they expect the monorepo), `scripts/setup.ts`, `scripts/lib`, `scripts/_*`, `docs/qa`, screenshots, and uploaded files in `public/media`.
4. Sets the package name, removes the repo-only scripts and the dev dependencies they needed, and points `@payload-toolkit/builder` and `@payload-toolkit/builder-react` at a source (see below).
5. Writes `.env` from `.env.example` with your `DATABASE_URL` and a new random `PAYLOAD_SECRET`.
6. Creates the database.
7. Installs dependencies with pnpm (npm if pnpm is missing).
8. Runs `seed:demo` if you chose to seed. On a fresh database the seed creates the tables.
9. Prints a summary with the exact next commands.

It never runs `payload migrate`. Local development uses `push: true`, so the schema syncs when you run `pnpm dev`.

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
| `--github` | Download the starter from GitHub, even when the CLI runs inside a checkout. |
| `--ref <name>` | Branch or tag to download. Default `main`. |
| `--packages <path>` | Path to a payload-toolkit checkout. The CLI packs the builder packages from there. |
| `-h`, `--help` | Show help. |

## Where the builder packages come from

| Case | `@payload-toolkit/*` in the new project |
|---|---|
| The CLI runs inside a checkout, or you pass `--packages <path>` | `file:./.tarballs/...` tarballs, packed with `pnpm pack` (it builds `dist/` first). Commit `.tarballs/` with the project. |
| Neither | The version on npm (`^0.1.0`). |

Without `--packages`, and outside a checkout, the CLI checks the npm registry first. If the packages are not on npm (for example, a `--ref` with an unreleased version), it stops before it writes any file and tells you to use `--packages <path>` or `--no-install`.

## Examples

```bash
# Interactive
pnpm create payload-toolkit

# Fully non-interactive, with demo content
npx create-payload-toolkit my-website --yes --db-url postgresql://postgres:postgres@localhost:5432/my_website

# Only the files, no install, no database
npx create-payload-toolkit my-website --yes --no-install --skip-db

# From GitHub, with the packages from a local checkout (before they are published)
npx create-payload-toolkit my-website --yes --github --packages C:\code\payload-toolkit

# Use a database that already exists
npx create-payload-toolkit my-website --yes --db-name my_site --reuse-db
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
- The builder packages are not on npm.
- The GitHub download fails, or the `--ref` does not exist.

If the copy or pack step fails, the CLI deletes the half-made folder. If the install fails, it keeps the folder so you can fix the problem and run `pnpm install` there.

## Maintainers

- The GitHub owner is `GITHUB_OWNER` in `src/config.ts`. The list of files the CLI leaves out is `SKIP_NAMES` and `SKIP_PATHS` in the same file.
- After copying, the CLI checks the new project for leftovers (`workspace:` links, paths into `packages/`, `baseUrl`, Docker files) and prints a warning for each one it finds.
- Build with `pnpm build`. Run from the repo with `node dist/index.js`. `pnpm pack` builds first (`prepack`).
- `packages/shared` is not used by the CLI.

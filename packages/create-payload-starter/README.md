# create-payload-toolkit

Creates a new Payload CMS website builder project from the payload-toolkit starter.

## Usage

```bash
npx create-payload-toolkit my-website
```

The CLI asks for the project name, your Postgres details, and whether to seed demo content.

## Flags

| Flag | Meaning |
| --- | --- |
| `-y`, `--yes` | Use defaults and ask nothing. Seeds demo content unless you pass `--no-seed`. |
| `--db-url <url>` | Postgres URL. Replaces the host, port, user, password and name flags. |
| `--db-host`, `--db-port`, `--db-user`, `--db-password`, `--db-name` | Single Postgres settings. |
| `--seed` / `--no-seed` | Seed demo content, or not. |
| `--no-install` | Do not install dependencies. This also skips seeding. |
| `-h`, `--help` | Show help. |

CI example:

```bash
npx create-payload-toolkit my-website --yes --db-url postgresql://postgres:postgres@localhost:5432/my_website
```

## What it does

1. Copies the starter app. Inside the payload-toolkit repo it copies `apps/starter`. Anywhere else it downloads `apps/starter` from GitHub.
2. Skips `node_modules`, `.next`, `.turbo`, `.env` and uploaded files in `public/media`.
3. Sets the package name, removes `private`, and points `@payload-toolkit/builder` and `@payload-toolkit/builder-react` at a dependency.
   - Inside the repo, it packs both packages into `.tarballs/` and uses `file:` paths.
   - Outside the repo, it uses the published version `^0.1.0`.
4. Writes `.env` from `.env.example` with your `DATABASE_URL` and new random secrets.
5. Creates the Postgres database if it does not exist.
6. Installs dependencies with pnpm. It uses npm if pnpm is missing.
7. Runs `seed:demo` if you chose to seed. The seed script creates the tables on a fresh database.

It never runs `payload migrate`. The schema syncs when you first run `pnpm dev`.

## After it finishes

```bash
cd my-website
pnpm dev
```

Open http://localhost:3000/admin and create the first user.

## Maintainers

- The GitHub owner is the constant `GITHUB_OWNER` in `src/config.ts`. Change it there if the repo moves.
- Outside the repo, the CLI needs `@payload-toolkit/builder` and `@payload-toolkit/builder-react` published to npm at `0.1.0` or higher.
- Build with `pnpm build`. Run from the repo with `node dist/index.js`.

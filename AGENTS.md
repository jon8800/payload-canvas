# payload-toolkit

A Payload CMS v3 starter for building websites quickly with composable atomic blocks. Turborepo monorepo with `apps/starter` (the Payload + Next.js app), `packages/create-payload-starter` (CLI scaffolder), and `packages/shared` (utilities).

See [`STRATEGY.md`](./STRATEGY.md) for the product strategy — target problem, approach, personas, metrics, tracks.

## Tech stack

- **Payload CMS v3** with Postgres adapter, blocks stored as JSON
- **Next.js 15** (App Router, RSC by default, client components only at leaves)
- **React 19**, **Tailwind v4** (CSS-first, no `tailwind.config`), **shadcn/ui**, **Base UI** primitives
- **pnpm** workspaces, **Turborepo**, **Turbopack** (never fall back to webpack)
- **PostgreSQL** locally and in production
- Deployment target: VPS / Docker (no Vercel-specific features)

## Critical project rules

- **Never run `payload migrate` against the local dev database.** Dev uses `push: true` — Drizzle auto-syncs schema on `pnpm dev`. Migration files are only for production deploys; generate via `pnpm payload migrate:create` when prepping a release.
- **Don't hand-write migrations to express things Payload's collection config can already declare.** For compound unique constraints, use `indexes: [{ fields: [...], unique: true }]` at the collection level paired with `disableUnique: true` on individual fields.
- **No Tailwind utilities inside admin code.** Admin components use SCSS modules under `@layer payload-default` with Payload CSS variables only. Tailwind Preflight in the frontend would leak into the admin and break Payload's UI.
- **Block storage is Postgres JSON** — preserves clean schema and avoids type generation explosion across deeply nested blocks.
- **Server Components by default** — push client boundaries to leaf nodes only.

## Repository layout

```
payload-toolkit/
  apps/
    starter/              # Payload CMS + Next.js app, admin at /admin
  packages/
    create-payload-starter/  # CLI scaffolder
    shared/                  # Cross-cutting utilities
  docs/
    solutions/            # Documented solutions and patterns (see below)
    archive/
      planning-gsd/       # Archived legacy GSD planning docs (read-only reference)
  .compound-engineering/  # Compound Engineering workflow config
  STRATEGY.md             # Product strategy (target problem, approach, tracks)
  CLAUDE.md               # This file
```

## Documented Solutions

`docs/solutions/` — documented solutions and durable patterns from past work, organized by category with YAML frontmatter (`module`, `tags`, `problem_type`, `applies_when`). Categories include `architecture-patterns/`, `conventions/`, `design-patterns/`, plus bug categories. Relevant when implementing or debugging in documented areas — current entries cover Payload admin component conventions, theming variable injection, data migrations via the local API, and the two-pass admin redesign workflow.

## Workflow notes

- This project uses the **Compound Engineering** plugin (`/ce-*` skills). `STRATEGY.md` and `docs/solutions/` are picked up as grounding by `/ce-plan`, `/ce-brainstorm`, and `/ce-work`.
- `.planning/` was the legacy GSD workflow scaffold. It's archived under `docs/archive/planning-gsd/` for historical reference and is not actively maintained.
- Codex CLI is used for code reviews (`codex:codex-rescue`).

## Out of scope

The following are explicitly not goals (lifted from the v1.1 strategy):

- Frontend auth (login/register pages) — admin panel only for content management
- Mobile app — web only
- Vercel-specific features — must work on VPS/Docker
- Full CSS property abstraction like Webflow — simplified subset only
- Per-page theme overrides — global theme only
- CSS-in-JS / styled-components — Tailwind v4 + CSS variables
- Dark mode toggle — can be added via theme settings later, not in roadmap

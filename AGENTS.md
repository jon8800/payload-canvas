# payload-toolkit

A website builder for Payload CMS v3: composable layout blocks, a visual drag-drop page builder, theming, and (planned) templates for collection documents. Turborepo monorepo with `apps/starter` (the Payload + Next.js app), `packages/create-payload-starter` (CLI scaffolder), and `packages/shared` (utilities).

## Direction

- The code so far was written by weaker AI models. Much of it is clunky or half working. **Nothing here is sacred** — any part can be ripped out, replaced, or redesigned. Do not preserve a pattern only because it exists.
- Goal: a robust, flexible builder that works with **any collection shape and any fields**, likely shipped as a Payload plugin (with the starter as a reference app). Inspiration: Shopify theme customizer, Elementor, Webflow.
- Later: make it agentic — an AI must be able to read the data model and the available blocks and build pages (MCP and/or skills). The owner's MCP plugin lives at `C:\Projects\sandbox\payload-plugins\payload-mcp-toolkit`.
- `docs/architecture.md` is the target design (draft). Read it before building any part of the plugin.
- `STRATEGY.md` holds the earlier product strategy. It predates the plugin direction and will be revised.

## Tech stack

- **Payload CMS 3.90** with the Postgres adapter, blocks stored as JSON
- **Next.js 16.3** (App Router, RSC by default, client components only at leaves). Payload 3.x supports Next 16 only, not 17. Bundled Next docs: `apps/starter/node_modules/next/dist/docs/`.
  - Request interception lives in `src/proxy.ts` (Next 16 renamed `middleware.ts`).
  - `revalidateTag(tag, profile)` takes 2 arguments — use `{ expire: 0 }` as the profile.
- **React 19.3**, **Tailwind v4** (CSS-first, no `tailwind.config`), **shadcn/ui**, **Base UI** primitives
- **TypeScript 7** (native compiler). `baseUrl` is gone; `paths` entries start with `./`.
  - The shadcn CLI mis-resolves `@/` without `baseUrl`: after `pnpm dlx shadcn@latest add <name>`, change `from "cn"` to `from "@/lib/utils"` in the new files and run `pnpm remove cn`.
- **Oxlint** (`.oxlintrc.json`), not ESLint. Vendored shadcn files in `src/components/ui/` are not linted.
- **pnpm 10** workspaces, **Turborepo**, **Turbopack** (never fall back to webpack)
- **PostgreSQL** locally and in production. Deployment target: VPS / Docker (no Vercel-specific features).

## Project rules

- **Never run `payload migrate` against the local dev database.** Dev uses `push: true` — Drizzle auto-syncs schema on `pnpm dev`. Migration files are only for production deploys; generate via `pnpm payload migrate:create` when prepping a release.
- **Don't hand-write migrations to express things Payload's collection config can already declare.** For compound unique constraints, use `indexes: [{ fields: [...], unique: true }]` at the collection level paired with `disableUnique: true` on individual fields.
- **Data migrations go through the Payload Local API**, not raw SQL, so they work on any database adapter.
- **No Tailwind utilities inside admin code.** Admin components use SCSS under `@layer payload-default` with Payload CSS variables only. Tailwind Preflight would leak into the admin and break Payload's UI.
- **Server Components by default** — push client boundaries to leaf nodes only.
- **Use public Payload APIs** (`@payloadcms/ui` exports, documented hooks) over deep imports of Payload internals.
- **Write files as UTF-8 without a BOM.** Turbopack fails to parse `tsconfig.json` with a BOM. On Windows PowerShell 5.1, `Set-Content -Encoding utf8` adds a BOM — use the Write/Edit tools instead.
- **Payload 4 is coming** (canary today). Keep admin UI code in a thin layer — Payload CSS variables, Base UI primitives, SCSS — so it can be adapted when v4 changes the admin UI.

## Repository layout

```
payload-toolkit/
  apps/
    starter/                 # Payload CMS + Next.js app, admin at /admin
  packages/
    create-payload-starter/  # CLI scaffolder
    shared/                  # DB creation and env helpers for the CLI
  STRATEGY.md                # Earlier product strategy (to be revised)
  AGENTS.md                  # This file (CLAUDE.md is a stub that imports it)
```

`apps/starter/AGENTS.md` and `apps/starter/CLAUDE.md` are written by `next dev` itself. Commit them; do not edit them.

Key places in `apps/starter/src/`:

- `blocks/` — the 14 atomic blocks, `registry.ts`, `RenderBlocks.tsx`
- `views/customiser/` — the Layout Customizer (3-pane page builder: block tree, iframe preview, fields panel). It replaces the old standalone repo at `C:\Projects\sandbox\payload\payload-customiser`.
- `fields/theme/`, `globals/` — ThemeSettings, ColorPicker, FontSelector, SliderField
- `hooks/compileBlockStyles.ts` — compiles per-block Tailwind classes on save
- `proxy.ts` — redirects and the `x-pathname` request header

## Commands

Run from `apps/starter/`:

- `pnpm dev` — dev server (also syncs the DB schema via `push: true`)
- `pnpm build` — production build
- `pnpm typecheck` — type check
- `pnpm lint` — Oxlint (must report 0 problems)
- `pnpm generate:types` / `pnpm generate:importmap` — run after changing collections, blocks, or admin components
- `pnpm seed:demo` — seed demo content

Local DB: Postgres on `localhost:5432`, database `payload_toolkit_dev` (see `apps/starter/.env`).

## Current status

- **Built:** 14 atomic blocks with nesting, Pages/Posts/TemplateParts collections, 7 Payload plugins, the Layout Customizer, per-block styles panel, ThemeSettings global, setup CLI.
- **Not built:** templates for collection documents and dynamic data binding (a design existed; it is in git history before the GSD archive was deleted, and needs rework anyway).
- **Under review:** the whole implementation. Known problems include data-loss bugs in the Customiser, Tailwind-on-save styling that misses classes, and hardwired collection slugs, field names, and the `/blog` route.

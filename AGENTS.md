# payload-toolkit

A website builder plugin for Payload CMS v3: composable layout blocks, a visual drag-drop page builder with a Tailwind styles panel, templates with data binding, and AI page building over MCP with live updates. Turborepo monorepo with `apps/starter` (the Payload + Next.js app), `packages/create-payload-starter` (CLI scaffolder), and `packages/shared` (utilities).

## Direction

- The code so far was written by weaker AI models. Much of it is clunky or half working. **Nothing here is sacred** — any part can be ripped out, replaced, or redesigned. Do not preserve a pattern only because it exists.
- Goal: a robust, flexible builder that works with **any collection shape and any fields**, likely shipped as a Payload plugin (with the starter as a reference app). Inspiration: Shopify theme customizer, Elementor, Webflow.
- Later: make it agentic — an AI must be able to read the data model and the available blocks and build pages (MCP and/or skills). The owner's MCP plugin lives at `C:\Projects\sandbox\payload-plugins\payload-mcp-toolkit`.
- `docs/architecture.md` is the design. Read it before changing any part of the plugin. `packages/builder/README.md` is the user guide.
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
    starter/                 # Payload CMS + Next.js app, admin at /admin; reference app for the plugin
  packages/
    builder/                 # @payload-toolkit/builder — the Payload plugin
      src/core/              #   pure: types (the contract), operations + inverse, tree, drop targets, schema, validation
      src/blocks/            #   defaultBlocks() (client-safe entry `/blocks`), linkField()
      src/live/              #   live editing: event bus, SSE events + operations endpoints
      src/mcp/               #   builderMcpTools() for payload-mcp-toolkit
      src/css/               #   Tailwind compile: server (save hook) and browser (canvas)
      src/protocol/          #   postMessage protocol between editor and canvas iframe
      src/admin/             #   editor UI (Payload-native, SCSS, no Tailwind)
      src/plugin/            #   websiteBuilder(): fields, save hook, Builder tab, templates collection, endpoints
    builder-react/           # @payload-toolkit/builder-react — RenderLayout, block components, canvas runtime, /server loadTemplate
    create-payload-starter/  # CLI scaffolder
    shared/                  # DB creation and env helpers for the CLI
  docs/architecture.md       # Target design — read before building
  STRATEGY.md                # Earlier product strategy (to be revised)
  AGENTS.md                  # This file (CLAUDE.md is a stub that imports it)
```

In the repo the starter compiles package source via `transpilePackages`; published packages ship `dist/` (see `packages/builder/README.md`). `packages/builder/src/core/types.ts` is the shared contract — change it deliberately.

Builder rules that are easy to break:

- Layouts are stored in canonical form (no empty `slots`/`props`/`bindings` objects, `hidden` only when true). Always read `block.slots?.[name] ?? []`, and run `normalizeLayout` on load.
- `Position.index` is the block's final index in the target list; for a move within the same list, count after the block leaves.
- Every edit goes through `applyOperation(s)`; undo applies the returned inverse operations.
- Block components add no Tailwind classes of their own — styling comes only from `block.className`, because the generated CSS covers only classes in the data.
- `websiteBuilder()` must be the last plugin, so the layout field stays top-level.
- Block components receive only plain data (links arrive pre-resolved), so custom blocks may be client components. Never pass functions as component props.
- A component that uses its own Tailwind classes must list them in its block definition `classes`.
- Exactly one copy of `@payloadcms/ui` / `next` may be installed. After any dependency change, check that `readlink -f packages/*/node_modules/@payloadcms/ui apps/starter/node_modules/@payloadcms/ui` all point to one `.pnpm` folder. The root `@babel/core` + `babel-plugin-macros` devDependencies exist only for this.
- If Turbopack reports "Module not found" for a file that exists (after renames), restart the dev server.

`apps/starter/AGENTS.md` and `apps/starter/CLAUDE.md` are written by `next dev` itself. Commit them; do not edit them.

Key places in `apps/starter/src/`:

- `builder.ts` — the blocks list (default blocks + the custom `form` block), shared by site and canvas
- `data/sections/` — ready-made sections (editor library + seed)
- `components/BuilderContent.tsx`, `components/ThemeHead.tsx` — site rendering and theme injection
- `app/(builder-canvas)/` — the canvas iframe route
- `fields/theme/`, `globals/` — ThemeSettings, ColorPicker, FontSelector, SliderField
- `proxy.ts` — redirects and the `x-pathname` request header

## Commands

In `packages/builder` and `packages/builder-react`: `pnpm test` (node --test), `pnpm typecheck`, `pnpm lint`.

Run from `apps/starter/`:

- `pnpm dev` — dev server (also syncs the DB schema via `push: true`)
- `pnpm build` — production build
- `pnpm typecheck` — type check
- `pnpm lint` — Oxlint (must report 0 problems)
- `pnpm generate:types` / `pnpm generate:importmap` — run after changing collections, blocks, or admin components
- `pnpm seed:demo` — seed demo content

Local DB: Postgres on `localhost:5432`, database `payload_toolkit_dev` (see `apps/starter/.env`).

## Current status

- **Done:** the plugin with 15 default blocks; the visual editor (outline, canvas with zoom and drag-drop, Payload-native inspector, Webflow-like Styles panel over Tailwind classes, sections library, copy/paste, undo); generated CSS; templates, data binding, Field and Collection list blocks; live editing over SSE; MCP tools for `payload-mcp-toolkit`; the AI assistant panel (`src/ai/` server loop with Claude, `src/admin/editor/assistant/` UI); the starter app with a demo seed.
- **AI testing without a key:** set `BUILDER_AI_FAKE=1` in `apps/starter/.env` (dev only) for a scripted fake model. Remove it afterwards.
- **Next:** multiplayer cursors (CRDT), inline text editing on the canvas, theme settings moved into the plugin.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

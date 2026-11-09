# Payload Canvas starter

A Payload CMS 3 website with the Payload Canvas page builder, on Next.js 16 and Postgres. The admin is at `/admin`. Pages and posts open in the full-screen builder.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the dev server. It also syncs the database schema (`push: true`). |
| `pnpm build`, `pnpm start` | Production build and server. |
| `pnpm typecheck`, `pnpm lint`, `pnpm test` | Checks. |
| `pnpm generate:types`, `pnpm generate:importmap` | Run after you change collections, blocks or admin components. |
| `pnpm payload migrate:create` | Before a production deploy. Commit the files in `src/migrations`. Never run `payload migrate` on the local database. |

Settings live in `.env`. `.env.example` explains each one.

## Plugins

`src/payload.config.ts` wires every plugin, with a comment on each.

- `payload-canvas`: the page builder, templates, the Theme global, the AI assistant and the MCP tools.
- `payload-mcp-toolkit`: AI agents over MCP at `POST /api/mcp`. Sign in with the admin login, or use a key from **Settings → API Keys**.
- `@payloadcms/plugin-*`: SEO, redirects, forms, nested categories, search, import and export.
<!-- @feature:gallery -->
- `payload-media-gallery`: **Content → Media** as a grid of thumbnails, with a lightbox, drag-and-drop upload and bulk select. Upload pickers show the same grid.
<!-- @end:gallery -->
<!-- @feature:workflows -->
- `payload-workflows`: **Automation → Workflows**, a visual workflow builder, and a **Run** tab in **Automation → Payload Jobs** that draws every job as a graph.
<!-- @end:workflows -->
<!-- @feature:reviews -->
- `payload-google-reviews`: **Content → Reviews**, Google reviews copied into the site, and **Settings → Review Settings** with the source and the sync button.
<!-- @end:reviews -->

Media uploads go to `public/media`. Media has no folders: find files with the search and the filters.

## Background jobs

Payload's job queue runs inside the server process: `jobs.autoRun` in `src/payload.config.ts` runs the `default` queue every 5 minutes (scheduled publishing). It works with `pnpm dev` and `pnpm start` on a server that keeps running, such as Docker or a VPS. On a serverless host, call `GET /api/payload-jobs/run?queue=<queue>` and `GET /api/payload-jobs/handle-schedules?queue=<queue>` from a cron instead.

<!-- @feature:workflows -->
## Workflows

Editors build automations in **Automation → Workflows**: a trigger, then tasks and conditions connected on a canvas. A workflow starts with **Run now**, on a schedule, or when a page, post or form submission is created, updated or deleted. Each run is a job in the `workflows` queue. The plugin runs that queue every minute. Open a job's **Run** tab to see each step's input, output and error.

The tasks in the palette come from `src/jobs/tasks.ts`:

| Task | Input | Output |
|---|---|---|
| Send email | to, subject, body (plain text), reply-to | `messageId` |
| Create document | collection slug, data (JSON), draft | `id` |
| Update document | collection slug, id, data (JSON) | `id` |
| Call webhook | URL, method, body (JSON), headers (JSON) | `status`, `response` |
| Revalidate page path | path, such as `/about` | `path` |

- Without `SMTP_HOST` in `.env`, **Send email** writes the email to the server log.
- **Create document** and **Update document** refuse user accounts and Payload's own collections.
- **Call webhook** fails on a status other than 2xx, so Payload retries it.
- **Revalidate page path** calls the site's own `POST /api/revalidate-path` (`src/jobs/revalidate.ts`). Jobs that run on a timer cannot clear Next's cache directly. `NEXT_PUBLIC_SERVER_URL` must be an address the server can reach.
- Collection triggers fire on drafts and autosaves too. Add a rule such as `{{trigger.doc._status}}` equals `published` to react only to published changes.

To add a task, write a `TaskConfig` with a `slug`, a `label`, an `inputSchema` and an `outputSchema`, add it to `workflowTasks`, and run `pnpm generate:types`. Pass `req` to Local API calls inside the task. Plugin guide: [payload-workflows](https://www.npmjs.com/package/payload-workflows).
<!-- @end:workflows -->

<!-- @feature:reviews -->
## Google reviews

1. In **Settings → Review Settings**, pick a **Reviews Source**:
   - **Google Places API**: up to 5 reviews. Set the **Google Place ID** and `GOOGLE_PLACES_API_KEY` in `.env` (a Google Cloud key with the Places API (New) turned on).
   - **Scraper**: every public review and its photos. Set the **Google Maps URL**. It uses `google-maps-review-scraper`, which `next.config.ts` keeps out of the bundle.
2. Click **Sync Reviews Now**. After that, the reviews sync every Sunday at 17:00 server time, on the `default` queue.
3. Read them on the site:

```ts
const { docs: reviews } = await payload.find({ collection: 'reviews', sort: '-publishedAt', limit: 12 })
const settings = await payload.findGlobal({ slug: 'review-settings' }) // averageRating, totalReviewCount
```

Plugin guide: [payload-google-reviews](https://www.npmjs.com/package/payload-google-reviews).
<!-- @end:reviews -->

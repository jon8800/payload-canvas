# Phase 6: Developer Experience - Context

**Gathered:** 2026-03-14
**Updated:** 2026-03-15 (gap closure — templating + CLI package)
**Status:** Ready for planning (gap closure)

<domain>
## Phase Boundary

Gap closure for UAT-identified issues: (1) setup script must scaffold into a new directory, not modify the starter in-place, and (2) modular collection deselection must handle cross-collection relationship dependencies. Additionally, the setup is restructured as a **separate private CLI package** distributed via GitHub Packages, using **EJS templates** to generate clean project files based on user selections.

**Existing completed work (unchanged):**
- Docker Compose (app + Postgres) — already done, keep as-is
- SMTP email configuration — already done, keep as-is
- Demo content seeder — already done, keep as-is (runs inside generated project)
- .env.example — already done, keep as-is
- Lexical helpers, create-admin script — already done, keep as-is

</domain>

<decisions>
## Implementation Decisions

### CLI Package Architecture
- **Separate private CLI package** — NOT a script inside the starter repo
- Published to **GitHub Packages** as a scoped private package (e.g., `@yourscope/create-payload-starter`)
- Invoked via `npx @yourscope/create-payload-starter` from any projects folder
- Works exactly like `create-payload-app` — the developer experience is: open terminal in projects folder → run npx command → follow prompts → project created in `./{projectName}/`
- CLI has a `bin` entry in its package.json pointing to the main script
- Uses `@clack/prompts` for interactive prompts (already working, keep the same prompts)

### Template Source
- CLI **downloads the starter template from a GitHub repo** (like create-next-app pulls templates)
- The starter repo (`payload-starter`) is the template source — CLI clones/downloads it
- After download, EJS templates are rendered over the raw files based on user selections

### EJS Templating
- **Separate .ejs files** in `scripts/templates/` (or bundled in the CLI package) — source files stay valid TypeScript
- Templates for: `payload.config.ts.ejs`, `Posts.ts.ejs`, `TemplateParts.ts.ejs`
- Plugin configs that reference optional collections are **conditional** — collection arrays generated based on selections (e.g., SEO `['pages', 'posts']` → `['pages']` if posts deselected)
- Generated output is **clean** — no commented-out code, no @setup markers, just the selected features
- Remove `@setup:` markers from the starter's source files — markers now live only in templates

### Collection Dependencies
- **Force include dependencies**: If Posts is selected, Categories and Tags are auto-included (greyed out / forced in the prompt)
- TemplateParts.ts is also an EJS template — display conditions referencing pages/posts are conditional
- This is simpler and safer than conditional field removal

### Scaffolding Flow
1. User runs `npx @yourscope/create-payload-starter`
2. Prompted for: project name, DB connection, admin credentials, collections, plugins, SMTP (optional)
3. CLI downloads starter template from GitHub
4. Copies template to `./{projectName}/`
5. Renders EJS templates based on selections → writes clean generated files
6. Generates `.env` with user's credentials
7. Runs `pnpm install` in the new directory
8. Creates Postgres database via `pg`
9. Runs `pnpm payload migrate` (or relies on dev-mode auto-push)
10. Creates admin user
11. Initializes fresh git repo with initial commit
12. Done — user runs `cd {projectName} && pnpm dev`

### Claude's Discretion
- CLI package structure (monorepo with starter + CLI, or separate repos)
- How to download the starter template (degit, git clone --depth 1, GitHub API tarball)
- EJS vs simpler template engine if EJS is overkill
- Exact package scope name
- Which files beyond payload.config.ts, Posts.ts, TemplateParts.ts need templating

</decisions>

<specifics>
## Specific Ideas

- DX should feel exactly like `create-payload-app` or `create-next-app` — run one command, answer prompts, start coding
- better-t3-stack is a reference for how modular project scaffolding with templating works
- The starter repo itself should be a valid, buildable project (all features included) — the CLI strips down based on selections
- Primary deployment is Coolify with nixpacks — Docker Compose is a fallback

</specifics>

<code_context>
## Existing Code Insights

### Already Completed (from plans 06-01, 06-02, 06-03)
- `scripts/lib/create-database.ts`: DB creation via pg — reuse in CLI
- `scripts/lib/generate-env.ts`: .env generation — reuse in CLI (needs targetDir param)
- `scripts/lib/lexical-helpers.ts`: Lexical rich text builders — stays in starter for seed-demo
- `scripts/create-admin.ts`: Admin user creation — stays in starter, CLI calls it post-scaffold
- `scripts/seed-demo.ts`: Demo content seeder — stays in starter, user runs `pnpm seed:demo` after scaffold
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`: Docker files — stay in starter as-is
- `.env.example`: Template — stays in starter, CLI reads it for generation
- `src/payload.config.ts`: Has @setup markers that need to be removed (replaced by EJS templates)

### What Needs to Change
- `scripts/setup.ts`: Current in-place setup → replaced by the CLI package
- `scripts/lib/modify-config.ts`: Comment-toggling approach → replaced by EJS template rendering
- `src/payload.config.ts`: Remove @setup markers (templates handle this now)
- `src/collections/Posts.ts`: No changes needed IF we force-include categories/tags with posts

### Integration Points
- CLI package `bin` entry → main CLI script
- CLI → GitHub repo (template download)
- CLI → `scripts/lib/create-database.ts` (reuse or bundle)
- CLI → `scripts/lib/generate-env.ts` (reuse or bundle)
- Generated project → `pnpm seed:demo` (user runs manually)
- Generated project → `pnpm create:admin` (CLI runs or user runs)

</code_context>

<deferred>
## Deferred Ideas

- Non-interactive setup mode with CLI flags (for CI/automation) — add when needed
- Nixpacks-specific configuration file — Coolify auto-detects Next.js
- Template versioning (CLI downloads specific tagged version of starter) — add when starter stabilizes

</deferred>

---

*Phase: 06-developer-experience*
*Context gathered: 2026-03-14*
*Updated: 2026-03-15 (gap closure decisions)*

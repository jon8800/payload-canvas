# Phase 6: Developer Experience - Research

**Researched:** 2026-03-14
**Domain:** CLI setup scripts, demo content seeding, Docker deployment, SMTP email
**Confidence:** HIGH

## Summary

Phase 6 delivers the "clone and go" developer experience: an interactive Node.js setup script, optional demo content seeding, Docker deployment files, and SMTP email configuration. The project already has all collections, plugins, blocks, and section presets in place -- this phase wires them into a streamlined onboarding flow.

The key technical challenges are: (1) modular collection/plugin selection that modifies `payload.config.ts` without breaking it, (2) programmatic Lexical rich text JSON for demo paragraph content, (3) cross-platform Postgres database creation via `pg`, and (4) a multi-stage Docker build that works with Payload's standalone output.

**Primary recommendation:** Use `@clack/prompts` for the interactive CLI (modern, beautiful output, `group()` for sequential prompts), `pg` for DB creation, `payload run` for seed scripts, and the standard 3-stage Next.js standalone Dockerfile pattern.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Interactive CLI using Node.js (no bash dependency) -- run via `pnpm setup`
- Uses `pg` npm package to create Postgres database (cross-platform, no psql needed)
- Interactive prompts for: project name, DB connection, admin email/password, collection selection, plugin selection, SMTP config (optional)
- Collections and plugins selection are separate steps
- Generates .env from template with all selected options
- Installs dependencies and creates the database
- Demo content: Homepage + 2-3 pages + 3-5 posts + template parts, placeholder URLs for images (unsplash/picsum)
- Uses Payload's Local API to create content programmatically
- Simple Docker Compose: app + Postgres only (no nginx)
- Multi-stage Dockerfile (deps -> build -> production) with standalone output
- Primary deployment is Coolify with nixpacks; Docker is fallback
- AWS SES SMTP via generic Nodemailer transport (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
- `--demo` flag should also be runnable independently: `pnpm seed:demo`

### Claude's Discretion
- Interactive prompt library choice (inquirer, prompts, clack, etc.)
- How modular collection/plugin selection modifies the codebase (comment out? delete? conditional config?)
- Demo content Lexical rich text JSON structure
- Docker health checks and restart policies
- .env.example format and documentation

### Deferred Ideas (OUT OF SCOPE)
- Non-interactive setup mode with CLI flags (for CI/automation)
- Nixpacks-specific configuration file (Coolify auto-detects Next.js)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DX-01 | Cross-platform setup script (Postgres DB creation, .env generation, deps + migration) | @clack/prompts for interactive CLI, `pg` for DB creation, fs for .env templating, child_process for deps/migration |
| DX-02 | Optional demo content via `--demo` flag in setup script | `payload run` for seed script execution, Payload Local API for content creation, Lexical JSON for rich text |
| DX-03 | Docker deployment support | Multi-stage Dockerfile with standalone output, docker-compose.yml with app + postgres services |
| DX-04 | AWS SES SMTP email configuration in payload config | Already partially done in handleFormEmails.ts; needs .env.example documentation and payload.config.ts email transport |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @clack/prompts | ^1.1.0 | Interactive CLI prompts | Modern, beautiful output, `group()` chains prompts, `multiselect()` for collection/plugin picking, 5000+ npm dependents |
| pg | ^8.13.0 | Postgres database creation | Already the underlying driver for @payloadcms/db-postgres; cross-platform, no psql binary needed |
| nodemailer | ^8.0.2 | SMTP email transport | Already in project dependencies; generic transport works with any SMTP provider |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | (dev) | TypeScript script runner | Only if `payload run` doesn't suit setup script needs (it should) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @clack/prompts | inquirer | Inquirer is heavier (more deps), less visually polished, older API style |
| @clack/prompts | prompts | prompts is lighter but less beautiful output, no `group()` orchestration |
| pg (direct) | pgtools | pgtools wraps pg for createdb/dropdb but adds dependency; raw pg is sufficient |

**Recommendation:** Use `@clack/prompts` -- it is the modern standard for CLI tools, used by create-svelte, create-astro, and similar scaffolders. Its `group()` API perfectly maps to the sequential prompt flow needed here.

**Installation:**
```bash
pnpm add -D @clack/prompts
```

Note: `pg` is already an indirect dependency via `@payloadcms/db-postgres`, but for the setup script to run BEFORE the full app is initialized, install it directly:
```bash
pnpm add -D pg @types/pg
```

## Architecture Patterns

### Recommended Project Structure
```
scripts/
  setup.ts              # Interactive setup script (DX-01)
  seed-demo.ts          # Demo content seeder (DX-02)
  lib/
    create-database.ts  # pg-based DB creation helper
    generate-env.ts     # .env file generator from template
    modify-config.ts    # payload.config.ts modifier for collection/plugin selection
    lexical-helpers.ts  # Rich text JSON builders for demo content
Dockerfile              # Multi-stage build
docker-compose.yml      # App + Postgres services
.env.example            # Documented env template
```

### Pattern 1: Modular Config via Comment Toggling
**What:** The setup script comments/uncomments import lines and array entries in `payload.config.ts` based on user selections, rather than deleting code or using runtime conditionals.
**When to use:** When users want to scaffold a leaner starter but still see what's available.
**Why this approach:**
- Preserves all code for reference (uncomment to re-enable)
- No runtime overhead (tree-shaking removes unused imports)
- Simple string manipulation, not AST transforms
- Users can easily toggle features later by editing comments

**Implementation approach:**
```typescript
// In payload.config.ts, each optional collection/plugin gets a marker comment:
// The setup script reads the file, finds markers, and comments out unselected items

// Example markers in payload.config.ts:
import { Posts } from '@/collections/Posts' // @setup:collection:posts
import { Categories } from '@/collections/Categories' // @setup:collection:categories

// In the collections array:
collections: [
  Users, // @setup:required
  Media, // @setup:required
  Pages, // @setup:required
  Posts, // @setup:collection:posts
  Categories, // @setup:collection:categories
  Tags, // @setup:collection:tags
  TemplateParts, // @setup:collection:template-parts
],

// Setup script comments out unselected lines:
// import { Posts } from '@/collections/Posts' // @setup:collection:posts
```

**Why NOT conditional runtime config:** Adding `if (process.env.ENABLE_POSTS)` to payload.config.ts adds runtime complexity, breaks type safety, and complicates the admin panel. Comment toggling is simpler and more transparent.

**Why NOT file deletion:** Deleting collection files is destructive and hard to undo. Comment toggling preserves the code.

### Pattern 2: Payload Local API Seeding with `payload run`
**What:** Use `payload run ./scripts/seed-demo.ts` to execute the seed script with full Payload access.
**When to use:** For demo content creation that needs the Local API.
**Key details:**
- `payload run` loads .env the same way Next.js does (no dotenv needed)
- Import `getPayload` from `'payload'` and config from `'@payload-config'`
- Full typed access to `payload.create()`, `payload.update()`, etc.
- The script runs outside the Next.js server context

```typescript
// scripts/seed-demo.ts
import { getPayload } from 'payload'
import config from '@payload-config'

async function seed() {
  const payload = await getPayload({ config })

  // Create categories first (referenced by posts)
  const techCategory = await payload.create({
    collection: 'categories',
    data: { title: 'Technology', slug: 'technology' },
  })

  // Create pages with block layouts
  await payload.create({
    collection: 'pages',
    data: {
      title: 'Home',
      slug: 'home',
      layout: heroPreset.blocks, // Section preset data
      _status: 'published',
    },
  })
}

seed()
```

### Pattern 3: Database Creation with pg
**What:** Connect to the default `postgres` database and issue CREATE DATABASE.
**Key details:**
- Connect to `postgres` (default DB) first, not the target DB
- Check if DB exists: `SELECT 1 FROM pg_database WHERE datname = $1`
- Create if not: `CREATE DATABASE "${dbName}"`
- Properly quote DB name to handle special characters

```typescript
import { Client } from 'pg'

async function createDatabase(config: {
  host: string; port: number; user: string; password: string; database: string
}) {
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres', // Connect to default DB first
  })
  await client.connect()

  const result = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [config.database]
  )

  if (result.rowCount === 0) {
    // DB names with hyphens need quoting
    await client.query(`CREATE DATABASE "${config.database}"`)
  }

  await client.end()
}
```

### Anti-Patterns to Avoid
- **AST manipulation of payload.config.ts:** Using ts-morph or similar to programmatically modify the config is over-engineered. Simple regex/string replacement with marker comments is sufficient and far more maintainable.
- **Runtime feature flags in config:** Adding `process.env.ENABLE_X` conditionals to payload.config.ts breaks TypeScript inference and adds unnecessary runtime complexity.
- **Storing demo images locally:** Binary files bloat the repo. Use external placeholder URLs (picsum.photos or similar).
- **Running setup as ESM with tsx:** Use `payload run` which handles TypeScript natively and loads env vars correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive CLI prompts | readline-based custom prompts | @clack/prompts | Handles terminal raw mode, cursor, colors, cancellation, validation |
| DB creation | Shell exec of `createdb` | pg Client with SQL | Cross-platform (Windows), no psql binary dependency |
| Seed script runner | Custom tsx/ts-node setup | `payload run` | Loads env, resolves @payload-config alias, handles TS natively |
| Rich text JSON | Manual JSON objects | Helper functions wrapping Lexical node types | Lexical JSON is verbose; helpers prevent format errors |
| Docker standalone | Custom server.js | Next.js standalone output | Already configured in next.config.ts, produces optimized server |

## Common Pitfalls

### Pitfall 1: pg Connection to Non-Existent Database
**What goes wrong:** Trying to connect to the target database before creating it fails with "database does not exist".
**Why it happens:** pg requires connecting to an existing database. The setup script must connect to the default `postgres` database first.
**How to avoid:** Always connect to `postgres` DB first, then CREATE DATABASE, then verify by connecting to the new DB.
**Warning signs:** "FATAL: database X does not exist" error.

### Pitfall 2: Lexical Rich Text JSON Format Errors
**What goes wrong:** Demo paragraphs fail to render or cause admin panel errors because the Lexical JSON structure is malformed.
**Why it happens:** Lexical has a specific JSON structure with root, direction, format, indent, and version fields that must be present.
**How to avoid:** Create helper functions that produce valid Lexical JSON. Always include the full structure:
```typescript
function createRichText(text: string) {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}
```
**Warning signs:** Empty rich text areas, admin panel throwing JSON parse errors.

### Pitfall 3: Comment Toggling Breaking Imports
**What goes wrong:** Commenting out a collection import but not its reference in the collections array (or vice versa) causes build failures.
**How to avoid:** Use consistent marker comments (e.g., `// @setup:collection:posts`) on BOTH the import line AND the array entry. The toggle function must find and process ALL lines with the same marker.
**Warning signs:** "Cannot find name 'Posts'" TypeScript errors after setup.

### Pitfall 4: Docker COPY Missing .next/standalone Dependencies
**What goes wrong:** The standalone Docker image fails to start because sharp or other native modules aren't included.
**Why it happens:** Next.js standalone traces dependencies but sharp needs special handling.
**How to avoid:** Ensure sharp is in dependencies (it is), and copy node_modules sharp specifically if needed. Also copy public/ and .next/static/ separately.
**Warning signs:** "Cannot find module 'sharp'" at runtime.

### Pitfall 5: pnpm in Docker Requires Corepack
**What goes wrong:** Docker build fails because pnpm is not available in the Node.js base image.
**Why it happens:** pnpm is not included by default in Node images.
**How to avoid:** Enable corepack in the Dockerfile: `RUN corepack enable && corepack prepare pnpm@latest --activate`
**Warning signs:** "pnpm: not found" during Docker build.

### Pitfall 6: Setup Script Must Run Before App Is Initialized
**What goes wrong:** The setup script tries to import Payload or use `payload run` before .env exists.
**Why it happens:** The setup script generates .env, so it cannot use `payload run` (which loads .env). DB creation happens before Payload is initialized.
**How to avoid:** The setup script itself runs with plain Node/tsx. Only the seed-demo script uses `payload run` (which runs after setup completes and .env exists).
**Warning signs:** "PAYLOAD_SECRET is required" or "DATABASE_URL is undefined" errors during setup.

## Code Examples

### Setup Script Flow (DX-01)
```typescript
// scripts/setup.ts - runs via: pnpm setup (package.json script: "tsx scripts/setup.ts")
import * as p from '@clack/prompts'
import { createDatabase } from './lib/create-database'
import { generateEnv } from './lib/generate-env'
import { modifyConfig } from './lib/modify-config'
import { execSync } from 'child_process'

async function setup() {
  p.intro('Payload Starter Setup')

  const project = await p.group({
    name: () => p.text({
      message: 'Project name',
      placeholder: 'my-website',
      defaultValue: 'my-website',
      validate: (v) => {
        if (!v) return 'Required'
        if (!/^[a-z0-9-]+$/.test(v)) return 'Use lowercase letters, numbers, and hyphens'
      },
    }),
    dbHost: () => p.text({ message: 'Database host', defaultValue: 'localhost' }),
    dbPort: () => p.text({ message: 'Database port', defaultValue: '5432' }),
    dbUser: () => p.text({ message: 'Database user', defaultValue: 'postgres' }),
    dbPassword: () => p.password({ message: 'Database password' }),
    adminEmail: () => p.text({
      message: 'Admin email',
      validate: (v) => v?.includes('@') ? undefined : 'Enter a valid email',
    }),
    adminPassword: () => p.password({
      message: 'Admin password',
      validate: (v) => (v?.length ?? 0) >= 8 ? undefined : 'Min 8 characters',
    }),
    collections: () => p.multiselect({
      message: 'Which collections to include?',
      options: [
        { value: 'posts', label: 'Posts / Blog', hint: 'Blog collection with categories & tags' },
        { value: 'categories', label: 'Categories', hint: 'Hierarchical categories (nested docs)' },
        { value: 'tags', label: 'Tags', hint: 'Flat taxonomy' },
        { value: 'template-parts', label: 'Template Parts', hint: 'Header/footer/custom sections' },
      ],
      initialValues: ['posts', 'categories', 'tags', 'template-parts'],
    }),
    plugins: () => p.multiselect({
      message: 'Which plugins to include?',
      options: [
        { value: 'seo', label: 'SEO', hint: '@payloadcms/plugin-seo' },
        { value: 'redirects', label: 'Redirects', hint: '@payloadcms/plugin-redirects' },
        { value: 'form-builder', label: 'Form Builder', hint: '@payloadcms/plugin-form-builder' },
        { value: 'nested-docs', label: 'Nested Docs', hint: '@payloadcms/plugin-nested-docs' },
        { value: 'import-export', label: 'Import/Export', hint: '@payloadcms/plugin-import-export' },
        { value: 'mcp', label: 'MCP', hint: '@payloadcms/plugin-mcp' },
        { value: 'search', label: 'Search', hint: '@payloadcms/plugin-search' },
      ],
      initialValues: ['seo', 'redirects', 'form-builder', 'nested-docs', 'import-export', 'mcp', 'search'],
    }),
    smtpSetup: () => p.confirm({ message: 'Configure SMTP email?', initialValue: false }),
  }, {
    onCancel: () => { p.cancel('Setup cancelled.'); process.exit(0) },
  })

  // SMTP details (conditional)
  let smtp = undefined
  if (project.smtpSetup) {
    smtp = await p.group({
      host: () => p.text({ message: 'SMTP host', placeholder: 'email-smtp.us-east-1.amazonaws.com' }),
      port: () => p.text({ message: 'SMTP port', defaultValue: '587' }),
      user: () => p.text({ message: 'SMTP user' }),
      pass: () => p.password({ message: 'SMTP password' }),
      from: () => p.text({ message: 'From address', placeholder: 'noreply@yourdomain.com' }),
    })
  }

  // Steps: create DB, generate .env, modify config, install deps
  const s = p.spinner()

  s.start('Creating database...')
  await createDatabase({ /* ... */ })
  s.stop('Database created')

  s.start('Generating .env...')
  generateEnv({ project, smtp })
  s.stop('.env generated')

  s.start('Updating payload.config.ts...')
  modifyConfig(project.collections, project.plugins)
  s.stop('Config updated')

  s.start('Running migrations...')
  execSync('pnpm payload migrate', { stdio: 'inherit' })
  s.stop('Migrations complete')

  // Create first admin user via Local API
  s.start('Creating admin user...')
  execSync(`pnpm payload run scripts/create-admin.ts -- --email="${project.adminEmail}" --password="${project.adminPassword}"`, { stdio: 'inherit' })
  s.stop('Admin user created')

  p.outro('Setup complete! Run `pnpm dev` to start.')
}

setup()
```

### Demo Seed Script (DX-02)
```typescript
// scripts/seed-demo.ts - runs via: pnpm seed:demo (payload run ./scripts/seed-demo.ts)
import { getPayload } from 'payload'
import config from '@payload-config'
import { heroPreset, contentPreset, ctaBannerPreset, featuresPreset, faqPreset } from '@/data/section-presets'

const payload = await getPayload({ config })

// 1. Create categories
const categories = await Promise.all([
  payload.create({ collection: 'categories', data: { title: 'Technology', slug: 'technology' } }),
  payload.create({ collection: 'categories', data: { title: 'Design', slug: 'design' } }),
  payload.create({ collection: 'categories', data: { title: 'Business', slug: 'business' } }),
])

// 2. Create tags
const tags = await Promise.all([
  payload.create({ collection: 'tags', data: { title: 'Tutorial', slug: 'tutorial' } }),
  payload.create({ collection: 'tags', data: { title: 'Guide', slug: 'guide' } }),
])

// 3. Create pages with section presets
// ... populate paragraph content: null fields with Lexical rich text
```

### Lexical Rich Text Helper
```typescript
// scripts/lib/lexical-helpers.ts
type LexicalNode = Record<string, unknown>

export function richText(...paragraphs: string[]) {
  return {
    root: {
      type: 'root',
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        children: [
          {
            type: 'text',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text,
            version: 1,
          },
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        textFormat: 0,
        textStyle: '',
        version: 1,
      })),
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
    },
  }
}

// Usage: Fill in the null paragraph content fields from presets
export function populatePresetContent(
  blocks: Record<string, unknown>[],
  contentMap: Record<string, string>
): Record<string, unknown>[] {
  // Deep clone and fill paragraph content: null with rich text
  return JSON.parse(JSON.stringify(blocks)).map((block: any) => {
    if (block.blockType === 'paragraph' && block.content === null) {
      block.content = richText(contentMap[block.blockType] || 'Lorem ipsum dolor sit amet.')
    }
    if (block.children) {
      block.children = populatePresetContent(block.children, contentMap)
    }
    return block
  })
}
```

### Dockerfile (DX-03)
```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### docker-compose.yml (DX-03)
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/payload_starter
      - PAYLOAD_SECRET=${PAYLOAD_SECRET:-change-me-in-production}
      - NEXT_PUBLIC_SERVER_URL=http://localhost:3000
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: payload_starter
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### .env.example (DX-01/DX-04)
```bash
# === Database ===
DATABASE_URL=postgresql://postgres:password@localhost:5432/payload_starter

# === Payload ===
PAYLOAD_SECRET=your-secret-key-change-in-production
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
PREVIEW_SECRET=preview-secret-change-in-production

# === SMTP Email (optional - for form notifications) ===
# Works with any SMTP provider (AWS SES, SendGrid, Mailgun, etc.)
# SMTP_HOST=email-smtp.us-east-1.amazonaws.com
# SMTP_PORT=587
# SMTP_USER=your-smtp-username
# SMTP_PASS=your-smtp-password
# SMTP_FROM=noreply@yourdomain.com
# SMTP_SECURE=false
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| inquirer for CLI prompts | @clack/prompts | 2023+ | Better visual output, smaller bundle, simpler API |
| bash scripts for setup | Node.js scripts | Always for cross-platform | Windows compatibility requirement |
| `ts-node` for script execution | `payload run` | Payload 3.x | Native TS support, proper alias resolution, env loading |
| Manual JSON for Lexical content | `buildEditorState` helper or manual helpers | Payload 3.x | Type-safe Lexical JSON creation |
| Docker with nginx proxy | Standalone Next.js server | Next.js 13+ | No need for separate reverse proxy in dev/simple deployments |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual validation (no automated test framework in project) |
| Config file | none |
| Quick run command | `pnpm build` (build succeeds = config valid) |
| Full suite command | `pnpm build && docker compose build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DX-01 | Setup script creates DB, generates .env, modifies config | manual + smoke | Run `pnpm setup` in fresh clone, verify .env exists and `pnpm dev` starts | N/A |
| DX-02 | Demo content seeded with correct structure | manual + smoke | Run `pnpm seed:demo`, verify pages/posts exist in admin | N/A |
| DX-03 | Docker builds and runs successfully | manual + smoke | `docker compose up --build -d` then `curl http://localhost:3000` | N/A |
| DX-04 | SMTP env vars documented and transport configured | manual | Verify .env.example has SMTP vars, check handleFormEmails uses them | N/A |

### Sampling Rate
- **Per task commit:** `pnpm build` (ensures config changes don't break)
- **Per wave merge:** `pnpm build` + manual smoke test
- **Phase gate:** Full setup flow test in clean environment

### Wave 0 Gaps
- [ ] `scripts/setup.ts` -- main setup script
- [ ] `scripts/seed-demo.ts` -- demo content seeder
- [ ] `scripts/lib/` -- shared utilities directory
- [ ] `.env.example` -- environment template
- [ ] `Dockerfile` -- multi-stage build
- [ ] `docker-compose.yml` -- service composition
- [ ] package.json `setup` and `seed:demo` scripts
- [ ] @clack/prompts and pg dev dependencies

## Open Questions

1. **Section preset paragraph content is `null`**
   - What we know: Phase 4 decision was to leave paragraph `content: null` for Phase 6 seed population
   - What's unclear: Whether the seed script should deep-clone presets and fill in content, or create separate enriched preset copies
   - Recommendation: Deep-clone presets and populate null content fields with Lexical rich text in the seed script. Keep presets as-is (they serve as admin templates too).

2. **Admin user creation timing**
   - What we know: Setup needs to create first admin user. `payload run` requires a running DB with migrations applied.
   - What's unclear: Whether to use `payload run` for admin creation or the REST API
   - Recommendation: Use `payload run` with a small create-admin script that calls `payload.create({ collection: 'users', data: { ... } })`. Run it after migrations.

3. **Config modification marker approach**
   - What we know: Need to toggle collections and plugins in payload.config.ts
   - What's unclear: Edge cases with plugin configs that span multiple lines (e.g., seoPlugin with options)
   - Recommendation: Use line-by-line markers. For multi-line plugin configs, wrap in start/end markers: `// @setup:plugin:seo:start` ... `// @setup:plugin:seo:end`. The script comments out all lines between markers.

## Sources

### Primary (HIGH confidence)
- [Payload Local API docs](https://payloadcms.com/docs/local-api/overview) - Local API operations, getPayload usage
- [Payload outside Next.js](https://payloadcms.com/docs/local-api/outside-nextjs) - `payload run` script execution pattern
- [@clack/prompts official site](https://www.clack.cc/) - Full API surface verified
- [pg npm package](https://www.npmjs.com/package/pg) - Database client for Postgres

### Secondary (MEDIUM confidence)
- [Next.js standalone Docker guide](https://nextjs.org/docs/app/building-your-application/deploying) - Multi-stage Dockerfile pattern
- [Lexical editor state](https://lexical.dev/docs/concepts/editor-state) - JSON structure for rich text nodes
- Multiple Docker + Next.js standalone tutorials cross-referenced

### Tertiary (LOW confidence)
- Lexical JSON exact field requirements (detail, format, mode, style, textFormat, textStyle fields) -- verified against general Lexical docs but exact Payload-specific requirements may differ. Test with a real Payload instance.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @clack/prompts, pg, and payload run are well-documented, current, and widely used
- Architecture: HIGH - Comment-toggling pattern is simple and proven; Docker multi-stage is standard
- Pitfalls: HIGH - Based on direct analysis of the codebase and known platform constraints
- Demo content: MEDIUM - Lexical JSON structure needs validation against actual Payload 3.79 expectations

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable domain, no fast-moving targets)

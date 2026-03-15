# Phase 5: Plugins & Integrations - Research

**Researched:** 2026-03-14
**Domain:** Payload CMS official plugins + Layout Customizer view integration
**Confidence:** HIGH

## Summary

This phase integrates 7 official Payload plugins and adapts an existing Layout Customizer from a standalone plugin into direct starter code. The plugins are well-documented with stable APIs at Payload 3.79. The customizer adaptation is the most complex task -- it requires restructuring from a plugin factory pattern to direct collection view config, replacing the custom postMessage-based live preview with RefreshRouteOnSave, and adding on-canvas block selection via data-block-path attributes.

Key concerns: (1) Import/Export plugin requires `jobs` queue config in payload.config.ts, (2) the customizer's `sections` field name must be changed to `layout` to match our collections, (3) the customizer's dnd-kit dependencies overlap with what Payload already bundles, and (4) on-canvas block selection requires injecting a script into the preview iframe which has cross-origin implications.

**Primary recommendation:** Install plugins incrementally (SEO + Redirects first, then Form Builder + Search, then Import/Export + MCP). Adapt customizer separately as it touches the most files. Add data-block-path to RenderBlocks and all 14 block components as a dedicated task.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **SEO plugin**: Enabled on Pages and Posts (title, description, OG image)
- **Redirects plugin**: Standard 301/302 redirects AND regex pattern matching (WordPress Redirection plugin-style)
- **Form Builder plugin**: Extended config -- standard fields (text, email, textarea, select, checkbox) plus file uploads, multi-step, conditional logic, with email notifications
- **Nested Docs plugin**: Already configured for Categories (Phase 3) -- no additional config needed
- **Import/Export plugin**: Standard config, enabled on main collections
- **MCP plugin**: Standard config
- **Search plugin**: Index Pages, Posts, and Categories
- Layout Customizer: Copy source from `C:\Projects\sandbox\payload\payload-customiser\src` into `src/views/customiser/`
- NOT a separate plugin -- direct part of the starter codebase
- Configurable: array of collection slugs that get the customizer view tab (default: Pages, Posts, Template Parts)
- Uses Phase 4's RefreshRouteOnSave for live preview (not the plugin's custom postMessage approach) -- RSC compatible
- Keep the customizer's UI chrome: breakpoints, zoom, device selector, popup window option
- Remove/replace the duplicated live preview code from the plugin -- use Payload's built-in live preview infrastructure
- On-canvas block selection: click + hover highlights via data-block-path attributes
- Blocks field name: configurable (default: 'layout' to match our collections)
- Preserves from plugin: block tree sidebar (SectionFields), drag-and-drop via dnd-kit, document fields panel, `_hidden` field for block visibility

### Claude's Discretion
- Exact restructuring of the customizer code when moving it into the starter
- How to wire the customizer into collection admin views without the plugin factory pattern
- Live preview integration details (removing postMessage, wiring RefreshRouteOnSave)
- How to inject the click/hover handler script into the preview iframe
- Import/Export and MCP plugin configuration details
- Theme Settings documentation format

### Deferred Ideas (OUT OF SCOPE)
- Inline text editing on canvas -- deferred due to RSC refresh complexity, add in future iteration
- Theme Settings full plugin -- v2, only documenting the integration surface now
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLUG-01 | SEO plugin (`@payloadcms/plugin-seo`) | Full API documented -- seoPlugin with collections, uploadsCollection, tabbedUI, generate functions |
| PLUG-02 | Redirects plugin (`@payloadcms/plugin-redirects`) | Full API documented -- redirectsPlugin with collections, overrides; regex via custom redirectTypes |
| PLUG-03 | Form Builder plugin (`@payloadcms/plugin-form-builder`) | Full API documented -- formBuilderPlugin with fields toggle, email config, redirectRelationships |
| PLUG-04 | Nested Docs plugin (`@payloadcms/plugin-nested-docs`) | Already configured in payload.config.ts for categories -- verify no changes needed |
| PLUG-05 | Import/Export plugin (`@payloadcms/plugin-import-export`) | Full API documented -- importExportPlugin with collections array, requires jobs queue config |
| PLUG-06 | MCP plugin (`@payloadcms/plugin-mcp`) | Full API documented -- mcpPlugin with collections/globals object, auth config |
| PLUG-07 | Search plugin (`@payloadcms/plugin-search`) | Full API documented -- searchPlugin with collections, defaultPriorities, beforeSync |
| INTG-01 | Integration architecture for Layout Customizer view plugin | Full customizer source analyzed -- 34 files, adaptation strategy defined |
| INTG-02 | Integration architecture for future Theme Settings plugin | shadcn CSS variables documented as integration surface |
</phase_requirements>

## Standard Stack

### Core (Official Plugins)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@payloadcms/plugin-seo` | ^3.79.0 | SEO metadata fields on collections | Official Payload plugin, same version as core |
| `@payloadcms/plugin-redirects` | ^3.79.0 | URL redirect management | Official Payload plugin |
| `@payloadcms/plugin-form-builder` | ^3.79.0 | Dynamic form creation and submissions | Official Payload plugin |
| `@payloadcms/plugin-import-export` | ^3.79.0 | CSV/JSON import and export | Official Payload plugin, requires jobs queue |
| `@payloadcms/plugin-mcp` | ^3.79.0 | Model Context Protocol for AI tools | Official Payload plugin |
| `@payloadcms/plugin-search` | ^3.79.0 | Cross-collection search index | Official Payload plugin |

### Customizer Dependencies (Already in Project or Payload)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dnd-kit/core` | ^6.3.1 | Core drag-and-drop engine | Block tree reordering -- check if Payload already bundles this |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable list utilities | Block tree list sorting |

### Already Installed (No New Installs)
| Library | Status | Used By |
|---------|--------|---------|
| `@payloadcms/plugin-nested-docs` | ^3.79.0 | Already in payload.config.ts for categories |
| `@payloadcms/live-preview-react` | ^3.79.0 | RefreshRouteOnSave component |
| `@payloadcms/ui` | ^3.79.0 | Admin UI components used by customizer |

**Installation:**
```bash
pnpm add @payloadcms/plugin-seo @payloadcms/plugin-redirects @payloadcms/plugin-form-builder @payloadcms/plugin-import-export @payloadcms/plugin-mcp @payloadcms/plugin-search @dnd-kit/core @dnd-kit/sortable
```

Note: Check if `@dnd-kit/core` and `@dnd-kit/sortable` are already available through `@payloadcms/ui` before adding them separately. The customizer plugin lists them as dependencies, and Payload's admin UI also uses dnd-kit internally.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── views/
│   └── customiser/
│       ├── index.tsx                    # RSC wrapper (adapted from plugin)
│       ├── index.client.tsx             # Main client component
│       ├── index.scss                   # Main layout styles
│       ├── DocumentFields.tsx           # Right panel: block fields + page fields tabs
│       ├── DocumentFields.scss
│       ├── context/
│       │   └── SelectedSectionContext.tsx  # Selected block state
│       ├── SectionFields/               # Left panel: block tree
│       │   ├── index.tsx                # Block list with dnd
│       │   ├── index.scss
│       │   ├── DragContext.tsx           # dnd-kit provider
│       │   ├── InlineBlockAdder.tsx      # Inline + button
│       │   ├── InlineBlockAdder.scss
│       │   └── getFieldByPath.ts
│       ├── LivePreview/                 # Center: preview iframe
│       │   ├── Preview/index.tsx         # REWRITTEN: uses RefreshRouteOnSave
│       │   ├── Preview/index.scss
│       │   ├── IFrame/index.tsx          # Iframe wrapper
│       │   ├── IFrame/index.scss
│       │   ├── Context/                 # Preview state (breakpoints, zoom, size)
│       │   │   ├── context.ts
│       │   │   ├── index.tsx
│       │   │   ├── sizeReducer.ts
│       │   │   └── collisionDetection.ts
│       │   ├── Device/index.tsx          # Device frame container
│       │   ├── DeviceContainer/index.tsx
│       │   ├── Toolbar/                 # Breakpoint/zoom controls
│       │   │   ├── index.tsx
│       │   │   ├── index.scss
│       │   │   ├── Controls/index.tsx
│       │   │   ├── Controls/index.scss
│       │   │   ├── SizeInput/index.tsx
│       │   │   └── SizeInput/index.scss
│       │   ├── ToolbarArea/
│       │   │   ├── index.tsx
│       │   │   └── index.scss
│       │   └── usePopupWindow.ts
│       └── components/
│           └── Tabs/
│               ├── index.tsx
│               └── index.scss
├── utilities/
│   └── customiserConfig.ts              # NEW: collection slug config
└── blocks/
    └── RenderBlocks.tsx                 # MODIFIED: add data-block-path
```

### Pattern 1: Direct Collection View Registration (Instead of Plugin Factory)

**What:** Register the customizer as a custom edit view tab directly in collection configs, bypassing the plugin's `payloadCustomiser()` config transform function.

**When to use:** For all collections that should have the customizer tab (Pages, Posts, TemplateParts).

**Example:**
```typescript
// src/utilities/customiserConfig.ts
export const CUSTOMISER_COLLECTIONS = ['pages', 'posts', 'template-parts']
export const CUSTOMISER_BLOCKS_FIELD = 'layout' // default field name

// In each collection config (Pages.ts, Posts.ts, TemplateParts.ts):
admin: {
  components: {
    views: {
      edit: {
        customiser: {
          Component: '@/views/customiser/index#CustomiserView',
          path: '/customiser',
          tab: {
            href: '/customiser',
            label: 'Customiser',
          },
        },
      },
    },
  },
}
```

### Pattern 2: RefreshRouteOnSave Preview (Replace postMessage)

**What:** The customizer plugin has its own postMessage-based live preview that sends form field values to the iframe. This duplicates Payload's built-in live preview. Replace with RefreshRouteOnSave which triggers `router.refresh()` in the iframe after autosave completes.

**When to use:** In the customizer's Preview component.

**How it works:**
1. The customizer form autosaves at 300ms intervals (already configured on collections)
2. After save, RefreshRouteOnSave in the frontend iframe detects the save event and calls `router.refresh()`
3. The iframe re-renders with fresh RSC data from the server
4. No postMessage with field values needed -- the iframe always reads from the database

**What to remove from Preview/index.tsx:**
- The `useAllFormFields` hook call
- The `reduceFieldsToValues` import
- Both `useEffect` blocks that send `postMessage` events (`payload-live-preview` and `payload-document-event`)
- The `fieldSchemaJSON` concerns

**What to keep:**
- The iframe rendering with DeviceContainer
- The toolbar with breakpoint/zoom controls
- The popup window functionality (usePopupWindow)

### Pattern 3: data-block-path Attributes for On-Canvas Selection

**What:** Add `data-block-path` attributes to rendered blocks so the customizer can identify which block was clicked in the preview iframe.

**When to use:** In RenderBlocks and all block components.

**Example:**
```typescript
// src/blocks/RenderBlocks.tsx -- modified
type Props = {
  blocks: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  basePath?: string // e.g., "layout" for top-level, "layout.0.children" for nested
}

export function RenderBlocks({ blocks, basePath = 'layout' }: Props): ReactNode {
  if (!blocks?.length) return null

  return (
    <>
      {blocks.map((block, i) => {
        const Component = blockComponents[block.blockType]
        if (!Component) return null
        const blockPath = `${basePath}.${i}`
        return (
          <div key={block.id ?? i} data-block-path={blockPath}>
            <Component {...block} blockPath={blockPath} />
          </div>
        )
      })}
    </>
  )
}
```

### Pattern 4: On-Canvas Click/Hover Handler Script

**What:** Inject a script into the preview iframe that handles hover highlights and click-to-select for blocks with `data-block-path` attributes.

**Implementation approach:**
```typescript
// Script injected into the iframe via postMessage after iframe loads
// OR added to the frontend layout when in draft/preview mode

// In the iframe (frontend side):
window.addEventListener('message', (event) => {
  if (event.data?.type === 'customiser-init') {
    // Enable block selection mode
    document.addEventListener('mouseover', (e) => {
      const block = (e.target as HTMLElement).closest('[data-block-path]')
      // Remove previous highlights
      document.querySelectorAll('[data-block-highlight]').forEach(el => {
        el.removeAttribute('data-block-highlight')
      })
      if (block) {
        block.setAttribute('data-block-highlight', 'hover')
      }
    })

    document.addEventListener('click', (e) => {
      const block = (e.target as HTMLElement).closest('[data-block-path]')
      if (block) {
        e.preventDefault()
        e.stopPropagation()
        const blockPath = block.getAttribute('data-block-path')
        window.parent.postMessage({
          type: 'customiser-block-selected',
          blockPath,
        }, '*')
      }
    })
  }
})

// CSS for highlights (add to frontend globals.css):
// [data-block-highlight="hover"] { outline: 2px solid rgba(59, 130, 246, 0.5); }
// [data-block-highlight="selected"] { outline: 2px solid rgb(59, 130, 246); }
```

### Pattern 5: _hidden Field for Block Visibility Toggle

**What:** The customizer adds a `_hidden` checkbox field to each block, allowing users to hide blocks without deleting them.

**How to integrate:** Since our blocks use `blockReferences` (shared block definitions), we need to add the `_hidden` field to the block configs in `registry.ts` or via a utility function that wraps block configs.

```typescript
// Add to src/blocks/shared.ts or similar
export function withHiddenField(block: Block): Block {
  return {
    ...block,
    fields: [
      { name: '_hidden', type: 'checkbox', admin: { hidden: true } },
      ...block.fields,
    ],
  }
}
```

Then in RenderBlocks, filter out hidden blocks:
```typescript
const visibleBlocks = blocks.filter(block => !block._hidden)
```

### Anti-Patterns to Avoid
- **Keeping the plugin's postMessage live preview alongside RefreshRouteOnSave:** Creates two competing preview update mechanisms. Remove the postMessage code entirely.
- **Using the plugin factory pattern in the starter:** The `payloadCustomiser()` function modifies config at build time. Since this is integrated directly, use direct collection config instead.
- **Hardcoding 'sections' as the blocks field name:** The customizer originally used 'sections'. Our collections use 'layout'. Make this configurable but default to 'layout'.
- **Wrapping blocks in extra divs for data-block-path:** This can break styling. Consider adding the attribute to the block's root element via a prop instead, but a wrapper div is acceptable if styled with `display: contents`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SEO metadata | Custom meta fields | `@payloadcms/plugin-seo` | Handles OG image, preview, generate functions |
| URL redirects | Custom redirect collection | `@payloadcms/plugin-redirects` | Handles redirect types, collection linking |
| Form creation | Custom form builder | `@payloadcms/plugin-form-builder` | Handles 12+ field types, submissions, emails |
| Search indexing | Custom search collection | `@payloadcms/plugin-search` | Handles sync hooks, reindexing, priorities |
| Data import/export | Custom CSV/JSON handlers | `@payloadcms/plugin-import-export` | Handles batching, jobs queue, format conversion |
| Drag-and-drop reordering | Custom DnD implementation | `@dnd-kit/core` + `@dnd-kit/sortable` | Already used by customizer, battle-tested |
| Tabs component in customizer | Building from scratch | Keep customizer's Tabs component | Already styled to match Payload admin |

**Key insight:** All 7 plugins follow the standard Payload plugin pattern -- they receive and return a modified Config. Install order matters only if plugins modify the same collections. These plugins don't conflict with each other.

## Common Pitfalls

### Pitfall 1: Import/Export Requires Jobs Queue Config
**What goes wrong:** Plugin fails to initialize or import/export operations hang.
**Why it happens:** The import/export plugin uses Payload's jobs queue for batch operations.
**How to avoid:** Add `jobs` config to payload.config.ts:
```typescript
jobs: {
  autoRun: [{ cron: '*/5 * * * *', queue: 'default' }],
},
```
**Warning signs:** Console errors about missing jobs queue configuration.

### Pitfall 2: Customizer Field Name Mismatch
**What goes wrong:** The block tree sidebar shows empty or the customizer can't find blocks.
**Why it happens:** The customizer plugin defaults to looking for a field named `sections`, but our collections use `layout`.
**How to avoid:** Change all `sections` references in the customizer code to use the configurable field name (default `layout`). Key locations:
- `DocumentFields.tsx` line 267: `field.name === 'sections'` -> `field.name === blocksFieldName`
- `DocumentFields.tsx` line 269: `field.name !== 'sections'` -> `field.name !== blocksFieldName`
- `index.client.tsx` line 379: `field.name === 'sections'` -> `field.name === blocksFieldName`
- Pass `blocksFieldName` via context or config

### Pitfall 3: dnd-kit Version Conflicts
**What goes wrong:** Build errors or runtime conflicts between two copies of dnd-kit.
**Why it happens:** Payload's admin UI bundles dnd-kit internally. Adding it as a direct dependency can create version mismatches.
**How to avoid:** Check `node_modules/@payloadcms/ui/node_modules/@dnd-kit` first. If Payload already includes compatible versions, import from there or let pnpm deduplicate. If not, explicitly install the versions the customizer needs.
**Warning signs:** "Cannot read property of undefined" errors in drag handlers, duplicate React context errors.

### Pitfall 4: Cross-Origin iframe postMessage for Block Selection
**What goes wrong:** Block click events from the preview iframe don't reach the customizer.
**Why it happens:** The preview iframe loads the frontend URL which may be on a different port or origin in development.
**How to avoid:** Use `'*'` as targetOrigin in postMessage calls during development. For production, use the configured `NEXT_PUBLIC_SERVER_URL`. The RefreshRouteOnSave component already handles this for live preview -- the block selection handler follows the same pattern.
**Warning signs:** No response when clicking blocks in the preview iframe.

### Pitfall 5: SEO Plugin with blockReferences
**What goes wrong:** SEO fields don't appear or TypeScript types are wrong.
**Why it happens:** Our collections use `blockReferences` with empty `blocks: []`. The SEO plugin adds its own fields at the collection level, not inside blocks, so this shouldn't conflict -- but verify.
**How to avoid:** Test that SEO tab appears correctly on Pages and Posts after adding the plugin. Use `tabbedUI: true` to keep it organized.

### Pitfall 6: Form Builder Plugin Creates New Collections
**What goes wrong:** Unexpected new collections appear (forms, form-submissions).
**Why it happens:** The form builder plugin creates `forms` and `form-submissions` collections automatically.
**How to avoid:** This is expected behavior. Be aware that a new migration will be needed. The form-embed block already exists at `src/blocks/FormEmbed/` -- it will need to be updated to reference the forms collection created by the plugin.

### Pitfall 7: Customizer SCSS Import Paths
**What goes wrong:** Build errors from broken CSS/SCSS imports.
**Why it happens:** The customizer plugin uses relative paths like `./index.scss` and `@/components/Tabs` that reference plugin-relative paths.
**How to avoid:** Update all import paths when copying files. SCSS files use Payload admin CSS variables (--theme-*) which should work since they're standard Payload theming.

## Code Examples

### Plugin Configuration (payload.config.ts)

```typescript
// Source: Official Payload plugin docs
import { seoPlugin } from '@payloadcms/plugin-seo'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { importExportPlugin } from '@payloadcms/plugin-import-export'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { searchPlugin } from '@payloadcms/plugin-search'

// In plugins array:
plugins: [
  // Existing
  nestedDocsPlugin({ /* already configured */ }),

  // PLUG-01: SEO
  seoPlugin({
    collections: ['pages', 'posts'],
    uploadsCollection: 'media',
    tabbedUI: true,
    generateTitle: ({ doc }) => `${doc.title} | Site Name`,
    generateDescription: ({ doc }) => doc.excerpt || '',
    generateURL: ({ doc, collectionConfig }) => {
      const prefix = collectionConfig?.slug === 'posts' ? '/blog' : ''
      return `${process.env.NEXT_PUBLIC_SERVER_URL}${prefix}/${doc.slug}`
    },
  }),

  // PLUG-02: Redirects
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      fields: ({ defaultFields }) => [
        ...defaultFields,
        {
          name: 'isRegex',
          type: 'checkbox',
          label: 'Use Regex Pattern',
          admin: { position: 'sidebar' },
        },
      ],
    },
  }),

  // PLUG-03: Form Builder
  formBuilderPlugin({
    fields: {
      text: true,
      email: true,
      textarea: true,
      select: true,
      checkbox: true,
      number: true,
      message: true,
      // Extended fields:
      country: true,
      state: true,
    },
    redirectRelationships: ['pages'],
    formOverrides: {
      admin: { group: 'Forms' },
    },
    formSubmissionOverrides: {
      admin: { group: 'Forms' },
    },
  }),

  // PLUG-05: Import/Export
  importExportPlugin({
    collections: [
      { slug: 'pages' },
      { slug: 'posts' },
      { slug: 'categories' },
      { slug: 'media' },
    ],
  }),

  // PLUG-06: MCP
  mcpPlugin({
    collections: {
      pages: { enabled: true },
      posts: { enabled: true },
      categories: { enabled: true },
      media: { enabled: { find: true } },
    },
    globals: {
      'site-settings': { enabled: { find: true, update: true } },
    },
  }),

  // PLUG-07: Search
  searchPlugin({
    collections: ['pages', 'posts', 'categories'],
    defaultPriorities: {
      pages: 10,
      posts: 20,
      categories: 30,
    },
    searchOverrides: {
      fields: ({ defaultFields }) => [
        ...defaultFields,
        { name: 'excerpt', type: 'textarea' },
        { name: 'slug', type: 'text' },
      ],
    },
    beforeSync: ({ originalDoc, searchDoc }) => ({
      ...searchDoc,
      excerpt: originalDoc?.excerpt || '',
      slug: originalDoc?.slug || '',
    }),
  }),
],
```

### Customizer View Registration (Collection Config)

```typescript
// Source: Payload custom views docs + customizer plugin index.ts
// Applied to Pages.ts, Posts.ts, TemplateParts.ts

admin: {
  // ... existing config
  components: {
    views: {
      edit: {
        customiser: {
          Component: '@/views/customiser/index#CustomiserView',
          path: '/customiser',
          tab: {
            href: '/customiser',
            label: 'Customiser',
          },
        },
      },
    },
  },
},
```

### Customiser RSC View Component

```typescript
// Source: Adapted from customizer plugin views/Customiser/index.tsx
// Key change: uses local import path instead of plugin export path

import type { EditViewComponent, LivePreviewConfig, PayloadServerReactComponent } from 'payload'
import { CustomiserClient } from './index.client'

export const CustomiserView: PayloadServerReactComponent<EditViewComponent> = async (props) => {
  const { doc, initPageResult } = props
  const { collectionConfig, globalConfig, locale, req } = initPageResult

  let livePreviewConfig: LivePreviewConfig = req.payload.config?.admin?.livePreview

  if (collectionConfig) {
    livePreviewConfig = {
      ...(livePreviewConfig || {}),
      ...(collectionConfig.admin.livePreview || {}),
    }
  }

  const breakpoints: LivePreviewConfig['breakpoints'] = [
    ...(livePreviewConfig?.breakpoints || []),
    { name: 'responsive', height: '100%', label: 'Responsive', width: '100%' },
  ]

  const url =
    typeof livePreviewConfig?.url === 'function'
      ? await livePreviewConfig.url({
          collectionConfig,
          data: doc,
          globalConfig,
          locale,
          req,
          payload: initPageResult.req.payload,
        })
      : livePreviewConfig?.url

  return <CustomiserClient breakpoints={breakpoints} initialData={doc} url={url} />
}
```

### On-Canvas Block Selection Handler (Frontend)

```typescript
// src/components/BlockSelectionHandler.tsx -- NEW client component
// Added to frontend layout when in draft mode
'use client'

import { useEffect } from 'react'

export function BlockSelectionHandler() {
  useEffect(() => {
    // Only activate when loaded inside an iframe (customizer preview)
    if (window.self === window.top) return

    const handleMouseOver = (e: MouseEvent) => {
      const block = (e.target as HTMLElement).closest('[data-block-path]') as HTMLElement
      document.querySelectorAll('.customiser-block-highlight').forEach(el => {
        el.classList.remove('customiser-block-highlight')
      })
      if (block) {
        block.classList.add('customiser-block-highlight')
      }
    }

    const handleClick = (e: MouseEvent) => {
      const block = (e.target as HTMLElement).closest('[data-block-path]') as HTMLElement
      if (block) {
        e.preventDefault()
        e.stopPropagation()
        const blockPath = block.getAttribute('data-block-path')
        window.parent.postMessage({
          type: 'customiser-block-selected',
          blockPath,
        }, '*')
      }
    }

    document.addEventListener('mouseover', handleMouseOver)
    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('mouseover', handleMouseOver)
      document.removeEventListener('click', handleClick, true)
    }
  }, [])

  return null
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| postMessage live preview | RefreshRouteOnSave | Payload 3.x | RSC-compatible, simpler code, less data transfer |
| Plugin factory pattern | Direct view registration | Payload 3.x | No config transform function needed |
| Custom live preview iframe management | Payload's built-in livePreview config | Payload 3.0+ | Breakpoints, URL generation handled by framework |

**Deprecated/outdated:**
- `useLivePreview` hook from `@payloadcms/live-preview-react` is the client-side postMessage approach -- we use `RefreshRouteOnSave` instead for RSC compatibility
- The customizer plugin's `payloadCustomiser()` wrapper function -- we register views directly

## Open Questions

1. **dnd-kit bundling with Payload**
   - What we know: The customizer needs `@dnd-kit/core` ^6.3.1 and `@dnd-kit/sortable` ^10.0.0. Payload's admin UI uses dnd-kit internally.
   - What's unclear: Whether Payload bundles compatible versions that the customizer code can reuse.
   - Recommendation: Install explicitly and let pnpm deduplicate. If build errors occur, check Payload's bundled version.

2. **Redirects regex pattern support**
   - What we know: The plugin has `redirectTypes` option. The docs don't explicitly mention regex.
   - What's unclear: Whether regex matching is built-in or needs custom middleware.
   - Recommendation: Add a custom `isRegex` field via `overrides` and implement regex matching in Next.js middleware. The plugin manages redirects in the database; matching logic is frontend responsibility.

3. **Form Builder extended features (file uploads, multi-step, conditional logic)**
   - What we know: The plugin supports text, email, textarea, select, checkbox, number, message, payment, country, state field types. Multi-step is mentioned in docs.
   - What's unclear: File upload fields and conditional logic may require custom field overrides.
   - Recommendation: Start with available field types. File uploads and conditional logic can be added via `fields` overrides with custom Block configs. This may be a Phase 5 stretch goal.

4. **Customizer admin.custom config**
   - What we know: The plugin stores `blocksFieldName` in `config.admin.custom.payloadCustomiser`.
   - What's unclear: Whether we still need this when integrating directly.
   - Recommendation: Store the blocks field name in a simple module export (`customiserConfig.ts`) rather than in the Payload config object. The customizer components can import it directly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual verification (no test framework configured) |
| Config file | none -- see Wave 0 |
| Quick run command | `pnpm build` (type-check + build verification) |
| Full suite command | `pnpm build` |

### Phase Requirements Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLUG-01 | SEO fields appear on Pages/Posts | manual | Build + visual check | N/A |
| PLUG-02 | Redirects collection exists with custom fields | manual | Build + visual check | N/A |
| PLUG-03 | Forms and form-submissions collections created | manual | Build + visual check | N/A |
| PLUG-04 | Nested docs still works for categories | manual | Already verified in Phase 3 | N/A |
| PLUG-05 | Import/Export controls appear on collections | manual | Build + visual check | N/A |
| PLUG-06 | MCP endpoint responds | manual | Build + API check | N/A |
| PLUG-07 | Search collection syncs Pages/Posts/Categories | manual | Build + visual check | N/A |
| INTG-01 | Customiser tab appears and 3-pane layout renders | manual | Build + visual check | N/A |
| INTG-02 | Theme Settings CSS variables documented | manual | File review | N/A |

### Sampling Rate
- **Per task commit:** `pnpm build` (verifies TypeScript and Next.js compilation)
- **Per wave merge:** Full build verification
- **Phase gate:** Successful build + manual visual verification of all plugin UIs

### Wave 0 Gaps
- None -- no automated test framework exists; verification is build-based and manual for admin UI plugins

## Sources

### Primary (HIGH confidence)
- [Payload SEO Plugin docs](https://raw.githubusercontent.com/payloadcms/payload/main/docs/plugins/seo.mdx) - Full configuration API
- [Payload Redirects Plugin docs](https://raw.githubusercontent.com/payloadcms/payload/main/docs/plugins/redirects.mdx) - Full configuration API
- [Payload Form Builder Plugin docs](https://raw.githubusercontent.com/payloadcms/payload/main/docs/plugins/form-builder.mdx) - Full configuration API
- [Payload Search Plugin docs](https://raw.githubusercontent.com/payloadcms/payload/main/docs/plugins/search.mdx) - Full configuration API
- [Payload Import/Export Plugin docs](https://raw.githubusercontent.com/payloadcms/payload/main/docs/plugins/import-export.mdx) - Full configuration API
- [Payload MCP Plugin docs](https://raw.githubusercontent.com/payloadcms/payload/main/docs/plugins/mcp.mdx) - Full configuration API
- [Payload Document Views docs](https://raw.githubusercontent.com/payloadcms/payload/main/docs/custom-components/document-views.mdx) - Custom tab registration
- Customizer plugin source code at `C:\Projects\sandbox\payload\payload-customiser\src` - 34 files analyzed directly

### Secondary (MEDIUM confidence)
- [Payload Edit View docs](https://payloadcms.com/docs/custom-components/edit-view) - View customization patterns

### Tertiary (LOW confidence)
- dnd-kit bundling within Payload -- needs verification at install time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All official Payload plugins with documented APIs at matching versions
- Architecture: HIGH - Customizer source fully analyzed, adaptation strategy clear
- Pitfalls: HIGH - Identified from direct source code analysis of both codebases

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable -- official plugins, analyzed source code)

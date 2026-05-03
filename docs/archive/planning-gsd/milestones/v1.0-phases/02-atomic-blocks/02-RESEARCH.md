# Phase 2: Atomic Blocks - Research

**Researched:** 2026-03-14
**Domain:** Payload CMS v3 block system -- 14 atomic blocks with per-block styling, settings, nesting, and React Server Component rendering
**Confidence:** HIGH

## Summary

This phase builds 14 atomic blocks (Heading, Paragraph, List, Blockquote, Image, Video, Icon, Button, Link, FormEmbed, Container, Grid, Spacer, Divider) with three concerns per block: Payload config (admin panel fields), style system (8 shared style properties), and frontend rendering (RSC components). The foundation is already solid -- `blocksAsJSON`, `blockReferences`, registry pattern, and `RenderBlocks` skeleton all exist from Phase 1.

The core implementation challenge is the style field system: 8 properties (padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS), each with per-direction control (top/right/bottom/left for spacing), responsive breakpoints (sm/md/lg/xl), and hybrid preset+custom inputs. This creates a substantial field tree that must be organized cleanly using Payload's `tabs` field type for the Content | Styles | Settings three-tab layout. The nesting system (children blocks field on every block, 8 levels deep) uses `blockReferences` pointing to `atomicBlockSlugs`, with `maxRows` or custom validation enforcing depth limits.

Block row labels use Payload's `admin.components.Label` on each Block definition (not RowLabel on BlocksField -- blocks field does NOT support RowLabel). The reference implementation from luxe uses `useRowLabel` and `useAllFormFields` hooks from `@payloadcms/ui` inside a `'use client'` component, with a media thumbnail cache and text extraction utilities.

**Primary recommendation:** Build in dependency order -- shared style fields first, then block configs (simplest text blocks first, layout blocks last), then frontend components, then row labels as a final polish pass.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Every block gets a 'children' blocks field -- any block can contain child blocks, not just layout blocks
- Maximum nesting depth: 8 levels (matching Shopify)
- Full recursion allowed -- a Container can contain another Container, a Heading can contain children, etc.
- Children field references all block types via blockReferences
- Three Payload tabs per block: Content | Styles | Settings
- Tailwind spacing scale for presets: none/xs/sm/md/lg/xl/2xl mapped to Tailwind spacing values (0/1/2/4/6/8/12)
- Per-direction spacing control: top, right, bottom, left individually (pt-4 pr-2 pb-4 pl-2)
- Full responsive breakpoints: sm/md/lg/xl overrides per style property
- All 8 style properties: padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS
- Color input: shadcn/ui theme palette presets + custom color picker fallback
- Hybrid value input: preset dropdown with 'custom' option revealing number input
- Configurable HTML wrapper tag in Settings tab (div, section, article, figure, header, etc.)
- Defaults are semantic per block type (Heading -> header, Image -> figure, etc.)
- Custom CSS escape hatch: two fields -- one for extra Tailwind classes (appended), one for raw inline CSS (overrides)
- Port and adapt the luxe BlockRowLabel pattern for all 14 block types
- Each block type gets a unique SVG icon (16x16)
- Media thumbnails on: Image, Video, Icon blocks + any parent block shows first image from children
- Text snippets on: Heading (heading text), Paragraph (first line), Button/Link (label text), List/Blockquote (first item)
- Layout blocks (Container, Grid, Spacer, Divider): icon + type name + child count
- Form embed: icon + type name

### Claude's Discretion
- Exact SVG icon designs for each block type
- Style-to-Tailwind mapping implementation approach
- Children rendering strategy (direct vs slot-based)
- How to implement the 8-level nesting depth limit in practice
- Responsive breakpoint field UI structure within the Styles tab

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BLCK-01 | Composable nested block system with atomic blocks composed into sections (Shopify-style architecture) | Block registry pattern, blockReferences, children field on every block, 8-level depth limit via validation |
| BLCK-02 | Text blocks -- Heading, Paragraph, List, Blockquote | Block configs with tabs (Content/Styles/Settings), text/richtext/array fields, semantic wrapper tags |
| BLCK-03 | Media blocks -- Image, Video, Icon | Upload relationship fields to Media collection, responsive rendering, figure/video wrapper tags |
| BLCK-04 | Action blocks -- Button, Link, Form embed | Link field group pattern, FormEmbed with relationship to forms collection (Phase 5 wiring), button variants |
| BLCK-05 | Layout blocks -- Container, Grid/Columns, Spacer, Divider | Container as generic wrapper, Grid with column count/gap settings, Spacer with height presets, Divider as hr |
| BLCK-06 | Per-block style options (padding, margin, border-radius, border-width, text-size, background-color, text-color, custom CSS) | Shared styleOptions field group in Styles tab, hybrid preset+custom input, responsive breakpoints, style-to-Tailwind mapping utility |
| BLCK-07 | Per-block settings tab (heading tag h1-h6, block-type-specific settings) | Settings tab with wrapper tag select, block-specific options (heading level, grid columns, spacer size, etc.) |
| BLCK-11 | Rich block row labels with icons, media thumbnails, and text content snippets | Block admin.components.Label with BlockRowLabel client component using useRowLabel + useAllFormFields |
</phase_requirements>

## Standard Stack

### Core (already installed from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `payload` | ^3.79.0 | Block config definitions, tabs field, admin components | Core CMS -- all block configs are Payload Block types |
| `@payloadcms/ui` | ^3.79.0 | `useRowLabel`, `useAllFormFields` hooks for admin components | Required for BlockRowLabel client component |
| `tailwind-merge` | ^3.4.0 | Merging block style classes with custom CSS classes | Essential when composing Tailwind classes from multiple sources |
| `clsx` | ^2.1.1 | Conditional class building in style mapper | Pairs with tailwind-merge via cn() utility |
| `lucide-react` | 0.563.0 | Fallback icons if SVG inline icons are insufficient | Already installed with shadcn |

### Supporting (no new installs needed)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `cn()` from `src/lib/utils.ts` | Merge Tailwind classes | Every block component that applies styles |
| `sharp` | Image processing for media blocks | Already configured in Media collection |

**No new dependencies required for this phase.**

## Architecture Patterns

### Recommended Block Folder Structure
```
src/blocks/
  Heading/
    config.ts        # Payload Block definition with tabs
    component.tsx    # Frontend RSC component
  Paragraph/
    config.ts
    component.tsx
  List/
    config.ts
    component.tsx
  Blockquote/
    config.ts
    component.tsx
  Image/
    config.ts
    component.tsx
  Video/
    config.ts
    component.tsx
  Icon/
    config.ts
    component.tsx
  Button/
    config.ts
    component.tsx
  Link/
    config.ts
    component.tsx
  FormEmbed/
    config.ts
    component.tsx
  Container/
    config.ts
    component.tsx
  Grid/
    config.ts
    component.tsx
  Spacer/
    config.ts
    component.tsx
  Divider/
    config.ts
    component.tsx
  registry.ts        # Updated with all 14 blocks
  RenderBlocks.tsx   # Updated with all 14 component mappings
src/fields/
  styleOptions.ts    # Complete style field system (8 properties + responsive)
  link.ts            # Reusable link field group for Button/Link blocks
src/components/admin/
  BlockRowLabel.tsx   # Shared row label component for all blocks
```

### Pattern 1: Three-Tab Block Config (Content | Styles | Settings)

**What:** Every block uses Payload's `tabs` field as its root field structure, with three tabs: Content (block-specific fields), Styles (shared 8 style properties), and Settings (wrapper tag + block-specific options).

**When to use:** Every single block config.

**Example:**
```typescript
// src/blocks/Heading/config.ts
import type { Block } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { settingsFields } from '@/fields/settingsFields'

export const HeadingBlock: Block = {
  slug: 'heading',
  interfaceName: 'HeadingBlock',
  labels: { singular: 'Heading', plural: 'Headings' },
  admin: {
    disableBlockName: true,
    components: {
      Label: '/components/admin/BlockRowLabel.tsx#BlockRowLabel',
    },
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'text', type: 'text', required: true },
            { name: 'tag', type: 'select', defaultValue: 'h2',
              options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
            {
              name: 'children',
              type: 'blocks',
              blockReferences: atomicBlockSlugs,
              blocks: [],
              maxRows: 20,
            },
          ],
        },
        {
          label: 'Styles',
          fields: styleFields,  // Shared style field array
        },
        {
          label: 'Settings',
          fields: [
            { name: 'htmlTag', type: 'select', defaultValue: 'header',
              options: ['div', 'section', 'article', 'header', 'aside', 'span'] },
            { name: 'customClasses', type: 'text',
              admin: { description: 'Additional Tailwind classes' } },
            { name: 'inlineCSS', type: 'text',
              admin: { description: 'Raw inline CSS (e.g. max-width: 600px)' } },
          ],
        },
      ],
    },
  ],
}
```

**Key detail:** Tabs must be unnamed (no `name` property) to avoid data nesting. Unnamed tabs use only `label` -- fields store at the block's root level. If you use named tabs, fields nest under the tab name in the data, which complicates frontend rendering.

### Pattern 2: Shared Style Fields with Responsive Breakpoints

**What:** A reusable field array defining all 8 style properties, each with per-direction control (for spacing) and responsive breakpoint overrides.

**When to use:** Spread into the Styles tab of every block.

**Example structure for one spacing property:**
```typescript
// src/fields/styleOptions.ts
import type { Field } from 'payload'

const spacingPresets = [
  { label: 'None', value: 'none' },
  { label: 'XS', value: 'xs' },
  { label: 'SM', value: 'sm' },
  { label: 'MD', value: 'md' },
  { label: 'LG', value: 'lg' },
  { label: 'XL', value: 'xl' },
  { label: '2XL', value: '2xl' },
  { label: 'Custom', value: 'custom' },
]

// Helper to create a single direction's responsive spacing field
function spacingDirection(name: string, label: string): Field {
  return {
    name,
    type: 'group',
    label,
    admin: { hideGutter: true },
    fields: [
      { name: 'base', type: 'select', options: spacingPresets, defaultValue: 'none' },
      { name: 'custom', type: 'number', admin: {
        condition: (_, siblingData) => siblingData?.base === 'custom',
        description: 'Custom value in Tailwind spacing units',
      }},
      { name: 'sm', type: 'select', options: spacingPresets },
      { name: 'md', type: 'select', options: spacingPresets },
      { name: 'lg', type: 'select', options: spacingPresets },
      { name: 'xl', type: 'select', options: spacingPresets },
    ],
  }
}

export const styleFields: Field[] = [
  {
    name: 'padding',
    type: 'group',
    label: 'Padding',
    fields: [
      spacingDirection('top', 'Top'),
      spacingDirection('right', 'Right'),
      spacingDirection('bottom', 'Bottom'),
      spacingDirection('left', 'Left'),
    ],
  },
  {
    name: 'margin',
    type: 'group',
    label: 'Margin',
    fields: [
      spacingDirection('top', 'Top'),
      spacingDirection('right', 'Right'),
      spacingDirection('bottom', 'Bottom'),
      spacingDirection('left', 'Left'),
    ],
  },
  // ... borderRadius, borderWidth, textSize, backgroundColor, textColor, customCSS
]
```

### Pattern 3: Style-to-Tailwind Mapping Utility

**What:** A utility function that takes style field data and returns a Tailwind class string. Maps preset values to specific Tailwind classes.

**When to use:** Every block's frontend component calls this to generate className.

**Example:**
```typescript
// src/lib/blockStyles.ts
const spacingMap: Record<string, string> = {
  none: '0',
  xs: '1',
  sm: '2',
  md: '4',
  lg: '6',
  xl: '8',
  '2xl': '12',
}

const directionPrefix = {
  padding: { top: 'pt', right: 'pr', bottom: 'pb', left: 'pl' },
  margin: { top: 'mt', right: 'mr', bottom: 'mb', left: 'ml' },
}

function resolveSpacing(
  type: 'padding' | 'margin',
  data: Record<string, any> | undefined
): string[] {
  if (!data) return []
  const classes: string[] = []
  const prefixes = directionPrefix[type]

  for (const [dir, prefix] of Object.entries(prefixes)) {
    const dirData = data[dir]
    if (!dirData) continue

    // Base value
    const baseVal = dirData.base
    if (baseVal && baseVal !== 'none') {
      const tw = baseVal === 'custom' ? String(dirData.custom ?? 0) : spacingMap[baseVal]
      classes.push(`${prefix}-${tw}`)
    }

    // Responsive overrides
    for (const bp of ['sm', 'md', 'lg', 'xl']) {
      const bpVal = dirData[bp]
      if (bpVal && bpVal !== 'none') {
        const tw = bpVal === 'custom' ? String(dirData[`${bp}Custom`] ?? 0) : spacingMap[bpVal]
        classes.push(`${bp}:${prefix}-${tw}`)
      }
    }
  }
  return classes
}

export function getBlockStyles(styles: Record<string, any> | undefined): {
  className: string
  style?: React.CSSProperties
} {
  if (!styles) return { className: '' }

  const classes: string[] = []

  // Spacing
  classes.push(...resolveSpacing('padding', styles.padding))
  classes.push(...resolveSpacing('margin', styles.margin))

  // Border radius
  // ... similar mapping for borderRadius, borderWidth, textSize

  // Colors
  if (styles.backgroundColor?.preset && styles.backgroundColor.preset !== 'none') {
    classes.push(`bg-${styles.backgroundColor.preset}`)
  }
  if (styles.textColor?.preset && styles.textColor.preset !== 'none') {
    classes.push(`text-${styles.textColor.preset}`)
  }

  // Custom classes appended
  if (styles.customClasses) {
    classes.push(styles.customClasses)
  }

  // Inline CSS parsed into style object
  const inlineStyle = styles.inlineCSS
    ? parseInlineCSS(styles.inlineCSS)
    : undefined

  return {
    className: classes.join(' '),
    style: inlineStyle,
  }
}
```

### Pattern 4: Block Component with Wrapper Tag and Children

**What:** Every block frontend component renders a configurable HTML wrapper tag, applies computed styles, and renders children blocks via RenderBlocks recursion.

**When to use:** Every block's frontend component.

**Example:**
```typescript
// src/blocks/Heading/component.tsx
import { cn } from '@/lib/utils'
import { getBlockStyles } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { HeadingBlock as HeadingBlockType } from '@/payload-types'

export function HeadingBlock(props: HeadingBlockType) {
  const { text, tag = 'h2', htmlTag = 'header', children, ...rest } = props
  const { className, style } = getBlockStyles(rest)
  const Tag = htmlTag as keyof JSX.IntrinsicElements
  const HeadingTag = tag as keyof JSX.IntrinsicElements

  return (
    <Tag className={cn(className)} style={style}>
      <HeadingTag>{text}</HeadingTag>
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
```

### Pattern 5: Block Row Labels via admin.components.Label

**What:** Each Block definition sets `admin.components.Label` to a shared BlockRowLabel client component. This component uses `useRowLabel` to access block data and `useAllFormFields` to access sibling form state (for media thumbnails and nested content inspection).

**When to use:** Every block's config.

**Critical implementation details from reference:**
```typescript
// Block config:
admin: {
  disableBlockName: true,  // Remove default blockName text input
  components: {
    Label: '/components/admin/BlockRowLabel.tsx#BlockRowLabel',
    // Path string format: Payload resolves this at build time
    // The # separates file path from named export
  },
}
```

The `Label` component path must be relative to the `src/` directory (or the `importMap.baseDir` in payload config). Payload auto-generates an import map that resolves these path strings to actual React components.

### Anti-Patterns to Avoid

- **Named tabs for Content/Styles/Settings:** Using `name` on tabs would nest data under `content.text` instead of just `text`. Use unnamed tabs (label only) so fields stay at the block root.
- **Inline block configs instead of blockReferences for children:** The children field must use `blockReferences: atomicBlockSlugs` (not inline `blocks: [...]`) to avoid config duplication.
- **Making RenderBlocks a client component:** RenderBlocks must be a server component. Only leaf interactive blocks (FormEmbed, possibly Accordion in sections) need `'use client'`.
- **One BlockRowLabel per block type:** Use a SINGLE shared BlockRowLabel component with a switch on `blockType`, not 14 separate label components.
- **Custom color values stored as hex codes:** Store Tailwind class names (e.g., `primary`, `secondary`, `muted`) not raw hex values. Only the custom color picker should produce raw values.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tailwind class merging/conflicts | Custom class deduplication | `cn()` (clsx + tailwind-merge) | Handles conflict resolution (e.g., `p-4` vs `p-8` keeps only the last) |
| Rich text rendering (Paragraph) | Custom Lexical-to-HTML renderer | `@payloadcms/richtext-lexical` serializer | Lexical has its own JSX serializer for RSC rendering |
| Image optimization | Custom image component | Next.js `<Image>` component | Handles srcSet, lazy loading, WebP/AVIF, blur placeholder |
| Form rendering | Custom form UI | `@payloadcms/plugin-form-builder` (Phase 5) | FormEmbed block just references a form by ID; rendering handled by plugin |
| SVG icon management | Icon font or sprite sheet | Inline SVG in BlockRowLabel (same as luxe reference) | 14 icons at 16x16 are trivial as inline SVG. No build step needed. |

## Common Pitfalls

### Pitfall 1: Named vs Unnamed Tabs Data Nesting
**What goes wrong:** Using `{ name: 'content', label: 'Content', fields: [...] }` for tabs causes field data to nest under `block.content.text` instead of `block.text`. Frontend components break because they expect flat data.
**Why it happens:** Payload treats named tabs as group-like fields that scope their children under the tab name.
**How to avoid:** Use unnamed tabs (label-only, no name property). All fields store at the block's root level. If you need named tabs for TypeScript type generation, adjust frontend components accordingly.
**Warning signs:** Generated types show nested `content?: { text: string }` instead of flat `text: string`.

### Pitfall 2: Circular Block References in Children
**What goes wrong:** Every block has a children field that references all atomic block slugs. This creates a circular reference in the config (HeadingBlock references atomicBlockSlugs which includes 'heading'). With `blocksAsJSON: true` this works fine for storage, but without depth limiting, the admin panel allows infinite nesting.
**Why it happens:** Full recursion is a project decision. The admin panel does not enforce depth limits by default.
**How to avoid:** Either: (a) use `maxRows` on children fields to limit practical nesting, (b) add a custom `beforeChange` hook that validates max depth, or (c) rely on `blocksAsJSON` and accept that editors can nest deeply (admin UX discourages it naturally). Recommended approach: combine `maxRows: 20` with a `validate` function that checks depth.
**Warning signs:** Admin panel becoming slow when deeply nesting. Editors creating 10+ level deep structures.

### Pitfall 3: Style Field Explosion in Admin UI
**What goes wrong:** 8 style properties x 4 directions x 5 responsive breakpoints = 160+ individual fields per block in the Styles tab. The admin panel becomes unusable.
**Why it happens:** Implementing every permutation of per-direction + responsive creates an overwhelming form.
**How to avoid:** Use collapsible groups aggressively. Start most fields collapsed. Use Payload's `admin.condition` to show responsive fields only when a "responsive" toggle is enabled. Consider a progressive disclosure pattern: show base values by default, reveal direction-specific and responsive overrides on demand.
**Warning signs:** Styles tab requiring excessive scrolling. Editors avoiding style options entirely.

### Pitfall 4: BlockRowLabel import path format
**What goes wrong:** Using the wrong path format for `admin.components.Label` causes the admin panel to fail silently or show default labels.
**Why it happens:** Payload v3 uses a path-string format that gets resolved through the import map generated at build time. The format is `'/path/from/baseDir/File.tsx#ExportName'`.
**How to avoid:** The path must start with `/` (relative to `importMap.baseDir` which is `src/` in this project). The export name after `#` must match the exact named export. Example: `'/components/admin/BlockRowLabel.tsx#BlockRowLabel'`. Run `pnpm payload generate:importmap` if the component is not being picked up.
**Warning signs:** Admin panel showing generic "Block" labels instead of custom labels. Console errors about missing imports.

### Pitfall 5: Responsive Breakpoint Classes Not in Tailwind Safelist
**What goes wrong:** Dynamically generated Tailwind classes like `sm:pt-4` or `lg:mb-8` do not appear in the CSS output because Tailwind's JIT compiler never saw them in source files.
**Why it happens:** Tailwind v4 scans source files for class names. Dynamically constructed classes (`${bp}:${prefix}-${value}`) are not found by the scanner.
**How to avoid:** Use a safelist approach: either (a) add a safelist comment file that lists all possible generated classes, (b) use Tailwind v4's `@source` directive to include the mapping file, or (c) switch to inline styles for dynamic values. Recommended: use a safelist utility file that explicitly lists all generated class strings.
**Warning signs:** Styles working in dev (with JIT recompilation) but missing in production builds.

## Code Examples

### Block Config with Full Tabs Pattern
```typescript
// src/blocks/Image/config.ts
import type { Block } from 'payload'
import { atomicBlockSlugs } from '@/blocks/registry'

export const ImageBlock: Block = {
  slug: 'image',
  interfaceName: 'ImageBlock',
  labels: { singular: 'Image', plural: 'Images' },
  admin: {
    disableBlockName: true,
    components: {
      Label: '/components/admin/BlockRowLabel.tsx#BlockRowLabel',
    },
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              required: true,
            },
            { name: 'alt', type: 'text' },
            { name: 'caption', type: 'text' },
            {
              name: 'children',
              type: 'blocks',
              blockReferences: atomicBlockSlugs,
              blocks: [],
            },
          ],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        {
          label: 'Settings',
          fields: [
            {
              name: 'htmlTag',
              type: 'select',
              defaultValue: 'figure',
              options: ['div', 'figure', 'section', 'aside', 'span'],
            },
            {
              name: 'objectFit',
              type: 'select',
              defaultValue: 'cover',
              options: ['cover', 'contain', 'fill', 'none'],
            },
            {
              name: 'aspectRatio',
              type: 'select',
              options: [
                { label: 'Auto', value: 'auto' },
                { label: '1:1', value: '1/1' },
                { label: '4:3', value: '4/3' },
                { label: '16:9', value: '16/9' },
                { label: '3:2', value: '3/2' },
              ],
            },
            { name: 'customClasses', type: 'text' },
            { name: 'inlineCSS', type: 'text' },
          ],
        },
      ],
    },
  ],
}
```

### RSC Block Component with Style Application
```typescript
// src/blocks/Container/component.tsx
import { cn } from '@/lib/utils'
import { getBlockStyles } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { ContainerBlock as ContainerBlockType } from '@/payload-types'

export function ContainerBlock(props: ContainerBlockType) {
  const { htmlTag = 'div', children, customClasses, ...rest } = props
  const { className, style } = getBlockStyles(rest)
  const Tag = htmlTag as keyof JSX.IntrinsicElements

  return (
    <Tag className={cn(className, customClasses)} style={style}>
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
```

### BlockRowLabel Adapted for 14 Block Types
```typescript
// src/components/admin/BlockRowLabel.tsx
'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRowLabel, useAllFormFields } from '@payloadcms/ui'

// Media thumbnail cache (same pattern as luxe)
const mediaCache = new Map<number | string, string>()

function useMediaThumbnail(mediaId: number | string | null): string | null {
  const [url, setUrl] = useState<string | null>(
    mediaId ? (mediaCache.get(mediaId) ?? null) : null
  )
  useEffect(() => {
    if (!mediaId) return
    if (mediaCache.has(mediaId)) { setUrl(mediaCache.get(mediaId)!); return }
    let cancelled = false
    fetch(`/api/media/${mediaId}?depth=0`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const thumb = data?.thumbnailURL || data?.url || null
        if (thumb) { mediaCache.set(mediaId, thumb); setUrl(thumb) }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [mediaId])
  return url
}

// ... SVG icons for all 14 block types
// ... text extraction helpers (truncate, extractPlainText, etc.)
// ... switch on blockType for summary/mediaId extraction
```

### Registry Population
```typescript
// src/blocks/registry.ts
import type { Block } from 'payload'
import { HeadingBlock } from './Heading/config'
import { ParagraphBlock } from './Paragraph/config'
// ... 12 more imports

export const allBlocks: Block[] = [
  HeadingBlock, ParagraphBlock, ListBlock, BlockquoteBlock,
  ImageBlock, VideoBlock, IconBlock,
  ButtonBlock, LinkBlock, FormEmbedBlock,
  ContainerBlock, GridBlock, SpacerBlock, DividerBlock,
]

export const atomicBlockSlugs: string[] = [
  'heading', 'paragraph', 'list', 'blockquote',
  'image', 'video', 'icon',
  'button', 'link', 'formEmbed',
  'container', 'grid', 'spacer', 'divider',
]

export const sectionBlockSlugs: string[] = [] // Phase 4
export const allBlockSlugs: string[] = [...atomicBlockSlugs, ...sectionBlockSlugs]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `imageURL` on Block | `admin.images.thumbnail` on Block | Payload 3.x recent | Use `admin.images` for block picker thumbnails, not deprecated `imageURL` |
| Inline block configs in collections | `blockReferences` + global `blocks` array | Payload 3.x | Blocks defined once, referenced by slug everywhere |
| `admin.components.RowLabel` on BlocksField | `admin.components.Label` on Block definition | Payload 3.x | RowLabel is for ArrayField only; blocks use Label on the Block type itself |
| Config file `tailwind.config.js` | CSS-first `@theme` in global CSS | Tailwind v4 | Safelist must use `@source` directive or explicit class file, not config |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | none -- see Wave 0 |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BLCK-01 | Block registry exports 14 blocks, atomicBlockSlugs has 14 entries | unit | `pnpm vitest run tests/blocks/registry.test.ts -x` | No - Wave 0 |
| BLCK-02 | Text block configs have correct fields (text, tag, richText) | unit | `pnpm vitest run tests/blocks/text-blocks.test.ts -x` | No - Wave 0 |
| BLCK-03 | Media block configs have upload fields referencing 'media' | unit | `pnpm vitest run tests/blocks/media-blocks.test.ts -x` | No - Wave 0 |
| BLCK-04 | Action block configs have link/button fields | unit | `pnpm vitest run tests/blocks/action-blocks.test.ts -x` | No - Wave 0 |
| BLCK-05 | Layout block configs have correct settings (columns, height) | unit | `pnpm vitest run tests/blocks/layout-blocks.test.ts -x` | No - Wave 0 |
| BLCK-06 | Style fields array has 8+ properties with correct structure | unit | `pnpm vitest run tests/fields/styleOptions.test.ts -x` | No - Wave 0 |
| BLCK-07 | Every block config has Settings tab with htmlTag field | unit | `pnpm vitest run tests/blocks/settings-tab.test.ts -x` | No - Wave 0 |
| BLCK-11 | BlockRowLabel renders icon + type label for each block type | unit | `pnpm vitest run tests/components/BlockRowLabel.test.ts -x` | No - Wave 0 |
| BLCK-06 | getBlockStyles maps presets to correct Tailwind classes | unit | `pnpm vitest run tests/lib/blockStyles.test.ts -x` | No - Wave 0 |
| BLCK-01 | Children field with blockReferences present on every block | unit | `pnpm vitest run tests/blocks/children-field.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- vitest configuration (jsdom for component tests)
- [ ] `tests/blocks/registry.test.ts` -- verify registry exports
- [ ] `tests/fields/styleOptions.test.ts` -- verify style field structure
- [ ] `tests/lib/blockStyles.test.ts` -- verify style-to-Tailwind mapping

## Open Questions

1. **Lexical RichText serialization for Paragraph block RSC rendering**
   - What we know: `@payloadcms/richtext-lexical` has server-side JSX serialization via `RichText` component
   - What's unclear: Exact import path and props for the RSC-compatible serializer in current version
   - Recommendation: Check `@payloadcms/richtext-lexical/react` or `@payloadcms/richtext-lexical/rsc` exports when implementing Paragraph component

2. **FormEmbed block wiring without Form Builder plugin**
   - What we know: Form Builder plugin is Phase 5, but FormEmbed block is Phase 2
   - What's unclear: Whether to create a placeholder relationship field or stub the block
   - Recommendation: Create the block config with a `text` field for form ID (not a relationship), and a TODO comment noting Phase 5 will wire to the forms collection

3. **Tailwind v4 safelist for dynamic classes**
   - What we know: Tailwind v4 dropped the `safelist` config option (it was in v3's `tailwind.config.js`)
   - What's unclear: Best approach for ensuring dynamically composed classes are included in v4
   - Recommendation: Create a `src/lib/tailwind-safelist.ts` file that contains all possible class strings as literal strings, and add `@source "../lib/tailwind-safelist.ts"` to the CSS

## Sources

### Primary (HIGH confidence)
- Payload field types from `node_modules/payload/dist/fields/config/types.d.ts` -- verified Block type has `admin.components.Label` (not RowLabel), BlocksField has no RowLabel support
- Payload field types -- TabsField uses `tabs: Tab[]` with Tab being NamedTab or UnnamedTab
- `@payloadcms/ui` exports -- `useRowLabel` and `useAllFormFields` confirmed available
- Luxe BlockRowLabel reference at `C:\Projects\personal\luxe\luxe-escorts\src\components\admin\BlockRowLabel.tsx` -- verified working pattern with `useRowLabel`, `useAllFormFields`, media cache, SVG icons
- Luxe HeadingBlock config -- verified `admin.components.Label` path string format and `disableBlockName: true`
- [Payload Blocks Field Documentation](https://payloadcms.com/docs/fields/blocks)
- [Payload Tabs Field Documentation](https://payloadcms.com/docs/fields/tabs)

### Secondary (MEDIUM confidence)
- [GitHub Issue #12112](https://github.com/payloadcms/payload/issues/12112) -- confirms RowLabel is not available on blocks field (array-only)
- [Payload Community Help: Rowlabel for blocks](https://payloadcms.com/community-help/discord/rowlabel-for-blocks) -- confirms Label on Block config is the correct approach

### Tertiary (LOW confidence)
- Tailwind v4 safelist approach via `@source` -- needs verification in practice

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, types verified from node_modules
- Architecture: HIGH -- patterns verified from working luxe reference and Payload type definitions
- Pitfalls: HIGH -- verified against actual type system (RowLabel vs Label distinction) and established project patterns
- Style system: MEDIUM -- field structure is sound but responsive + per-direction creates complex field trees that need UX testing

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable domain, Payload v3 APIs mature)

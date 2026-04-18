# Phase 10: Theme Settings - Research

**Researched:** 2026-03-15
**Domain:** Payload CMS globals, CSS custom properties, color space conversion, Google Fonts
**Confidence:** HIGH

## Summary

Phase 10 implements site-wide design tokens stored in a Payload CMS global (`ThemeSettings`), edited via custom admin field components, and injected as CSS custom properties on the frontend `<html>` element. The existing `globals.css` already defines all shadcn/ui variables in `:root` using oklch values, with a `@theme inline` block that maps them to Tailwind v4 utility names. Theme Settings only needs to override these `:root` values via inline styles -- Tailwind and shadcn/ui pick up changes automatically.

The core technical challenges are: (1) hex-to-oklch color conversion for storage, (2) deriving secondary colors (card, popover, sidebar, chart) from a core set of ~6 admin-editable colors, (3) dynamic Google Fonts loading since `next/font/google` requires static build-time definitions, and (4) cache revalidation when theme values change.

**Primary recommendation:** Use `culori` for color conversion (tree-shakeable, comprehensive oklch support), Google Fonts CSS link tags for dynamic font loading (not `next/font/google`), and `revalidateTag` with a `theme-settings` cache tag for on-demand revalidation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Four token categories: Colors, Fonts, Spacing scale, Border radius
- Colors: core set of ~6 (primary, secondary, accent, muted, destructive, background/foreground) -- admin edits these
- Auto-derived colors: card, popover, sidebar, chart colors computed from core set at save time via afterChange hook
- Fonts: Google Fonts with search/browse -- both sans and mono families
- Spacing: base spacing multiplier controlling what xs/sm/md/lg/xl/2xl map to in styleOptions.ts
- Border radius: global --radius value (currently 0.625rem), shadcn derives sm/md/lg/xl from it
- Current globals.css values serve as fallback when no theme is configured
- Theme Settings only overrides what admin explicitly changes
- Zero-config works out of the box with existing shadcn/ui defaults
- Payload global (like SiteSettings) with custom React field components, not a standalone admin view
- Leverage Payload's native live preview to preview theme changes on frontend
- Color input: visual color picker + hex text input
- Spacing and border radius: range slider + number input
- Token groups organized by category as collapsible sections
- Fetch theme global in layout.tsx, output CSS variables as inline style on html element
- Override :root variables only -- globals.css @theme inline block already maps --color-primary to var(--primary)
- Google Fonts loaded via next/font/google for self-hosting and optimization
- Fetch + revalidate caching: theme fetched once, revalidated when admin saves via Payload afterChange hook
- Mirror exact shadcn/ui variable names (--primary, --background, --radius, etc.)
- Admin inputs hex colors, system converts to oklch for storage and CSS output
- Derived colors computed at save time and stored in JSON -- no render-time computation

### Claude's Discretion
- Exact color derivation algorithm (how card/popover/sidebar derive from core colors)
- oklch conversion implementation
- Google Fonts search UI component details
- Slider component implementation for spacing/radius
- afterChange hook revalidation mechanism

### Deferred Ideas (OUT OF SCOPE)
- Dark mode toggle -- can be layered on top of theme settings later
- Per-page theme overrides -- explicitly out of scope for v1.1
- Theme import/export (share themes as JSON files)
- Theme presets gallery (pick from curated themes)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| THEME-01 | Theme Settings global with JSON field storing site-wide design tokens (colors, fonts, spacing, border radius) | GlobalConfig pattern from SiteSettings.ts, JSON field type, afterChange hook for color derivation |
| THEME-02 | Custom admin view for editing theme values visually | Payload UI field type + custom React components with useField hook, color picker, range sliders |
| THEME-03 | Theme values injected as CSS variables on frontend pages via layout.tsx | Inline style on html element in layout.tsx, payload.findGlobal fetch, revalidateTag caching |
| THEME-04 | shadcn/ui components respect theme CSS variables | Already works -- globals.css @theme inline maps --color-primary to var(--primary), overriding :root vars is sufficient |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| culori | latest | Hex-to-oklch color conversion | Tree-shakeable via culori/fn, comprehensive oklch support, formatCss for CSS output |
| payload (existing) | ^3.79.0 | Global config, hooks, admin field components | Already in project |
| @payloadcms/ui (existing) | ^3.79.0 | useField hook, admin UI components | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| google-font-metadata | latest | Static JSON list of all Google Fonts families | For font search/browse in admin UI, avoids runtime API calls |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| culori | colorizr or @texel/color | colorizr is simpler but less precise oklch; @texel/color is smaller but less documented |
| google-font-metadata | Google Fonts API (runtime) | API requires key, adds latency; static JSON is faster for admin search |
| Google Fonts link tags | next/font/google | next/font requires static build-time calls, cannot load CMS-defined fonts dynamically |

**Installation:**
```bash
pnpm add culori google-font-metadata
pnpm add -D @types/culori
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── globals/
│   ├── SiteSettings.ts          # Existing
│   └── ThemeSettings.ts         # NEW: Global config with JSON field + hooks
├── hooks/
│   ├── revalidatePage.ts        # Existing pattern
│   └── revalidateTheme.ts       # NEW: afterChange hook for theme global
├── fields/
│   └── theme/
│       ├── index.ts             # UI field config that renders custom components
│       ├── ColorPicker.tsx       # Color picker + hex input (client component)
│       ├── FontSelector.tsx      # Google Fonts search/select (client component)
│       ├── SliderField.tsx       # Range slider + number input (client component)
│       └── deriveColors.ts      # Color derivation algorithm (shared, server-safe)
├── lib/
│   ├── blockStyles.ts           # Existing -- spacing map lives here
│   └── themeUtils.ts            # NEW: hex-to-oklch conversion, CSS variable builder
└── app/(frontend)/
    └── layout.tsx               # MODIFIED: fetch theme, inject CSS vars on <html>
```

### Pattern 1: Payload Global with JSON Storage + Custom Fields
**What:** A single Payload global stores all theme tokens in a JSON field, with UI fields rendering custom React components for visual editing
**When to use:** When you need structured data with a custom admin experience
**Example:**
```typescript
// globals/ThemeSettings.ts
import type { GlobalConfig } from 'payload'
import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { revalidateTheme } from '../hooks/revalidateTheme'

export const ThemeSettings: GlobalConfig = {
  slug: 'theme-settings',
  access: {
    read: anyone,
    update: authenticated,
  },
  hooks: {
    afterChange: [revalidateTheme],
  },
  admin: {
    group: 'Settings',
  },
  fields: [
    // Core color fields with custom components
    {
      name: 'colors',
      type: 'group',
      fields: [
        {
          name: 'primary',
          type: 'text',
          admin: {
            components: {
              Field: '@/fields/theme/ColorPicker#ColorPickerField',
            },
          },
        },
        // ... more color fields
      ],
    },
    {
      name: 'fonts',
      type: 'group',
      fields: [
        {
          name: 'sans',
          type: 'text',
          admin: {
            components: {
              Field: '@/fields/theme/FontSelector#FontSelectorField',
            },
          },
        },
      ],
    },
    {
      name: 'spacing',
      type: 'group',
      fields: [
        {
          name: 'baseMultiplier',
          type: 'number',
          defaultValue: 4,
          admin: {
            components: {
              Field: '@/fields/theme/SliderField#SliderField',
            },
          },
        },
      ],
    },
    {
      name: 'borderRadius',
      type: 'text',
      defaultValue: '0.625rem',
      admin: {
        components: {
          Field: '@/fields/theme/SliderField#SliderField',
        },
      },
    },
    // Computed/derived values stored at save time
    {
      name: 'derivedTokens',
      type: 'json',
      admin: { hidden: true },
    },
  ],
}
```

### Pattern 2: Custom Field Component with useField
**What:** Client-side React component that manages field value through Payload's form system
**When to use:** For any field that needs custom UI beyond standard Payload inputs
**Example:**
```typescript
'use client'
// fields/theme/ColorPicker.tsx
import { useField } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'

export const ColorPickerField: TextFieldClientComponent = ({ path, field }) => {
  const { value, setValue } = useField<string>({ path })

  return (
    <div>
      <label>{field.label}</label>
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => setValue(e.target.value)}
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => setValue(e.target.value)}
        placeholder="#000000"
      />
    </div>
  )
}
```

### Pattern 3: CSS Variable Injection in Layout
**What:** Fetch theme global in layout.tsx, build inline style object with CSS custom properties, apply to `<html>`
**When to use:** For theme values that override :root CSS variables
**Example:**
```typescript
// In layout.tsx
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export default async function RootLayout({ children }) {
  const payload = await getPayload({ config: configPromise })
  const theme = await payload.findGlobal({
    slug: 'theme-settings',
    // Use unstable_cache or next cache tag for performance
  })

  const cssVars = buildCSSVariables(theme) // Returns Record<string, string>

  return (
    <html style={cssVars} className={cn(fontClasses)} lang="en">
      {/* ... */}
    </html>
  )
}
```

### Pattern 4: Color Derivation at Save Time
**What:** afterChange hook converts hex inputs to oklch and derives secondary colors, storing everything in a `derivedTokens` JSON field
**When to use:** To avoid render-time computation and ensure consistent color output
**Example:**
```typescript
// hooks/revalidateTheme.ts
import type { GlobalAfterChangeHook } from 'payload'
import { revalidateTag } from 'next/cache'

export const revalidateTheme: GlobalAfterChangeHook = async ({
  doc,
  req: { payload },
}) => {
  // Derive colors from core set
  const derived = deriveAllTokens(doc.colors)

  // Update the derivedTokens field
  await payload.updateGlobal({
    slug: 'theme-settings',
    data: { derivedTokens: derived },
    req: { context: { disableRevalidate: true } }, // Prevent infinite loop
  })

  revalidateTag('theme-settings')
  return doc
}
```

### Anti-Patterns to Avoid
- **Render-time color computation:** Never derive colors in layout.tsx or React components -- do it in the afterChange hook
- **Using next/font/google for dynamic fonts:** It requires static build-time calls; use Google Fonts CSS link tags instead for CMS-defined fonts
- **Storing CSS strings instead of structured data:** Store hex values and convert to oklch; structured data is queryable and transformable
- **Overriding @theme inline block:** Only override :root variables; the @theme inline mapping remains static in globals.css

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hex to oklch conversion | Manual color math | culori (parse + formatCss) | Color space conversion has many edge cases (gamut mapping, precision) |
| Google Fonts list/search | Scraping or API calls | google-font-metadata package | Maintained static dataset, no API key needed, includes variable font data |
| Range slider UI | Custom slider from scratch | HTML input[type=range] + number input | Native browser input is accessible and works well; style with Tailwind |
| Color picker | Custom color wheel | HTML input[type=color] + text input | Native picker is accessible and cross-browser; hex text input for precision |

**Key insight:** The native HTML `<input type="color">` and `<input type="range">` elements provide accessible, cross-browser controls that work perfectly in Payload's admin panel. Style them with Tailwind rather than building custom controls from scratch.

## Common Pitfalls

### Pitfall 1: Infinite Hook Loop on Derived Token Update
**What goes wrong:** afterChange hook derives colors and calls updateGlobal, which triggers afterChange again
**Why it happens:** Payload's afterChange fires on every global update
**How to avoid:** Use `req.context.disableRevalidate = true` (or a custom context flag) when updating derivedTokens from within the hook
**Warning signs:** Server hangs or crashes after saving theme settings

### Pitfall 2: next/font/google Cannot Load Dynamic Fonts
**What goes wrong:** Attempting to use `next/font/google` with a CMS-selected font family fails because font loaders must be called at module scope (build time)
**Why it happens:** next/font is designed for static optimization, not dynamic CMS values
**How to avoid:** Use Google Fonts CSS link tags (`<link href="https://fonts.googleapis.com/css2?family=...">`) in the `<head>` for CMS-defined fonts. Keep Geist as the static fallback loaded via the `geist` package.
**Warning signs:** Build errors or font not loading despite correct family name

### Pitfall 3: oklch Values with Wrong Precision
**What goes wrong:** CSS variables have too many decimal places or wrong format, causing browsers to ignore them
**Why it happens:** Raw conversion output may include excessive precision
**How to avoid:** Use culori's `formatCss` which outputs standard CSS oklch() strings, or round to 3-4 decimal places
**Warning signs:** Colors showing as transparent or falling back to defaults

### Pitfall 4: Cache Not Invalidating After Theme Save
**What goes wrong:** Frontend still shows old theme after admin saves new values
**Why it happens:** Next.js caches the `findGlobal` call and doesn't know the theme changed
**How to avoid:** Use `revalidateTag('theme-settings')` in the afterChange hook, and wrap the theme fetch in `unstable_cache` with the `'theme-settings'` tag
**Warning signs:** Theme changes only appear after full rebuild or restart

### Pitfall 5: Spacing Multiplier Disconnected from blockStyles.ts
**What goes wrong:** Theme spacing multiplier changes but block spacing presets don't update
**Why it happens:** blockStyles.ts spacingMap has hardcoded values (`xs: '1', sm: '2'`, etc.)
**How to avoid:** Make blockStyles.ts read from theme tokens or compute spacing via CSS variables rather than hardcoded Tailwind classes. Alternatively, define spacing scale as CSS custom properties that both the spacing map and blocks reference.
**Warning signs:** Changing spacing multiplier in theme has no visible effect on blocks

### Pitfall 6: Google Fonts Preconnect Missing
**What goes wrong:** Fonts load slowly because browser doesn't start DNS/TLS early
**Why it happens:** Missing preconnect link tags for fonts.googleapis.com and fonts.gstatic.com
**How to avoid:** Add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous">` in the `<head>`
**Warning signs:** Noticeable font swap/flash on page load

## Code Examples

### Hex to oklch Conversion with culori
```typescript
// lib/themeUtils.ts
import { parse, formatCss, converter } from 'culori/fn'
import { modeOklch, modeRgb } from 'culori/fn'

// Register only needed color spaces for minimal bundle
import { useMode } from 'culori/fn'
const toOklch = useMode(modeOklch)
const toRgb = useMode(modeRgb)

export function hexToOklch(hex: string): string {
  const color = parse(hex)
  if (!color) return hex // Fallback if parse fails
  const oklch = toOklch(color)
  return formatCss(oklch)
  // Output: "oklch(0.637 0.237 25.331)"
}

export function oklchToHex(oklchStr: string): string {
  const color = parse(oklchStr)
  if (!color) return '#000000'
  const rgb = toRgb(color)
  return formatCss({ ...rgb, mode: 'rgb' })
}
```

### Color Derivation Algorithm (Recommended)
```typescript
// fields/theme/deriveColors.ts
import { parse, formatCss } from 'culori/fn'
import { useMode, modeOklch } from 'culori/fn'

const toOklch = useMode(modeOklch)

// Derive a lighter/darker variant by adjusting L channel
function adjustLightness(hex: string, deltaL: number): string {
  const color = parse(hex)
  if (!color) return hex
  const oklch = toOklch(color)
  oklch.l = Math.max(0, Math.min(1, oklch.l + deltaL))
  return formatCss(oklch)
}

// Derive a desaturated variant by reducing C channel
function desaturate(hex: string, factor: number): string {
  const color = parse(hex)
  if (!color) return hex
  const oklch = toOklch(color)
  oklch.c = oklch.c * factor
  return formatCss(oklch)
}

export function deriveAllColors(core: {
  primary: string
  secondary: string
  accent: string
  muted: string
  destructive: string
  background: string
  foreground: string
}) {
  return {
    // Core colors (convert to oklch)
    '--primary': hexToOklch(core.primary),
    '--primary-foreground': hexToOklch(core.foreground), // Or compute contrast
    '--secondary': hexToOklch(core.secondary),
    '--muted': hexToOklch(core.muted),
    '--accent': hexToOklch(core.accent),
    '--destructive': hexToOklch(core.destructive),
    '--background': hexToOklch(core.background),
    '--foreground': hexToOklch(core.foreground),
    // Derived from background
    '--card': hexToOklch(core.background),
    '--card-foreground': hexToOklch(core.foreground),
    '--popover': hexToOklch(core.background),
    '--popover-foreground': hexToOklch(core.foreground),
    // Derived from secondary/muted
    '--border': desaturate(core.secondary, 0.3),
    '--input': desaturate(core.secondary, 0.3),
    '--ring': adjustLightness(core.primary, 0.2),
    // Sidebar derived from background
    '--sidebar': adjustLightness(core.background, -0.015),
    '--sidebar-foreground': hexToOklch(core.foreground),
    '--sidebar-primary': hexToOklch(core.primary),
    '--sidebar-primary-foreground': hexToOklch(core.foreground),
    '--sidebar-accent': hexToOklch(core.accent),
    '--sidebar-accent-foreground': hexToOklch(core.foreground),
    '--sidebar-border': desaturate(core.secondary, 0.3),
    '--sidebar-ring': adjustLightness(core.primary, 0.2),
    // Chart colors derived from primary with hue rotation
    // ... (rotate hue by increments)
  }
}
```

### Theme Fetch with Cache Tag in layout.tsx
```typescript
// In layout.tsx
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

const getTheme = unstable_cache(
  async () => {
    const payload = await getPayload({ config: configPromise })
    return payload.findGlobal({ slug: 'theme-settings' })
  },
  ['theme-settings'],
  { tags: ['theme-settings'] }
)

export default async function RootLayout({ children }) {
  const theme = await getTheme()
  const cssVars = theme?.derivedTokens
    ? Object.entries(theme.derivedTokens)
        .filter(([, v]) => v != null)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, string>)
    : {}

  return (
    <html style={cssVars} className={cn(GeistSans.variable, GeistMono.variable)} lang="en">
      <head>
        {theme?.fonts?.sans && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link
              rel="stylesheet"
              href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fonts.sans)}&display=swap`}
            />
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  )
}
```

### Global afterChange Revalidation Hook
```typescript
// hooks/revalidateTheme.ts
import type { GlobalAfterChangeHook } from 'payload'
import { revalidateTag } from 'next/cache'

export const revalidateTheme: GlobalAfterChangeHook = async ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc

  // Derive all tokens from core colors
  const derived = deriveAllColors(doc.colors || {})

  // Store derived tokens without triggering another afterChange
  await payload.updateGlobal({
    slug: 'theme-settings',
    data: { derivedTokens: derived },
    context: { disableRevalidate: true },
  })

  payload.logger.info('Revalidating theme-settings cache tag')
  revalidateTag('theme-settings')

  return doc
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| hsl() color values | oklch() values | shadcn/ui v2 + Tailwind v4 (2024) | More perceptually uniform, globals.css already uses oklch |
| tailwind.config.js theme | @theme inline CSS block | Tailwind v4 (2024) | Theme tokens defined in CSS, not JS config |
| next/font static loading | Still static only | Ongoing limitation | Dynamic fonts must use link tags, not next/font |
| unstable_cache | Still unstable_ prefix | Next.js 15+ | Works reliably despite prefix, supports revalidateTag |

**Deprecated/outdated:**
- HSL color format in shadcn/ui: globals.css already migrated to oklch
- Tailwind v3 config-based theming: project uses Tailwind v4 CSS-first approach

## Important Note on Google Fonts Loading

The CONTEXT.md states "Google Fonts loaded via next/font/google for self-hosting and optimization." However, `next/font/google` requires fonts to be specified at build time (module scope). Since the admin selects fonts dynamically, `next/font/google` cannot be used for CMS-defined fonts.

**Recommended approach:** Use Google Fonts CSS link tags for CMS-selected fonts, and keep the existing Geist fonts (loaded via the `geist` package) as the static fallback. The Geist font classes (`GeistSans.variable`, `GeistMono.variable`) remain on `<html>` and serve as the default `--font-sans` and `--font-mono`. When a theme font is selected, override `--font-sans` / `--font-mono` in the inline style to point to the Google Font family name. This provides acceptable performance with proper preconnect hints.

For true self-hosting of dynamic fonts, the system would need to download font files at save time and serve them from the application. This is significantly more complex and should be deferred.

## Open Questions

1. **Foreground color auto-contrast**
   - What we know: Each semantic color needs a foreground (e.g., --primary-foreground for text on --primary backgrounds)
   - What's unclear: Should admin set foregrounds manually, or should they be auto-computed (black/white based on contrast ratio)?
   - Recommendation: Auto-compute foreground as white or black based on WCAG contrast ratio against the background color. Use oklch lightness: L > 0.5 gets dark foreground, L <= 0.5 gets light foreground.

2. **Spacing multiplier integration with blockStyles.ts**
   - What we know: blockStyles.ts has hardcoded `spacingMap` (`xs: '1', sm: '2', md: '4'`, etc.)
   - What's unclear: Should the theme multiplier change Tailwind class numbers or use CSS custom properties?
   - Recommendation: Define spacing scale as CSS custom properties (`--spacing-xs`, `--spacing-sm`, etc.) and have blockStyles.ts output inline styles referencing those vars. This way theme changes propagate without rebuilding Tailwind classes.

3. **Chart color derivation**
   - What we know: globals.css defines 5 chart colors, all in blue-ish oklch range
   - What's unclear: How to derive chart colors from the primary color
   - Recommendation: Rotate hue from primary in 30-degree increments while varying lightness. Store in derivedTokens.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected -- no test infrastructure exists |
| Config file | none -- see Wave 0 |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| THEME-01 | ThemeSettings global exists with correct fields | manual-only | Verify in admin panel | N/A |
| THEME-02 | Color picker, font selector, sliders render and save values | manual-only | Verify in admin panel | N/A |
| THEME-03 | CSS variables appear on html element | manual-only | Inspect page source / devtools | N/A |
| THEME-04 | shadcn/ui components update with theme changes | manual-only | Visual inspection in browser | N/A |

**Manual-only justification:** No test framework is configured in the project. All requirements involve admin UI interaction and visual rendering verification. Setting up a test framework is out of scope for this phase.

### Sampling Rate
- **Per task commit:** Manual verification in admin panel + browser devtools
- **Per wave merge:** Full walkthrough: create theme -> save -> verify frontend CSS vars -> check component rendering
- **Phase gate:** All 4 requirements verified visually

### Wave 0 Gaps
- No test infrastructure exists -- test framework setup is out of scope for this phase
- Manual verification checklist should be documented in plan

## Sources

### Primary (HIGH confidence)
- Project codebase: globals.css (all shadcn/ui CSS variables in oklch), layout.tsx, SiteSettings.ts, payload.config.ts
- Payload CMS docs: [Global Hooks](https://payloadcms.com/docs/hooks/globals) - afterChange hook pattern
- Payload CMS docs: [Custom Components](https://payloadcms.com/docs/admin/components) - admin.components.Field
- Payload CMS docs: [UI Field](https://payloadcms.com/docs/fields/ui) - custom field rendering
- Payload CMS docs: [Live Preview](https://payloadcms.com/docs/live-preview/overview) - global livePreview config

### Secondary (MEDIUM confidence)
- [culori API docs](https://culorijs.org/api/) - oklch conversion, formatCss, tree-shaking guide
- [google-font-metadata npm](https://www.npmjs.com/package/google-font-metadata) - static font list package
- [Next.js font optimization docs](https://nextjs.org/docs/app/getting-started/fonts) - static-only limitation confirmed
- [Next.js dynamic font loading discussion](https://github.com/vercel/next.js/discussions/40345) - link tag workaround

### Tertiary (LOW confidence)
- Color derivation algorithm specifics (lightness adjustment, hue rotation) - based on general color theory, not verified against specific libraries

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - culori is well-documented, Google Fonts link tags are proven, Payload globals pattern matches existing code
- Architecture: HIGH - follows established SiteSettings pattern, CSS variable injection is straightforward
- Pitfalls: HIGH - infinite hook loop and next/font limitation are well-documented issues
- Color derivation: MEDIUM - general approach is sound but exact delta values need tuning during implementation

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable domain, no rapid changes expected)

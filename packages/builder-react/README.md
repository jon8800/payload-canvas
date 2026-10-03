# @payload-toolkit/builder-react

The React side of [`@payload-toolkit/builder`](https://github.com/jon8800/payload-toolkit/tree/main/packages/builder). It renders builder layouts on your site and runs the editor's canvas.

```bash
pnpm add @payload-toolkit/builder @payload-toolkit/builder-react
```

The full setup guide is in the [`@payload-toolkit/builder` README](https://github.com/jon8800/payload-toolkit/tree/main/packages/builder#install).

## Entry points

| Import | Runs on | Holds |
|---|---|---|
| `@payload-toolkit/builder-react` | server and client | `RenderLayout`, `defaultComponents`, link helpers, types |
| `@payload-toolkit/builder-react/server` | server only | `loadLayoutData`, `loadTemplate` (they call Payload's Local API) |
| `@payload-toolkit/builder-react/canvas` | client only | `BuilderCanvas`, the runtime for the editor's iframe |

## Render a layout

```tsx
import type { GeneratedCss } from '@payload-toolkit/builder'
import { normalizeLayout } from '@payload-toolkit/builder/core'
import { RenderLayout } from '@payload-toolkit/builder-react'
import { loadLayoutData } from '@payload-toolkit/builder-react/server'

const layout = await loadLayoutData(normalizeLayout(page.layout), blocks, payload, { draft })
return <RenderLayout layout={layout} blocks={blocks} css={(page.layoutCss as GeneratedCss | null)?.css} />
```

- `RenderLayout` is a Server Component. It renders each block with its component and writes the generated CSS in a `<style>` tag.
- `loadLayoutData` replaces upload and relationship IDs with documents, in one `find` per collection.
- Pass `components` to replace a default block or add your own. Pass `resolveLink` when your routes are not `/<slug>`.

## The canvas route

```tsx
// src/app/(builder-canvas)/builder-canvas/page.tsx
'use client'

import { BuilderCanvas } from '@payload-toolkit/builder-react/canvas'
import { blocks } from '@/builder'

export default function CanvasPage() {
  return <BuilderCanvas blocks={blocks} />
}
```

Give the route its own root layout with `<html>` and `<body>`, without your site header or CSS. `BuilderCanvas` takes the same `blocks`, `components` and `resolveLink` as `RenderLayout`, plus `plugins` (your Tailwind plugins map).

## Block components

Every component receives `{ block, props, className, slots, attributes, slotAttributes, mode }`. Spread `attributes` on the root element: in the canvas it carries `data-block-id`. Props are plain data, so a component can be a client component. See [Custom components](https://github.com/jon8800/payload-toolkit/tree/main/packages/builder#custom-components).

## License

MIT

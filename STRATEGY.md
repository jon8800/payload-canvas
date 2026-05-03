---
name: payload-toolkit
last_updated: 2026-05-04
---

# payload-toolkit Strategy

## Target problem

Every new Payload-based website project costs developers days-to-weeks re-wiring the same plumbing — CMS config, block model, theming, design system glue — before any real design or content work begins. Existing starters force a tradeoff: ship rigid pre-built sections (no flexibility) or ship a thin shell (no theming, no design system, every project rebuilds from zero).

## Our approach

Win on the block model — composable atomic blocks that nest into anything, not a catalog of pre-built sections. Flexibility comes from composition, so the toolkit stays small while the surface area of what you can build stays large; visual styling, theming, and dynamic binding all serve this bet rather than competing with it.

## Who it's for

**Primary:** Freelance developers and small agencies building marketing/content websites for clients (typically 3-10 sites a year). They're hiring payload-toolkit to skip the 1-2 week per-project setup phase, deliver visible work on day one, and hand off an admin that non-technical clients can actually use. The author is one of them — dogfooding is constant.

## Key metrics

- **Setup time per new project** — wall-clock from `create-payload-starter` to first content-bearing page deployed. Tracked by per-project notes. Should trend down or stay flat as feature surface grows.
- **Composability holds up** — per-project tally of how many times a custom block had to be written instead of composed from existing atoms. Should trend toward zero. This is the load-bearing signal for the approach; if it stays high, the atomic-blocks bet isn't paying off.
- **Non-developer admin usage** — qualitative post-handoff check: are clients editing content themselves, or emailing the developer to do it? Captured per-project in a handoff retro.

Vanity metrics (GitHub stars, npm downloads) explicitly not tracked. Open-sourcing is deferred.

## Tracks

### Block system & composition

Atomic blocks, nested composition, JSON storage, the `create-payload-starter` CLI, demo content seeding. Scaffolding/DX folds in here as the delivery mechanism.

_Why it serves the approach:_ this *is* the approach made concrete; everything else exists to make this bet pay off.

### Visual styling & theming

Per-block styles panel, ColorPicker/FontSelector/SliderField primitives, ThemeSettings global, shadcn variable cascade, full Google Fonts catalog.

_Why it serves the approach:_ atomic blocks are only flexible enough if every block can be styled without code; theming makes the result feel like a designed product, not a kit.

### Dynamic content & templates

Templates collection, type-safe field bindings, one-hop nested binding, admin Template preview.

_Why it serves the approach:_ atomic composition has to work for collection-driven pages too — otherwise the bet fails the moment a project has a Posts page.

### Page builder UI (Layout Customizer)

Webflow/Shopify-style 3-pane visual editor — drag-drop, tree view, inline block adding, live preview. Potentially extracted as its own plugin.

_Why it serves the approach:_ raw Payload block UI doesn't sell composability to non-developer editors; the customizer is what makes "atomic + nested" feel approachable instead of overwhelming.

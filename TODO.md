# To do: what the escort-starter rebuild needs from payload-canvas

The escort-starter template (`C:\Projects\personal\escort-starter`) now builds every page with Canvas 0.3.0. Four agents rebuilt 75 sections from four live sites as trees of small blocks. To do that, the site added 19 custom blocks and several workarounds. This file lists what belongs in the plugin, so the next site (Ruby) starts on a better plugin and the starter can delete its workarounds.

Read `AGENTS.md` and `docs/architecture.md` first. The gap numbers (8.x) match part 8 of `C:\Projects\personal\escort-starter\docs\canvas\section-catalogue.md`, which has more detail.

## How to work through this list

- Work on branch `feat/escort-starter-needs` or a branch from it. Do not push. Do not publish to npm: Eugene approves each release.
- For each item, add tests, update `packages/payload-canvas/README.md` and add a `CHANGELOG.md` line under `[Unreleased]`.
- The escort-starter uses the plugin as a vendored tarball (`vendor/payload-canvas-0.3.0.tgz`). To test there, run `pnpm pack` in `packages/payload-canvas`, copy the `.tgz` into the starter's `vendor/`, and update the starter's `package.json`.
- Each item names the starter workaround that it replaces. Remove the workaround in the starter in the same round, and run its checks: `pnpm canvas:index`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Keep blocks unstyled. They take every look from `className`, like the existing blocks. Client components only where the block needs browser state.

## P0: before Ruby starts

### 1. Site classes as presets in the Styles panel

The look of a site lives in `@utility` rules in its CSS entry: `type-h2`, `btn-primary`, `card`, `glass-plate`, `surface-dark` and so on (see the starter's `src/app/(frontend)/globals.css`). Canvas compiles them, so a block can use them. But an editor sees no list of them. They must know the names.

- First check what exists. `getStyleTokens()` returns `classList`, and `admin/editor/styles/RawClasses.tsx` uses it for suggestions. Confirm whether static custom `@utility` names are in that list.
- Then add a "Site classes" group to the Styles panel: the entry's own `@utility` names, separate from Tailwind's thousands, with a small preview.
- Optional label and group from a comment above the rule, for example `/* @canvas Buttons: Primary button */`. Without a comment, show the class name.
- Clicking a preset adds or removes the class on the selected block, like the **Classes** box does.

### 2. Block attributes: id, aria-label, aria-hidden (8.2, 8.29)

No block can carry an `id`, `aria-label` or `aria-hidden`. Payload reserves `id` inside blocks.

- Add `Block.attrs?: { id?: string; ariaLabel?: string; ariaHidden?: boolean }`. Edit them in the inspector's Advanced tab, spread them through `attributes`, and refuse a repeated id in one layout.
- Starter workaround to remove: the `anchor` block (`src/canvas/blocks/anchor/`, prop `anchorId`). Five sections also needed a fix because they set `id` on it. The `icon` block hides itself from screen readers only when it has no label.

### 3. Classes on slots (8.22, 8.23)

Slots render in wrappers that take no classes. That includes the `collectionList` `empty` slot.

- Let a block definition say which slots take classes, and store them as `slotClassName: { [slot]: string }`. Compile them like `className`, and edit them in the Styles panel when a slot is selected.
- Starter workarounds to remove: `[&>summary]:` and `[&>div]:` classes on `disclosure` and `imageSwitcher`, `[&>*:only-child]:col-span-full` on lists, and the extra `stack` around empty-list messages.

### 4. `repeat` without its wrapper div (8.24)

`repeat` puts a `div` around its rows. Grids and lists need the rows as direct children.

- Render the rows with no wrapper, or add an `as` prop that includes `none`. Editor selection must still work.
- Starter workaround to remove: the class `contents` on every repeat (`profileTop`, `profilePhotos`, and others).

### 5. `defineSection` applies `defaultClassName` (8.31)

A block with no `className` in a section tree renders unstyled, even when its definition has a `defaultClassName`.

- `defineSection` (or the insert step) fills `defaultClassName` when the tree gives no `className`.
- Starter workaround to remove: the seed's `toLayout` fills it by hand. The breadcrumbs classes are also copied into every tree.

### 6. Compile class strings in other props (8.30)

Canvas compiles only `className`. A prop such as `carousel.arrowClassName` gets no CSS unless the site's own source has the same class.

- Let a prop declare that it holds classes (for example `admin: { classes: true }` on a text field). The save hook and the canvas compile those values too.
- Starter workaround to remove: the default arrow and dot classes kept in `src` so Tailwind finds them.

### 7. A link can hold custom blocks (8.21)

`link` refuses a custom block such as `icon` as a direct child.

- Let block definitions say that they can go inside a link (for example `inline: true`), or let `link` accept any block that does not render its own link.
- Starter workaround to remove: icons inside links sit in a `stack` (`as: span`), for example in `factLedger`.

### 8. `collectionList`: picked ids in order, random order, pages (8.28, 8.6)

- Add `ids` (a hasMany relationship) that keeps the pick order.
- Add `sort: "$random"` with one seed per cache build, so a rebuild shuffles once.
- Add `paginate`: `none`, or `pages` with crawlable `?page=N` links. Optionally add `loadMore`, which falls back to the links.
- Starter workaround to remove: `modelGridPicked` uses `where: { id: { in: [...] } }` and loses the pick order.

### 9. `field`: format and heading ids (8.25, 8.32)

- Add a `format` prop to `field` that reuses `BINDING_FORMATTERS` (`date`, `currency`, `number`, `firstSentence`).
- Give rich-text headings an `id` from their text, as an option. The `tableOfContents` block (item 13) needs the same ids.
- Starter workarounds to remove: prices and dates are `text` blocks with formatter bindings, and `src/canvas/overrides.tsx` overrides `field` to add heading ids.

### 10. `$visible` comparisons (8.26)

`$visible` only tests filled, empty, equal and not equal.

- Add `>`, `>=`, `<`, `<=` for numbers, and a length test for arrays (`galleryImages#>=3`, or a similar syntax that fits the expression parser).
- Starter workaround to remove: `$visible: "galleryImages.2"` stands for "at least 3 photos".

### 11. `$url` of a document in bindings (8.27)

A list item cannot link to its related document, for example a model card linking to its model type.

- Add a site option `urlOf(collection, doc)` (the starter has `collectionRoutes` in `src/utilities/pagePath.ts`), and a binding `$url` that works on the current doc and on related docs (`categories.0.$url`).
- Starter workaround to remove: cards link to the hub instead.

### 12. Find the `random` prop warning

On the starter's home page, the first load logs a React warning: `random` is not a valid prop on a `<button>`. No file in the starter's `src` sets it. Check whether a plugin block or the animation code passes it through. Fix it if it comes from here.

## P1: built-in blocks most sites need (8.11, 8.14)

The starter built these as custom blocks. They are general, so they belong in `defaultBlocks()`, opt-in where they add client code. The starter's versions are working reference code: `C:\Projects\personal\escort-starter\src\canvas\blocks\<name>\` (`config.ts` and `Component.tsx`).

| # | Block | What it does | Notes |
| --- | --- | --- | --- |
| 13 | `icon` | One icon from a site-provided icon map (`defaultBlocks({ icons })`). Also add `icon` and `iconPosition` to `button`. | The starter's `ICON_NAMES` list type-checks against its icon set. |
| 14 | `carousel` | Scrolls its slot children as slides, with arrows and dots. Client. | Needs item 6 for its arrow and dot classes. |
| 15 | `lightbox` | Opens images in its slot full screen, grouped by `group`. Client. | |
| 16 | `accordion` and `disclosure` | A list of `disclosure` blocks with `summary` and `content` slots. `faqSchema` on the accordion feeds FAQPage JSON-LD. | Needs item 3 for slot classes. |
| 17 | `mediaBackdrop` | An image or video behind its slot content, with a poster and priority loading. | The starter left out the WebGL shader effect. |
| 18 | `tableOfContents` | Links to the h2 headings of a rich-text field. | Needs the heading ids from item 9. |
| 19 | `filterLink` | A link that sets, toggles or clears one URL query value for `collectionList` `queryFilters`. Shows its active state. | Pairs with the 0.3.0 list filters. |

Delete `anchor` from the starter once item 2 lands; do not add it to the plugin.

These stay in the starter, because they hold site rules: `contactLink` (reads `brand.config.ts`), `form` (the hardened form), `breadcrumbs`, `jsonLd`, `documentLayout`, `glossaryTerm`, `letterFilter` and `rating`.

## P2: later

| # | Gap | Change |
| --- | --- | --- |
| 20 | 8.9 | `loadLayoutData` returns the loaded lists (`blockId`, `collection`, `docs`), so a site can emit ItemList JSON-LD without a second query. |
| 21 | 8.12 | `menu` items with one level of children, so headers can move out of code. |
| 22 | 8.13 | Links inside `listItem` text. |
| 23 | 8.15 | `scroll: recede` preset for stacked cards. The starter's `cardStack` uses `scroll: zoom` instead. |
| 24 | 8.16 | A `sectionRef` block that renders a saved section live, with a "detach" action. |
| 25 | 8.17 | `variants` on `SectionDefinition`, so one file holds 2 or 3 versions of a section. |
| 26 | 8.18 | A small where builder in the inspector (field, operator, value) in place of raw JSON. |
| 27 | 8.19 | Cache server block output in the canvas per block id and props, so data blocks do not wait 250 to 1000 ms per edit. |
| 28 | 8.20 | Template `conditions` (a where query), so touring models or VIP types can get their own default layout. |
| 29 | — | `create-payload-canvas` still pins `payload-canvas` `^0.2.0`. Bump it with the next release. |
| 30 | — | Decide whether sites use the Theme global for brand colours and fonts. The starter turns it off (`theme: false`) and keeps them in `brand.config.ts` and its CSS. |

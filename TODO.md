# To do: what the escort-starter rebuild needs from payload-canvas

The escort-starter template (`C:\Projects\personal\escort-starter`) now builds every page with Canvas 0.3.0. Four agents rebuilt 75 sections from four live sites as trees of small blocks. To do that, the site added 19 custom blocks and several workarounds. This file lists what belongs in the plugin, so the next site (Ruby) starts on a better plugin and the starter can delete its workarounds.

Read `AGENTS.md` and `docs/architecture.md` first. The gap numbers (8.x) match part 8 of `C:\Projects\personal\escort-starter\docs\canvas\section-catalogue.md`, which has more detail.

## How to work through this list

- Work on branch `feat/escort-starter-needs` or a branch from it. Do not push. Do not publish to npm: Eugene approves each release.
- For each item, add tests, update `packages/payload-canvas/README.md` and add a `CHANGELOG.md` line under `[Unreleased]`.
- The escort-starter uses the plugin as a vendored tarball (`vendor/payload-canvas-0.3.0.tgz`). To test there, run `pnpm pack` in `packages/payload-canvas`, copy the `.tgz` into the starter's `vendor/`, and update the starter's `package.json`.
- Each item names the starter workaround that it replaces. Remove the workaround in the starter in the same round, and run its checks: `pnpm canvas:index`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Keep blocks unstyled. They take every look from `className`, like the existing blocks. Client components only where the block needs browser state.

## Done (see `[Unreleased]` in `CHANGELOG.md`)

| # | Item | API |
| --- | --- | --- |
| 1 | Site classes in the Styles panel | `StyleTokens.siteClasses`, `/* @canvas Group: Label */` comments, a **Site classes** group |
| 2 | Block attributes | `block.attrs` `{ id, ariaLabel, ariaHidden }`, the **Advanced** tab, unique ids per layout |
| 3 | Classes on slots | slot `styles: true`, `block.slotClassName`, the **Style target** select |
| 4 | `repeat` without a wrapper | `repeat` `as: 'none'` |
| 5 | Sections get `defaultClassName` | automatic in `websiteBuilder` and `builderMcpTools`; `withDefaultClassNames()` for seeds |
| 6 | Classes in other props | `admin.custom.builderClasses: true` on a text field; `classFields` |
| 7 | Custom blocks inside a link | definition `inline: true`, slot `allowInline: true` |
| 8 | `collectionList` picks, random order, pages | `ids`, `sort: '$random'` (`randomSeed`), `paginate: 'pages'` |
| 9 | `field` format and heading ids | `field` `format`; `headingIds: true` on `field` and `richText` |
| 10 | `$visible` comparisons | `field>3`, `>=`, `<`, `<=`, `field#>=3` |
| 11 | `$url` of a related document | `<path>.$url` from `resolveLink`; `bindingRelations()` as `relations` |
| 12 | The `random` prop warning | Not from the plugin. No plugin block or motion code passes `random`. |
| 13 to 19 | Built-in blocks | `builtinBlocks({ include, icons, mediaCollection })` and `builtinComponents({ icons })`: `icon`, `carousel`, `lightbox`, `accordion` and `disclosure` (`faqItems`, `faqJsonLd`), `mediaBackdrop`, `tableOfContents`, `filterLink` (`filterHref`). Button icons: `defaultBlocks({ icons })` adds `icon`, `iconPosition` and `iconClassName` to `button` |
| 29 | `create-payload-canvas` version | installs `payload-canvas` `^0.3.0` |

Delete `anchor` from the starter now that item 2 is done; it is not in the plugin. These stay in the starter, because they hold site rules: `contactLink`, `form`, `breadcrumbs`, `jsonLd`, `documentLayout`, `glossaryTerm`, `letterFilter` and `rating`.

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
| 30 | — | Decide whether sites use the Theme global for brand colours and fonts. The starter turns it off (`theme: false`) and keeps them in `brand.config.ts` and its CSS. |

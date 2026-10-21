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
| 20 | Loaded lists for ItemList JSON-LD | `loadedLists(layout)` after `loadLayoutData`: `{ blockId, collection, docs }[]`, no second query |
| 21 | Menu dropdowns | `menu.items[].children` (one level), `<details>` dropdowns, `submenuLabel`, `MENU_CLASS_MAP.submenu*` |
| 22 | Links in list items | `listItem` `link` (one link per item). Links inside the text are not built: see the changelog |
| 23 | `scroll: recede` | `motion.scroll = { preset: 'recede', scale? }`, CSS view timeline with Motion's fallback |
| 25 | Section variants | `SectionDefinition.variants`; each shows as a section `hero/split` (`sectionsWithVariants()`) |
| 26 | Where builder | condition rows for `collectionList.where`, **Edit as JSON**; `admin.custom.builderWhere` on any JSON field. `queryFilters` stays JSON |
| 27 | Server block cache | the canvas cache existed (per scope and block JSON, 200 entries); its key now ignores `motion`, and `refresh()` runs after document saves. Limit: data changed outside the editor shows after a reload |
| 28 | Template conditions | `conditions` (a where query) on templates: the document's own template, then the first matching template by name, then the default |
| 29 | `create-payload-canvas` version | installs `payload-canvas` `^0.3.0` |

Delete `anchor` from the starter now that item 2 is done; it is not in the plugin. These stay in the starter, because they hold site rules: `contactLink`, `form`, `breadcrumbs`, `jsonLd`, `documentLayout`, `glossaryTerm`, `letterFilter` and `rating`.

## Open

More work from the same night is in `[Unreleased]` too: button icons, control labels, lightbox swipe, and pager gaps with a `pageParam` per list.

| # | Gap | Change |
| --- | --- | --- |
| 24 | 8.16 | A `sectionRef` block that renders a saved section live, with a "detach" action. |
| 30 | — | Decide whether sites use the Theme global for brand colours and fonts. The starter turns it off (`theme: false`) and keeps them in `brand.config.ts` and its CSS. |

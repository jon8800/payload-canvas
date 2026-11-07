# Changelog

All notable changes to `payload-canvas` and `create-payload-canvas`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The packages use [semantic versioning](https://semver.org/). Before 1.0, a minor version can break the API.

## [Unreleased]

Everything since 0.2.0. The 0.2.1, 0.2.2 and 0.3.0 version numbers were set in git but never published to npm; their changes are listed here in their final form.

### Added

- **Comments on the canvas**, like Figma and Webflow comments. Press **C** (or the speech bubble in the top bar) for comment mode, click a block to place a pin and write a comment. Threads have replies, resolve and reopen, and edit and delete for their author. Pins follow their block through scrolling, layout changes and zoom. The comments panel lists open threads first, then resolved ones, with a filter; a click selects the block and scrolls to it. Threads on a deleted block stay, marked "Block deleted". The top bar button shows the number of open threads. Other editors see changes at once (a `comments` event on the live channel). Stored in the new `builder-comments` collection, never in the layout: no effect on undo, saves or publishing. On by default; `comments: false` turns it off. People who may change a page may comment on it; only authors edit or delete their comments. Mentions and email notifications are not included yet.
- **Class manager**: **Manage classes…** in the Styles panel's Classes menu lists every shared class with search, a usage count and the pages that use it (links open them in the builder). Each row has Rename, Duplicate and Delete. **Remove unused classes** deletes every class no draft, open session or published page uses (`POST /api/builder/classes/remove-unused`, `unusedClasses`, `removeUnusedClasses`). Rename and delete change open builder sessions without losing their unsaved edits.
- **Design variables** in the Theme global: named colors, sizes and fonts (`bg-brand`, `p-gutter`, `font-display`), each with an optional dark-mode value under the `.dark` class. `ThemeStyle` writes them as CSS variables; both Tailwind compiles register them, so they work in blocks, editable classes and on the canvas. The Styles panel lists them first in the color picker and the size suggestions. Renaming or deleting a variable in use shows a warning with the pages and classes that use it. The AI assistant, the MCP `listBlocks` tool and `GET /api/builder/style-tokens` list the variables.
- **Components with properties**, like Webflow's components. In a saved section, the ◆ button next to a text, rich text, image or link field makes it a property; the **Visible** row makes one that shows or hides a block. Components show in the library under **Saved** with a ◆ mark and go in as copies that stay in sync (`sectionRef`). Each copy sets its own values in the inspector; empty ones show the component's content. **Edit component** opens the component, and the inspector says how many places use it. **Detach section** keeps the copy's values. Properties are `$component.<name>` bindings in the section, so no schema change; copies store `props.values`. Components inside components work up to 5 levels; a component that would contain itself is refused. MCP and the assistant: `listSections` lists properties, `insertSection` takes `values` and `linked`. Core: `componentProperties`, `applyComponentValues`, `checkComponentValues`. `GET {api}/builder-sections/:id/used-in` counts the places that use a saved section.
- **Content mode for clients**, like Webflow's Editor: `websiteBuilder({ editor: { canEditDesign: ({ req, user }) => boolean } })`. Users for whom it returns false change text, images and links only; the editor hides adding, moving and deleting blocks, styles, motion, classes, variants, visibility, bindings and regions, and shows **Content mode** in the top bar. Designers get **Preview as client**. Props count as content by field type; `admin.custom.builderContent` overrides it. **Editors can add, remove and reorder its items** (`block.editableItems`) lets clients duplicate, delete and reorder a list's items. The live session, the save hook, the MCP tools and the AI assistant refuse design changes with a 403 (`core/contentMode.ts`); the editable classes collection and the theme global refuse writes from them. The starter adds a user **Role** (Admin, Editor).
- **Editable classes**, like Webflow's class system. Editable classes are stored in the `builder-classes` collection (drafts, versions, autosave; `classes: false` turns it off). Pick a class chip in the Styles panel and every control edits the class instead of the block, so one change restyles every block that uses it; a banner shows how many blocks and pages that is. Each class has Tailwind `styles` (with breakpoints and states) and optional custom CSS. Import the site's code `@utility` classes in one click, or make a class from a block's current styles. Rename and delete update or protect every layout that uses the class. Published classes compile into one hashed stylesheet served with immutable caching (`<ClassesStyle>` from `payload-canvas/react/server`). MCP tools `listClasses`, `getClass`, `upsertClass` and `deleteClass`.
- **Built-in blocks**, opt-in: `builtinBlocks({ include, icons })` in `payload-canvas/blocks` and `builtinComponents({ icons, labels })` in `payload-canvas/react`. Each has its own icon, category and AI description. The interactive ones load their JavaScript only on pages that render them.
  - **Icon** (`icon`): one icon of the site's icon set, by name. Decorative unless it has a label. It may go inside a link.
  - **Disclosure** and **Accordion** (`disclosure`, `accordion`): native `<details>` with `summary` and `content` slots and a CSS height animation; the accordion can keep one item open at a time. **Mark up as FAQ for search engines** (`faqSchema`, off by default) adds the accordion to `faqItems()` / `faqJsonLd()` for FAQPage JSON-LD.
  - **Popup** (`popup`): a button (the `trigger` slot) that opens the `content` slot in a native modal `<dialog>`. Parts `panel` and `close`. With `anchor`, links to `#<anchor>` on the page open it too. For a photo that opens large, put a small image in the trigger and the large one in the content.
  - **Tabs** (`tabs` with `tab` children): WAI-ARIA tabs with arrow keys, Home and End. Parts `list`, `tab` and `panel`; the open tab has `aria-selected="true"`, so `aria-selected:` classes style it. A new tabs block starts with 2 tabs.
  - **Carousel** (`carousel`), on [Embla Carousel](https://www.embla-carousel.com/): swipe, drag, arrows (optional `previous`/`next` slots for their content), dots, arrow keys, `loop`, `align` (**Slide position**: start or center), `fade` mode and autoplay with a pause button. Autoplay pauses on hover and focus and never runs with reduced motion. One dot per stop, so fewer dots than slides when several slides show at once. Set the slide width on each slide, for example `basis-full md:basis-1/2`.
  - **Marquee** (`marquee`): a row of logos or words that scrolls without end, in CSS only (a server component). `speed` (slow, normal, fast), `direction` and `pauseOnHover`. It stands still with reduced motion and on the canvas.
  - **Table of contents** (`tableOfContents`): links to the H2 headings of a bound rich text field.
  - **Filter link** (`filterLink`): sets, toggles or clears one URL query value for collection list URL filters, and drops the page number. `filterHref()` is the same rule as a pure function.
  - **Previous / next** (`adjacentLinks`): a `<nav>` with a `previous` and a `next` slot. Each holds one collection list whose `where` uses `$page.publishedAt` to find the document before or after the page. A side without a document renders nothing on the site.
  - **Embed** (`embed`): custom HTML. `mode`: `inline` (default) puts the HTML in the page and runs its scripts; `isolated` shows it in a sandboxed frame. `title` names the frame for screen readers. The code is at most 50,000 characters (`maxLength`). The canvas never runs the code: it shows it in a frame with scripts off, or a "Custom code" box. Off unless you pass `builtinBlocks({ embed: {} })` or include `'embed'`. `embed: { canEdit }` (a Payload field access function) limits who may change the code and the mode; by default everyone who may edit the document can.
  - **Saved section** (`sectionRef`): shows a saved section's current blocks live, with **Detach section** in the block menu. The plugin adds it when saved sections are on.
- **`BlockDefinition.description`**: one short plain sentence for editors. The block library shows it as the tooltip. The default blocks have one.
- **Canvas interaction API** in `payload-canvas/react`, for interactive blocks of your own: `useCanvasReveal(ref, onReveal)`, `REVEAL_EVENT` (`'builder:reveal'`) and `CANVAS_CONTROL_ATTRIBUTE` (`'data-builder-control'`). When an editor selects a block, the canvas opens the closed `<details>` around it, sends the reveal event from its element, and then scrolls to it. A click on an element with `data-builder-control` works as on the site and selects nothing.
- **`websiteBuilder({ editor: { openInBuilder: true } })`**: opening a saved document goes straight to the builder. The form stays for new documents, drawers, users who cannot save, trashed documents and `?form=1`. Run `pnpm generate:importmap` after you turn it on.
- A slot's `min` sets how many children a new block starts with (`starterSlots`).
- **Repeat** block (`repeat`): repeats its `item` slot per row of an array or hasMany field of the current document (`path`, `limit`, `offset`, `collection`; `as: 'none'` renders the rows without a wrapper). Works in templates, inside collection list items and inside other repeats.
- **Visibility conditions** on any block (`block.visibility`: `{ match?: 'any', conditions: [{ field, operator, value? | valueField?, count? }] }`, with `{ all: [...] }` groups). Edited as condition rows in the inspector's Content tab. A hidden block renders nothing on the site and shows dimmed on the canvas; lists inside it do not query.
- **Condition rows** for every query in the editor (collection list `where`, visibility, template conditions): field, operator and value in plain words ("is", "is any of", "has at least … items"), typed inputs (a select's options, dates, numbers, Payload's relationship picker), "or" groups, and value sources: a fixed value, a relative date (`$now-30d`), a URL parameter (`$query.<param>`) or a field of the page (`$page.<path>`). **Edit as JSON** keeps anything the rows cannot show.
- **Bindings:** item bindings `$item`, `$index`, `$parent.<path>` and `$page.<path>` in lists and repeats; fallback chains (`heading|name`); formatters (`date`, `number`, `currency`, `truncate`, `uppercase`, `lowercase`, `readingTime` for "5 min read"), picked from a **Format** select in the binding UI; template strings (`"Read {{title}}"`); `<path>.$url`, the page URL of a related document, with the relationship map read from the Payload config.
- **Collection list:** picked documents in pick order (`ids`), random order (`sort: '$random'`), page links (`paginate: 'pages'`, `pageParam`, `pagerLabel`, gaps like `1 … 4 5 6 … 20`), URL filters (`queryFilters`, shorthand `{ param: 'field' }`, edited as rows), date tokens, `offset`, `depth`, an `empty` slot, and filters by the current document (`filterField`, `filterBy`). `loadedLists(layout)` reads the loaded documents for ItemList JSON-LD.
- **Template conditions and priority:** a template can match documents by a condition (edited as rows) and has a `priority`. Order: the document's own template, then the matching template with the highest priority (equal: the older one), then the default template. No extra query when no template has conditions.
- **Section variants:** `SectionDefinition.variants` holds 2 or 3 versions of a section. The library shows one card with ‹ › arrows; an inserted section remembers its origin (`block.section`) and switches to another version in place from the canvas action bar, as one undo step, keeping the text and images you changed. `listSections` lists variants under their section; `insertSection` takes `variant`.
- **Parts:** `BlockDefinition.parts` names inner elements that take their own classes (carousel arrows and dots, menu links and dropdowns, the collection list's pager). Slots with `styles: true` are parts too. The Styles tab's **Style target** select lists them; classes are stored in `block.partClassName`.
- **Site classes in the Classes box:** the site's own `@utility` classes come first in the suggestions, with labels from a `/* @canvas Group: Label */` comment.
- **Drop outlines:** while you drag, a faint dashed outline marks every slot that can take the block. Turn them off in the drag menu, or set the default with `editor.dropOutlines`.
- **HTML attributes** on blocks (`block.attrs`: `id`, `ariaLabel`, `ariaHidden`), in the inspector's **Advanced** tab. Ids stay unique in a layout.
- **AI settings:** a global where admins paste API keys for the assistant and image generation. Keys are encrypted with the Payload secret, never returned by the API, and win over the keys in code or env. `ai.settings: false` turns it off.
- **`useCanvasMode()`** in `payload-canvas/react`: `'site'`, `'canvas'` or `'thumbnail'`, so a heavy block (WebGL, video) can pause in the editor or show a still image in thumbnails. Server-rendered canvas blocks get `canvasMode`.
- **Menu dropdowns:** one level of `children` per menu item, as native `<details>` dropdowns with keyboard support.
- `listItem` `link`, `image` `priority` and `sizes`, `heading` `accent`, more stack tags (`ol`, `ul`, `li`, `dl`, `dt`, `dd`, `figure`, `figcaption`), rich text heading ids (for `#anchor` links), the `recede` scroll effect for stacked cards, and inline blocks inside links (`inline: true`).
- `RenderLayout` `linkComponent` (pass `next/link` for client navigation and prefetch) and `priorityImages` (the first image of the first section loads first by default). `lazyBlock` for your own lazily loaded blocks.
- `defineSection()` fills missing block ids; new blocks and sections get their type's `defaultClassName`.
- **`addClassName` and `removeClassName` on `update` operations:** space-separated classes to add or remove, so an agent no longer copies the whole class list. `className` still replaces the list. Undo restores the exact old string. The MCP tools and the in-editor assistant take them.
- **FAQ markup without code:** `RenderLayout` outputs one FAQPage `<script type="application/ld+json">` on the site when an accordion has `faqSchema` on (not on the canvas). `faqJsonLd={false}` turns it off. A site that already outputs `faqJsonLd(faqItems(...))` itself should remove that call or pass `faqJsonLd={false}`.
- **MCP results say more:** `applyOperations` returns `changes` (id, type, changed keys, and the new class list after class changes) and only the warnings of the blocks it touched, plus a count of the others. `insertSection` returns `needsContent`: blocks whose image, form or other upload or relationship is still empty, with a hint that points to `generateImage`, `uploadMedia` and `findDocument`. `upsertClass` without `publish` and `deleteClass` list the published pages that still show the old version (`publishedPagesWithOldVersion`).
- **"no-effect" warnings:** `visibility` and `bindings` on a normal page (outside templates and list or repeat items) do nothing. `applyOperations`, `insertSection` and `validateLayout` now warn about them instead of staying silent. New `LayoutErrorCode` `no-effect`, never blocking.
- **Starter admin** (`apps/starter/src/admin/`), plain code in the starter, not in the plugin:
  - **Sidebar:** a Dashboard link, then the collections and globals in groups (Site, Content, Design, Settings) with an icon each. Groups and icons are in `src/admin/nav/config.ts`. Collapse, the mobile menu, logout and the plugins' nav slots work as in Payload's sidebar.
  - **Admin look:** a neutral gray palette in light and dark mode, rounder corners, list views with hairline rows, quieter inputs and labels. It only sets Payload's CSS variables and a few rules in Payload's CSS layer, so the builder editor follows along.
  - **Dashboard widgets** on Payload's modular dashboard: Quick actions (edit the home page in the builder, new page, new post, upload media, view site), Recent edits, Waiting to publish, Form messages, Site checks (pages and posts without an SEO title or description, images without alt text; each count opens the filtered list), Scheduled (publish and unpublish jobs) and Analytics (Plausible or Umami, on the dashboard only when its variables are set in `.env`). Each user can still move, resize, add and remove widgets with **Edit dashboard**.
- **`create-payload-canvas` feature choices:** the CLI asks which starter features to keep (admin look, sidebar, dashboard widgets, demo content, AI assistant), or takes `--no-look`, `--no-nav`, `--no-dashboard`, `--no-demo` and `--no-ai`. It deletes the left-out files and removes their marked lines (`@feature:<id>` … `@end:<id>`) from the config, the admin CSS, `.env.example` and the import map. `--yes` keeps everything. `pnpm check:features` type-checks the starter with every mix of features.

### Changed

- **Popup on the canvas**: an open popup now shows as on the site, centred over the page with its backdrop, instead of in place under its trigger. It stays editable: hover, selection and the "+" reach only the blocks in the box. Escape, a click on the backdrop and selecting a block outside it close it. The canvas measurement has `layers` for this, and `deepestBlockAt`, `canvasDropTarget` and the insert spots use `reachableAt`.
- **Softer motion in the built-ins**: the panel of a new tabs block fades in (150 ms, `starting:opacity-0` on the `panel` part), a new popup's box fades and grows in (150 ms), and a disclosure's content now fades as it opens, in 200 ms instead of 300 ms. None of it runs with reduced motion. A page's site CSS gets the disclosure fade at its next save.
- The inspector opens on the **Styles** tab and remembers the tab you chose. A block that was just added opens on its content.
- **Inspector text.** Field help is shorter; the technical syntax moved to the AI text. The inspector shows a field's `admin.placeholder`. The tag selects of stack, heading and repeat are named **Tag** and list plain tag names (stored values do not change).
- **Collection list inspector.** **Sort** is a field select with a direction ("Newest first", "A to Z") and **Random order**. **Related to this page** is one select instead of the `filterField` text and the `filterBy` select. The fields show under the headings Filter, Sort and count, and Pages. The stored props do not change. New field markers for your own blocks: `admin.custom.builderSort`, `builderRelated` and `builderHeading`.
- **Visibility** is now **Show only when**. Its field is a select of the fields of the block's document (or the collection's fields from the Payload config).
- **Styles tab: one Classes field.** Editable classes are solid chips: click one to edit that class. Other classes that no control shows are quiet monospace chips. An input with suggestions adds classes. The "⋯" menu has **New class from these styles…**, **Import from the site's CSS** and **Edit as text**. The separate "Other classes" section is gone. A line says what the controls edit: "Editing this block at …" or "Editing .card at …".
- **Hide on the site** moved to the inspector's **Advanced** tab as **Hide at all screen sizes**. To hide a block at some sizes only, use Styles → Layout → Display → Hidden at a breakpoint.
- **Accordions and disclosures on the canvas** start open or closed as on the site. A click on a title opens or closes the item, a double-click edits the title, and selecting a block inside opens it.
- **The "+" between blocks** does not show next to blocks that are smaller than 48 px along the list and 160 px across (at 100 % zoom), and never covers more than 20 % of a block; it moves to the parent instead. It also hides over canvas controls. Block outlines are clipped to containers that hide their overflow (a carousel's viewport).
- The condition rows, array rows and URL filter rows share one quiet **Add** button style.
- The layout field on the edit form shows "N sections · M blocks", an **Open builder** button and the section list. The builder's menu item **Open in edit view** is now **All fields**.
- `create-payload-canvas` runs the starter's `seed:classes` when it does not seed the demo, so the library sections have their classes.
- Interactive blocks load their JavaScript only on pages that render them, and client components no longer ship block definitions or AI text.
- `slotAttributes` is now `partAttributes` (`slotAttributes` still works, deprecated).
- New projects created by `create-payload-canvas` install `payload-canvas` `^0.3.0`.
- **Smaller MCP tool list:** the builder tools' descriptions in `tools/list` shrank from 43 KB to 27 KB (the whole list in the starter: 60 KB to 44 KB). The layout guide is now in the `listBlocks` result (`guide`) instead of in the `listBlocks` and `applyOperations` descriptions, the bindings guide in the `getBindingSources` result, and the classes guide in the `listClasses` result. `visibility` in the tool schemas is a loose object; the operations still check it and return the exact error.
- The MCP `collection` argument may be left out when it has one possible value: the class tools, `generateImage`, `listTemplates`, and every builder tool when there is one builder collection.

### Removed

- **Breaking:** the default blocks `spacer` and `quote`. Use gap and padding classes instead of a spacer. Use the rich text quote format, or a `stack` with `as: 'figure'`, instead of a quote. Stored `spacer` and `quote` blocks render nothing on the site, and the canvas shows "Unknown block: spacer". A layout that still holds one fails validation, so it cannot be saved until an editor deletes those blocks.

### Fixed

- New projects from `create-payload-canvas` now get `scripts/lib/classes.ts`, so `seed:demo` and `seed:classes` work there. The CLI left out all of `scripts/lib` before.
- `pnpm build` of `payload-canvas` no longer stops at a code example in a comment (`lazyBlock`) that looked like a relative import.
- In a narrow builder top bar, the save state text truncates instead of running under the buttons next to it.
- The canvas now shows live saved sections (`sectionRef`) when the app's own block list has no `sectionRef` definition: the editor tells the canvas the saved sections collection.
- The Sections tab gives each thumbnail a fixed 2:1 box, so the cards no longer jump while pictures load, and variant cards keep their height.
- A carousel with one hand-made slide no longer splits it into several slides.
- A collection list's pager no longer becomes a grid cell.
- On the canvas, a paged list that leaves out the current document no longer shifts its page boundaries.
- A list filtered by the current document shows nothing on a page without one.
- A top-level `$page` binding in a template no longer shows as broken.
- Payload's default 50/50 focal point no longer overrides an image's position classes.

## [0.2.0] - 2026-10-16

### Added

- One source of truth for existing Payload blocks: when a collection's builder `field` is its own Payload `blocks` field, the builder edits that field itself. Canvas, Payload's editor, REST and the Local API read and write the same value, with Payload's hooks, validation, access, versions and locales. No second copy, no migration, no per-document switch. The round trip keeps every stored value. Data the field cannot hold (classes, animations, bindings, hidden blocks, other block types) is refused with a reason. See the README's "Using existing Payload blocks".
- `decodePayloadBlocks`, `encodePayloadBlocks`, `payloadBlocksProblems` and `payloadBlocksStorage` in `payload-canvas`.
- With a Payload blocks field, what Payload's hooks store shows in the builder after each save, and every live endpoint and MCP tool checks read access to the stored blocks and update access to the field.

- Whole-page editing with page regions: the collection option `regions` names document fields that the page shows outside the layout. The canvas shows the whole page through the app's page frame (`createCanvasServer({ frame })`, `siteRegion`, `LayoutOutlet`), and editors select a region, edit its text and images in place, and edit every field in the settings drawer at that field. Changes save to the document as the user, with field access, conflict checks, drafts, undo and redo. Regions are never dragged, duplicated or deleted. Sites without regions see no change.
- `GET {api}/builder/live/:collection/:id/regions` and `POST {api}/builder/live/:collection/:id/fields` (only for collections with regions).
- `saved` events list the other fields a save changed (`fields`).

### Changed

- New projects created by `create-payload-canvas` install `payload-canvas` 0.2.x.
- Builder collections disable bulk editing and reject bulk updates (`where`) with 403 or 409. Update each document by ID so every save uses the write gate. This also prevents bulk publish, unpublish, trash changes and folder moves. Use the document's Edit view for those actions. Payload's bulk update reads documents before their individual save hooks, which could overwrite concurrent edits.
- Custom implementations of the exported `SessionManager` interface must implement `currentDoc`, `withCurrentDoc` and `resetFor`. Live document ids now accept `string | number`; `sessionTargetOf` still supports callers that supply only `collections`.

- `migrateBlocksField` is now only for sites that want builder-only features (classes, animations, bindings, templates): the README no longer tells sites to copy their blocks to edit them in the builder.

- The canvas route is a server page that imports the canvas server action and passes it to a small client component with `BuilderCanvas` (README, Install step 6). A `'use client'` page that imports the action leaves the client components of server-rendered blocks out of the route's client manifest in an installed package.

### Fixed

- Native Payload version restores update an open builder after the transaction commits. Revert and restore require access to the full source layout.
- Failed builder restores and Revert keep the previous saved or unsaved state. A refused action on a saved page creates no draft. Nested template saves keep each document's save sequence and hook changes separate.
- Flush waits for a committed save's field-hook changes to reach the live session. Until then, other guarded JSON saves return 409 instead of overwriting those changes. Background saves resume after the changes apply.
- Restore and Revert pause background saves and layout sync through their save or rollback. Concurrent actions run in order, and flush waits for the action. Other JSON document saves during the action return 409 and can be retried after it finishes. Committed outside edits survive failed actions. Pending outside sync retries after read failures and discards reads older than a newer outside save.
- Live streams check every intermediate edit with its original block ancestors and sibling values. Protected values cannot escape in a batch that later removes them. Published-only readers cannot receive live drafts.
- Live draft access is checked before each streamed event in both storage modes, including unsaved edits. Access checks use the document's current fields after every committed save, including saves that leave the layout unchanged. Failed refreshes refuse access.
- Publish and unpublish stop when saving pending edits fails. A queued save no longer creates an identical draft after publication. Startup updates inside `onInit` release the write gate correctly.
- The write gate installs database signals and tracks failed Local API calls during adapter initialization, before `onInit` or data migrations. Repeated updates with separate requests in one transaction share that transaction's gate.
- Region undo records pending edits before saving, orders undo and redo requests, preserves retryable history, and restores a missing translation without copying its fallback. Reconnecting reloads region fields.
- Re-entering region text before its saved frame arrives uses the latest edit. Queued image changes use the preceding save as their base. Undo and redo buttons work while a field save runs, and retryable undo survives a newer edit.
- Escape in drawer popups preserves the focus trap, including portalled row menus. Open drawers renew their protection; abandoned holders expire after Payload's lock duration.
- Page frames keep fallback content during retries, follow delayed layout outlets, select visible region copies, and discard stale renders after inline edits.

- Closing the builder's settings drawer right after an edit no longer loses it. Its Close button and Escape closed the form before autosave ran. With draft autosave, the drawer now saves the edit first, through the form's own autosave request (access, hooks, the write gate and the stale-form checks apply; it never publishes), and closes when that worked. A refused save keeps the drawer open with the input and the errors. Escape inside an open select menu, listbox, menu, dialog or popup in the drawer closes only that popup: Payload's modal provider closes the topmost modal on every Escape that reaches the document, so the drawer sends that Escape to the popup alone. Without autosave nothing changes: "Save draft" and Payload's "Leave without saving?" stay as they are.
- The Layers count groups digits in the browser's locale ("1,001 blocks").

- Payload blocks field: copied rows from another page or a saved section get new ids. A page keeps its own row ids through remove, save, undo and save. Duplicates within a page also get new ids.
- Payload blocks field: a cleared prop, a cleared block name and a value removed inside an array row are cleared in Payload too, instead of coming back from the stored value.
- Payload blocks field: named tabs enforce their read access, and unnamed groups preserve field clearing and copied row-id protection.
- Labels in the builder's settings drawer point at their inputs again. Payload names drawer labels with the edit depth (`field-title-2`) while several of its inputs keep `field-title`. Selects and relationships (react-select inputs) there get their field's label as their name, as in the inspector.
- A publish problem of a document field goes away when that field is saved (settings drawer, page region, rename). Problems of other fields and of blocks stay until the next publish checks them.

- Overlapping saves of one builder document no longer lose a change: a session save and a settings drawer autosave run one after the other (the write gate). A save that cannot get its turn fails with a 409 instead. `saved` events go out after the database committed the save, never after a rollback or a failed commit.
- Live endpoints pass the document id in the collection's id type (Payload's `parseDocumentID`), so Publish and the other actions work on databases with number ids. Collections with text ids keep text.

## [0.1.1] - 2026-10-09

- The npm READMEs show the drag-and-drop GIF and screenshots.

## [0.1.0] - 2026-10-06

First public release as two packages: `payload-canvas` (the plugin, the admin editor and the React renderer in one package) and the CLI `create-payload-canvas`.

### Plugin and admin editor (`payload-canvas`)

- `websiteBuilder()` Payload plugin. For every collection you list, it adds a layout JSON field, a hidden generated-CSS field, a hidden `builderRefs` field and a **Builder** document tab. Payload keeps save, drafts, autosave, versions, access control and the document lock for the other fields.
- Full-screen builder view at `/admin/builder/<collection>/<id>` with one top bar: title rename, status, save state, undo and redo, canvas widths, preview, a page settings drawer, **Publish changes**, unpublish, revert to published, versions and restore.
- Editor: Layers, Blocks and Sections tabs, a canvas iframe with zoom and resizable width, drag and drop on the canvas and in the layers tree (a drop line or a smooth mode), a "+" between blocks with an insert picker, copy and paste, context menus, keyboard shortcuts, resizable panels.
- Inspector built from Payload's own inputs: text, rich text (Lexical), uploads, relationships, arrays, selects. Block props run Payload's `validate`, field hooks and field `access`.
- Inline editing on the canvas: text, textarea and rich text props, and images (replace from the library, upload, drop a file, alt text), in the default blocks and in your own components. `editableText()` and `editableImage()` mark elements that the automatic mapping cannot find.
- Styles panel: visual controls for layout, spacing, size, position, typography, background, border and effects that read and write Tailwind v4 classes, with breakpoints, states and a class box with autocomplete.
- CSS generation: the save hook compiles only the classes a layout uses, against the app's own Tailwind entry and plugins. The canvas compiles the same input in the browser. The generated rules match only block elements (`builder-css`).
- 16 default blocks with unlimited nesting: stack, grid, heading, text, rich text, image, video, button, link, menu, list, quote, divider, spacer, collection list and field. `defineBlock()` and `linkField()` for custom blocks, with icons, categories, slot rules and component classes.
- Existing Payload blocks: `fromPayloadBlocks()`, `convertPayloadBlocksLayout()` and `migrateBlocksField()` move a Payload `blocks` field into the builder.
- Theme global: colors, fonts (any Google Font, with metric-matched fallbacks), corner radius and spacing, written as CSS variables.
- Sections: ready-made block trees in the library, sections that editors save (`builder-sections` collection), and real thumbnails.
- Templates for collection documents: a templates collection, bindings from block props to document fields (one relationship hop), the Field block and the Collection list block.
- Animations per block (`block.motion`): entrance with stagger, hover, press, scroll and loop, with a Motion tab and preview.
- Localization: one shared layout with translated props, a locale switcher and translation marks.
- References: "Used in" join fields on media and delete protection for files that a layout still uses. `backfillReferences()` fills the field for existing documents.
- Multiplayer: one live session per document over Server-Sent Events, with presence and live edits from people and AI agents. Sessions live in one server process.
- AI assistant panel with adapters for OpenRouter, Cloudflare AI Gateway, Cloudflare Workers AI, OpenAI-compatible servers and Anthropic, plus a fake adapter for tests. Image generation with separate image adapters.
- MCP tools for `payload-mcp-toolkit` (`builderMcpTools()`): list blocks and sections, read and validate layouts, apply operations, insert sections, generate images, preview URLs, templates and binding sources.
- Layout validation against schemas built from the block fields. Broken layouts block every save. Unfinished blocks block only publishing.
- Tested core: layout operations with inverse operations, tree helpers, drop targets, class parsing.

### React renderer (`payload-canvas/react`)

- `RenderLayout` Server Component and the default block components.
- `payload-canvas/react/server`: `loadLayoutData`, `loadTemplate`, `loadTheme`, `ThemeStyle` and `createCanvasServer` (server components in the canvas).
- `payload-canvas/react/canvas`: `BuilderCanvas`, the runtime for the editor's canvas iframe, with inline text and image editing.
- `fromPayloadComponent(s)` to reuse existing block components, link resolution for link groups and rich text links, and the animation runtime on `motion` (loaded only on pages with animations).

### create-payload-canvas

- Scaffolds the starter app: copies it from a checkout or downloads it from GitHub, writes `.env` with a new `PAYLOAD_SECRET`, creates the Postgres database, installs dependencies and seeds demo content. Every question has a flag (`--yes` for no questions). `--packages <path>` packs `payload-canvas` from a local checkout. It never runs `payload migrate`.

### Packaging

- `payload-canvas` ships ESM JavaScript, `.d.ts` files and the admin `.scss` files in `dist/`, one output file per source file, with `'use client'` directives kept. Apps need no `transpilePackages` and no own `sass` install.
- Peer dependencies: `payload`, `@payloadcms/ui`, `@payloadcms/richtext-lexical` `^3.90.0`, `next` `^16.3.0`, `react` and `react-dom` `^19.2.0`, `tailwindcss` `^4.3.0`. Optional: `@anthropic-ai/sdk`, `payload-mcp-toolkit`, `zod`.
- Tested with a blank `create-payload-app` project (Payload 3.90.2, Next.js 16.3.3, React 19.2.6, Postgres) in `next dev` and `next build` + `next start`.

[0.1.0]: https://github.com/jon8800/payload-canvas/releases/tag/v0.1.0

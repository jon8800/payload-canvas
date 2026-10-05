# Design critique 2: builder editor and Northwind demo site

Method: dual-agent, with one limit. Assessment A (design review, live browser, source reading) ran in the critic agent. Assessment B ran in two parts. A separate sub-agent ran the Impeccable detector CLI on the source folders. The critic ran the in-page detector overlay on the site after A was recorded, because the brief allowed only one browser at a time. The CLI result arrived before A was finished. It held one false positive, so it could not steer A.

Date: 2026-10-06. Dev server: http://localhost:3300. Commit: `ade1948` (animations with motion), clean tree.

Context: no PRODUCT.md or DESIGN.md exists. The current code is the design authority. This is a refinement critique, not a redesign.

- The editor is **Operate** mode. It must feel native to the Payload admin.
- The demo site is **Persuade** mode. It is the marketing site of the fictional "Northwind Studio".

Screenshots are in `%TEMP%\design2\`. Editor files are `ed-NN-<name>-<theme>-<width>.png`. Site files are `fe-<page>-<width>-top|full.png` plus named state shots. All test data ("ZZ test design home", "ZZ test design empty", "ZZ test design section") was deleted after the run.

## Scores against the first critique

| Surface | Critique 1 (2026-10-04) | Critique 2 (2026-10-06) | Band |
|---|---|---|---|
| Editor | 26/40 | **33/40** | Good |
| Demo site | 20/32 (62%) | **24/32 (75%)** | Good |

Both surfaces moved up one band. Most P1 issues from critique 1 are fixed. See "Status of critique 1 issues" at the end.

---

## Part 1: Editor

Surfaces reviewed live, in light and dark theme, at 1440x900 and 2560x1440: top bar, left panel tabs (Layers, Blocks, Sections), canvas chrome (frame resize handles, status bar, zoom, Play animations, insert "+" and picker), selection and hover overlay with action bar, canvas and outline context menus, tooltips, inspector tabs (Content, Styles, Motion), Styles panel (selects, option popovers, box model, override dots), Motion tab (selects, sliders, segmented control), array field (Menu links), Assistant panel and the Claude Code / Codex card, Page settings, Versions and API drawers, publish menu, shortcuts popover, empty page, publish blocked by problems, offline, two-user presence, the mobile canvas, saved-section editing.

Not seen: the locale switcher. Localization is off in this dev setup (`i18nDemo` in `payload.config.ts`), so the switcher does not render.

### Design health score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Save, offline ("Offline · changes kept"), problems chip, presence and status bar are clear. The `md` / `base` chip has a tooltip but no visible label. The canvas shows blocks at rest, so motion is invisible until Preview or Play. |
| 2 | Match system / real world | 3 | Motion copy is plain ("Plays when the block scrolls into view"). Heading and Stack fields still say `<h1>` and "The HTML tag". Styles show raw values `[1.02]`, `[-0.03em]`. |
| 3 | User control and freedom | 4 | Undo covers edits and whole AI replies. Esc closes menus and drawers. Revert, offline queue, and follow / unfollow all work. |
| 4 | Consistency and standards | 3 | One AI entry, Payload palette. But two option-list patterns (with and without a check mark), stale panel names in copy, 13 font sizes, and a crowded saved-section top bar. |
| 5 | Error prevention | 3 | Publish stops on missing required text and names the blocks. Required selects (Level, HTML element, Link to) can still be cleared with ✕. |
| 6 | Recognition rather than recall | 3 | Outline rows now show content ("Heading Websites your…"). The action bar has 3 buttons. The "Select parent" icon still looks like "upload", and the motion icon looks like a toggle. |
| 7 | Flexibility and efficiency | 4 | Ctrl+Alt+P publishes, Alt+↑/↓ moves, Alt+1/2/3 switches panels, copy and paste styles, context menus with shortcuts, MCP. |
| 8 | Aesthetic and minimalist design | 3 | Styles panel now opens only the groups with values. Text is small everywhere (mostly 11 to 12.5px), which reads as cramped at 2560. |
| 9 | Error recovery | 4 | Problems popover with "Show" links, red canvas tags, outline marks, an inspector banner, a toast, and offline save that keeps changes. |
| 10 | Help and documentation | 3 | Tooltips on nearly every control, field help, a 24-item shortcuts list. Blocks in the Blocks tab still have no descriptions. |
| **Total** | | **33/40** | **Good** (was 26) |

### Design specificity verdict

**Assessment A.** The editor reads as a Payload screen with a Webflow-class style panel. That was the goal, and it holds across the new parts. The Base UI selects, sliders, menus and tooltips use Payload variables (`--theme-elevation-*`, `--theme-warning-*`); hex values in SCSS are only fallbacks inside `var()`. The violet AI accent is gone; violet now marks only remote collaborators (`--be-remote`, `editor.scss:2035`). The AI panel is quiet: a grey sparkle tile, four plain suggestions, a context chip.

The weak spot is the small system underneath. Type has no scale: the admin SCSS uses 13 font sizes (`7, 8, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14px` and one Payload variable). Payload's own body size is 13px. Three shadow recipes exist for floating surfaces (`menu.scss:24`, `styles.scss:826`, `tooltip.scss:30`). Two option-list components exist (Base UI `ui/Select.tsx` and `styles/popover.tsx`). These do not break the Payload feel, but they make each new part a little different.

**Deterministic scan.** The CLI found 0 issues in `packages/builder/src/admin` and 0 in `apps/starter/src`. It found 1 in `packages/builder-react/src`: `overused-font` at `canvas/thumbnail/css.test.ts:39`. That is a false positive: it is an `@font-face` string inside a unit test. The two findings from critique 1 (`transition: width` at `editor.scss:1272`, `side-tab` in `templates.scss`) no longer appear. The detector caught nothing that A missed in the editor.

The overlay ran on the site only; see Part 2.

### Overall impression

The editor went from "shows everything" to "shows what is set". The Styles and Motion tabs, the context menu and the error states are now at product quality. The remaining problems are small and systemic: tiny type, a few stale words, two patterns where one should be, and an empty page that still does not help you start.

### What is working

1. **Progressive Styles panel.** Only groups with values open (Size and Typography for a heading, Layout and Size for a stack). Breakpoints are one row with dots for set values, and State is one select. Amber dots mark values that a larger breakpoint overrides, with a tooltip. (`ed-03-heading-styles-light.png`, `ed-15-stack-styles-spacing-light-1440.png`)
2. **Error and offline states.** Clearing a required heading and pressing Publish gives a red "⚠ 2" chip, a "Fix these to publish" popover with "Show" links, red tags on the canvas, red outline rows, an inspector banner and a toast. Offline shows "Offline · changes kept" in amber and disables Publish. (`ed-46-publish-problems-light-1440.png`, `ed-47-offline-light-1440.png`)
3. **Menus.** The canvas and outline context menus have icons, shortcuts, five groups, and Delete last in red. Disabled items are grey, including "Revert to published" in the publish menu. (`ed-19-context-menu-light-1440.png`, `ed-28-publish-menu-light-1440.png`)
4. **Sections tab.** Real thumbnails replace the grey wireframes. (`ed-25-sections-tab-light-1440.png`)

### Cognitive load

Checklist failures: 2 of 8 (moderate).

- **Minimal choices** fails in three places. The Motion "Effect" select lists 13 flat options (`ed-13-motion-select-open-light-1440.png`). The Display "⋯" popover lists 9 CSS display values (`ed-15b-styles-select-open-light-1440.png`). The shortcuts popover lists 24 rows with no groups (`ed-27-help-light-1440.png`).
- **Working memory** fails for the canvas at rest. The Motion tab says the canvas shows blocks at rest. To see an animation you press Preview, or turn on Play in the status bar, which is an unlabeled icon.

### Priority issues

**[P1] The editor has no type scale, and its text is smaller than Payload's.**
- *Why it matters:* Most editor text is 11 to 12.5px; Payload body text is 13px. The editor looks denser than the admin around it. At 2560x1440 the 290px and 360px side panels with 11px labels read as fine print (`ed-15-stack-styles-spacing-dark-2560.png`). Half-pixel sizes render blurry on 1x screens.
- *Evidence:* 13 distinct `font-size` values in `packages/builder/src/admin/**/*.scss`: 56× `12px`, 36× `11px`, 24× `12.5px`, 20× `11.5px`, 9× `10.5px`, plus `10, 9.5, 9, 8, 7px`.
- *Fix:*
  - Add three tokens to the editor root (`.builder-editor` in `editor.scss`): `--be-text-s: 11px` (captions, kbd, counts), `--be-text-m: var(--font-body-size-m, 13px)` (labels, inputs, rows, menu items), `--be-text-l: 14px` (block name, panel titles).
  - Map `12px`, `12.5px` and `13px` to `--be-text-m`; map `10px` to `11.5px` to `--be-text-s`; delete `7–9.5px` except the breakpoint min-width captions.
  - Do not scale panels with the window. Keep 13px.
- *Command:* `/impeccable typeset`.

**[P1] Stale and developer words remain in the most-used fields.**
- *Why it matters:* A first-time editor meets these on the first heading and the first empty page.
- *Evidence and fix:*
  - Empty canvas: "Add a section or a block from the Add panel." No panel is named "Add" now (`builder-react/src/canvas/BuilderCanvas.tsx:707`). Use "Add a section from the Sections tab, or a block from the Blocks tab."
  - Empty Menu block: "Menu: add links in the block settings". The tab is "Content". Use "Menu: add links in the Content tab".
  - Heading Level help: `HTML heading level: "1" renders <h1>…` (`builder/src/blocks/defaults.ts:165`). Use "1 is the page title. Use 2 for section titles and 3 inside sections." Rename the options "1 · Page title", "2 · Section", "3 · Subsection".
  - Stack "HTML element" help: "The HTML tag…" (`defaults.ts:102`). Label it "Meaning", options "Section", "Header", "Footer", "Article", "Plain box (div)".
  - The inspector header shows the block category under the name ("Heading / Content", `Inspector.tsx` `BlockHeader`, `sub = def?.category`), right above the "Content" tab. Show the category only in the Blocks tab. Under the name, show the custom label's type or nothing.
  - Raw Tailwind arbitrary values in Styles inputs: `[1.02]`, `[-0.03em]`. Show them without brackets (`1.02`, `-0.03em`) and keep brackets only in the Classes box.
- *Command:* `/impeccable clarify`.

**[P2] The empty page still offers no way to start.**
- *Why it matters:* The empty page is the first screen of every new page. It shows one grey line on a large blank sheet. The inspector tells you to drag blocks. The assistant has good starters ("Build a landing page for a design studio"), but they are one tab away (`ed-40-empty-page-light-1440.png`, `ed-41-empty-assistant-light-1440.png`).
- *Fix:* In the empty canvas (`BuilderCanvas.tsx`, the `data-builder-empty-page` element), show three things in a column 480px wide, 96px from the top:
  - A heading "Start this page" (20px).
  - Three section thumbnails from the library (Hero, Features, CTA) as buttons, 140px wide, which insert on click.
  - Two buttons: "Browse sections" (switches to the Sections tab) and "Ask the assistant" (opens the Assistant tab and focuses its input).
- *Command:* `/impeccable onboard`.

**[P2] Two option-list patterns, and required selects that can be cleared.**
- *Why it matters:* The Base UI Select marks the current value with a check (`ed-13-motion-select-open-light-1440.png`). The Styles "⋯" popover (Display, Justify, Wrap) marks nothing, so you cannot see that "Flex" is the current value (`ed-15b-styles-select-open-light-1440.png`). Payload selects for Level, HTML element and "Link to" have a ✕ that sets the field to empty.
- *Fix:*
  - In `styles/popover.tsx`, render a 14px check icon before the item whose value equals the current class, and set `aria-checked` on it. Use the same row height (28px) and padding as `ui/Select.tsx` options. Better: build the popover list from the same option component as `ui/Select.tsx`.
  - Pass `isClearable={false}` to Payload select fields that have a `defaultValue` (Level, HTML element, Link to).
  - Use one shadow token for all floating surfaces: `--be-shadow: 0 8px 24px rgb(0 0 0 / 0.18), 0 1px 3px rgb(0 0 0 / 0.12)`. Apply it in `styles.scss:826` and `tooltip.scss:30` too.
- *Command:* `/impeccable polish`.

**[P2] The insert "+" collides with the selection frame.**
- *Why it matters:* When the gap is at the top edge of the selected block, the "+" sits on the blue frame line, between the name tag and the action bar. With the picker open, the blue insert line runs through the name tag (`ed-21-insert-plus-light-1440.png`, `ed-22-insert-picker-light-1440.png`). Two blue lines on one edge look like one broken control.
- *Fix:* In `insert/InsertHandle.tsx`, skip the insert spot on the selected block's top and bottom edges, or draw the "+" 14px outside the frame. Draw the insert line below the name tag and action bar (lower `z-index` than `.builder-editor__overlay` chrome).
- *Command:* `/impeccable polish`.

**[P2] The saved-section top bar is crowded and its chips mean different things.**
- *Why it matters:* At 1440 the left group reads "Section: ZZ test design section", a dashed "ZZ" chip (the category), a "● Details" chip and a dotted-underline "Pages keep their copy". The last one touches the Undo button with no gap. "● Details" looks like the "● Draft" status chip on pages, but it is a button that opens dates (`ed-57-section-topbar-light.png`, `ed-58-section-details-light-1440.png`).
- *Fix:*
  - Use the page pattern: breadcrumb "Saved sections › ZZ test design section". The crumb is already a link to all saved sections.
  - Show the category as plain muted text after the name ("· ZZ"), not a dashed chip.
  - Move "Last modified / Created" into the "⋯" menu footer, like the Block ID in the block menu.
  - Replace "Pages keep their copy" with a 14px info icon with the same tooltip. Keep 16px between the left group and Undo.
- *Command:* `/impeccable layout`.

### Persona red flags

**Alex (power user).**
- The shortcuts popover lists 24 rows in one column with no groups. Group them: Document (Publish, AI), Edit (Undo, Redo, Copy, Cut, Paste, Duplicate, Delete, Hide), Styles (Copy styles, Paste styles), Navigate (Layers keys, Alt+1/2/3, Shift+Enter, Esc).
- The outline row hover shows four icons (rename, hide, duplicate, delete). They cut the row text to one letter ("Text N…", `ed-47-offline-light-1440.png`). Keep hide and "⋯" on hover; the rest are in the menu and on keys.
- Slider values ("700ms", "20px") are not editable. Make the value a 48px number input.

**Jordan (first-time editor).**
- The empty page and the stale "Add panel" text (above).
- The Blocks tab tiles have no descriptions. "Stack", "Spacer", "Field" and "Collection list" mean nothing to Jordan. Add a tooltip with the block's one-line description, which `defineBlock` already holds for the AI.
- "Collectio…" is cut in its 70px tile (`ed-24-blocks-tab-light-1440.png`). Use "Collection" or allow two lines.
- The Motion effect list has 13 flat options. Group them with Base UI `Select.Group`: Fade (Fade, up, down, left, right), Zoom (in, out), Blur, Wipe (up, down, left, right).

**Sam (keyboard and screen reader).**
- Focus rings are visible on the top bar, segmented buttons and breakpoint buttons (`ed-55-focus-ring-topbar-light-1440.png`, `ed-56-focus-styles-light-1440.png`). Good.
- Two collaborators with the same initials still look the same ("BD" for `builder-dev` and `builder-dev2`, `ed-49-presence-light-1440.png`).
- The slider thumb is hard-coded `#fff` (`ui/controls.scss:273`). In light theme a default slider (grey fill, white thumb) reads as disabled (`ed-11-motion-expanded-light-1440.png`). Use `var(--theme-elevation-0)` for the thumb and `var(--theme-elevation-400)` for the 1px ring, so it is visible on white.

### Minor observations

- The "Select parent" icon in the action bar and menus is an arrow out of a tray. It reads as "upload" or "share". Use a corner-up-left arrow.
- The motion icon (a ball with speed lines) in outline rows and in the status bar looks like a toggle switch at 10px. In the status bar, add a text label "Play" next to it at widths above 1280px.
- The Connect card cuts the command mid-word (`claude mcp add --transport http --ca`) and puts the copy button outside the code box (`ed-61-connect-card-light.png`). Put the copy button inside the box, top-right, and add a right fade so the cut reads as "scroll".
- The Page settings drawer is now short (Title, Slug, Published At, SEO), but still 1040px wide at 1440 with an "ID: 190" chip and a dates row (`ed-29-settings-drawer-light-1440.png`). A 560px side drawer would keep the canvas visible.
- Array rows read "Item 01", "Item 02" (`ed-44-array-field-light-1440.png`). Use the row's Label value as the row title (Payload `admin.components.RowLabel`).
- An outline row name comes from the first text inside. When the heading is empty, the hero Stack takes the Menu's name and reads "Stack Main". Skip menu and button labels when picking the row name.
- Presence: the remote frame (violet) and your own frame (blue) draw as two lines 2px apart on the same block (`ed-50-presence-same-block-light-1440.png`). Draw the remote frame 3px outside yours.

### Questions to consider

- What would the inspector look like at 13px with one fewer column of controls?
- Should the canvas play entrance animations once when a block gets a new effect, so the result is visible without Preview?
- Could the empty page and the "+" picker share one component, so starting a page and inserting a section feel the same?

---

## Part 2: Front end (Northwind Studio demo)

Pages reviewed at 1440x900 and 390x844: `/`, `/about`, `/services`, `/contact`, `/blog`, `/blog/designing-with-blocks`. Also: load and scroll animation frames, hover states, the mobile menu, the contact form with empty submit, reduced motion, and JavaScript off.

### Design health score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Current page is underlined in the header, the mobile menu and the footer (`aria-current`). On first paint the hero is blank until scripts run. |
| 2 | Match system / real world | 3 | Short, concrete copy. Work items name real-sounding clients and the service. |
| 3 | User control and freedom | 3 | Header and footer nav everywhere. The mobile menu closes with Esc and returns focus to "Menu". |
| 4 | Consistency and standards | 3 | Pill CTAs, but a 6px-radius "Send message". Two body text colors. Image framing changes from card to card. |
| 5 | Error prevention | 3 | 16px inputs, stacked fields on mobile, "Topic (optional)". The Topic select is still the native control. |
| 6 | Recognition rather than recall | 3 | Clear nav. The service list under the hero looks like links but is plain text. |
| 7 | Flexibility and efficiency | n/a | Marketing site. |
| 8 | Aesthetic and minimalist design | 3 | Distinct and calm. Held back by blank first paint, cropped illustrations and repeated art. |
| 9 | Error recovery | 3 | Inline errors under each field ("Enter your name."). A failed send was not tested, to avoid writing data. |
| 10 | Help and documentation | n/a | Marketing site. |
| **Total** | | **24/32** | **Good (75%)** (was 20/32) |

### Design specificity verdict

**Assessment A.** This is now a site with a point of view. A display serif (Newsreader) over a grotesque body (Hanken Grotesk), a warm paper background, deep green, and illustrated browser mock-ups of four client sites (bakery, architects, festival, clinic). Home leads with "Selected work", which answers critique 1's main point: a design studio must show designs. Interior pages use a left-aligned H1 with the intro on the right, not the old centered grey band.

The palette itself (cream, serif, forest green) is a popular editorial look in 2026, and the detector flags it (below). The illustrations are what make it this studio's site. Keep them as the identity and treat the palette as the quiet base.

**Deterministic scan.** The CLI found 0 issues in `apps/starter/src`.

**Visual overlays.** The detector script was injected into 6 pages at 1440 and 390 in a headless browser. No user-visible overlay exists; the browser was closed and the live server stopped. Console counts: 2 to 3 findings per page at 1440, 6 to 7 at 390.

- `cream / beige palette` (all pages): page background `rgb(246, 243, 236)`. **Valid as a signal, not a defect.** See the verdict above.
- `layout property animation (transition: height)` (all pages): no element on the page has a layout-property transition. The rule is probably in the Next dev tools overlay. **False positive in this dev setup.**
- `hairline border with wide shadow` (all pages): the closed mobile menu panel (`<details>` content, border-b plus a large shadow, 0x0 when closed). The shadow is real when open (`fe-mobile-menu-open.png`), and heavy for a panel on the same background. **Partly valid.** Use `shadow-md` instead of the current large shadow.
- `content overflowing its container`, `text occluded by an overlapping element` (390 only): all point at 0x0 hidden elements in the header (the hidden inline nav and the closed menu). **False positives.**
- `raster buried under a wash or opacity` (Home): the "A small studio" image, measured while its scroll entrance had not played (opacity 0). **False positive caused by the animation state.** It does confirm that entrance blocks sit at opacity 0 until the runtime starts; see the P1 below.

### Overall impression

The demo now sells. The work grid, the testimonials with names, the green CTA band and the full footer make a credible small studio. The animations are restrained: 16 to 20px fade-ups, an 80ms stagger, a 4px hover lift and a press shrink. They feel right. The single biggest problem is technical: the hero is invisible until JavaScript runs, also for visitors who asked for reduced motion.

### What is working

1. **Imagery.** Four illustrated client sites with distinct palettes give the Home grid real content. The offset two-column grid avoids the three-equal-cards look (`fe-home-1440-full.png`).
2. **Type pairing and rhythm.** H1 88px / 0.98 line height on Home, 72px on interior pages, 48px on mobile. Body 18 to 20px with 1.6 to 1.8 line height. Sections breathe with about 160px between them.
3. **Mobile header and form.** "Menu ☰" opens a native `<details>` list with 53px rows and the current page underlined. It works without JavaScript. The form stacks, uses 16px inputs and shows inline errors (`fe-mobile-menu-open.png`, `fe-form-submit-empty-1440.png`).
4. **Motion restraint.** No animation on the header or footer, by design (`apps/starter/src/data/sections/build.ts:111-126`). Hover lift on blog cards is `translateY(-4px)` with a title underline (`fe-blog-card-hover.png`).

### Priority issues

**[P1] The hero is blank on first paint, also with reduced motion.**
- *Why it matters:* The H1 is the largest element on Home, so it is the LCP element. At 150ms after navigation the hero area is empty while the header and "Selected work" are already drawn (`fe-anim-home-150ms.png`). At 350ms it is half faded, including a washed-out primary button (`fe-anim-home-350ms.png`). With `prefers-reduced-motion: reduce` the hero is still blank at 200ms (`fe-reduced-home-200ms.png`), because the hide rule does not check the motion preference. The dev server makes the gap longer than production, but the cause is structural: the content waits for hydration.
- *Evidence:* `packages/builder-react/src/motion/style.tsx`, `MOTION_CSS`: `@media (scripting: enabled){[data-motion-reveal]:not([data-motion-ready]){opacity:0; animation: builder-motion-failsafe 0s 2.5s forwards}}`. With JavaScript off, every block shows (`fe-nojs-home.png`), which is good.
- *Fix:*
  - Wrap the hide rule in `@media (prefers-reduced-motion: no-preference)` as well.
  - For `trigger: 'load'` entrances, emit a CSS keyframe in `MOTION_CSS` that plays at first paint without the runtime: `opacity 0 → 1`, `translateY(var(--motion-distance)) → none`, 700ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Let the runtime skip blocks that already played.
  - Or, simpler: do not put `heroEnter` on the block that holds the H1. In `apps/starter/src/data/sections/hero.ts:45,55` put it on the intro, buttons and service list only.
  - Lower the failsafe from 2.5s to 1.2s.
- *Command:* `/impeccable optimize`, `/impeccable animate`.

**[P2] Illustrations are cropped and framed differently from card to card.**
- *Why it matters:* On `/services` the images are 16:10 art shown in 4:3 boxes with `object-fit: cover` (measured 363x272). The palette art loses its outer swatches, and the label "#F5F…" is cut. The "Designing with blocks" art has its own cream margin, so it looks frameless next to the framed cards. The palette art appears on both `/services` and `/blog` (`fe-services-1440-full.png`, `fe-blog-1440-full.png`).
- *Fix:*
  - The service cards use `styles.image` (`apps/starter/src/data/sections/build.ts:67`, `aspect-[4/3] … object-cover`). Post cards already use `aspect-[16/10]` (`posts.ts:35`). Use `aspect-[16/10]` for the service cards too, the art's own ratio. Or export the art at 4:3.
  - The palette art has a light strip on its right edge in every crop. Re-export it edge to edge.
  - Give every card image one treatment: `rounded-md` with full-bleed art and no built-in margin. Re-export "Designing with blocks" without its cream border.
  - Use a separate illustration for the "Website design" service.
- *Command:* `/impeccable polish`.

**[P2] The post page has two left edges, and "More posts" is unbalanced.**
- *Why it matters:* The date, H1 and intro start at x=336 (768px wide). The body starts at x=368 (704px wide). The 32px step reads as a mistake. "More posts" is a centered 48px heading above a left-aligned two-card grid with an empty third column (`fe-post-1440-full.png`).
- *Fix:* Put the header and the body in one column (`max-w-3xl mx-auto`, 768px). Left-align "More posts" with the grid, and set the grid to `md:grid-cols-2` at the same width as the post, or show three posts.
- *Command:* `/impeccable layout`.

**[P2] Small inconsistencies in buttons and text color.**
- *Why it matters:* Each one is small; together they make the site look assembled.
- *Evidence and fix:*
  - Every CTA is a pill (`rounded-full`), but the form's "Send message" has a 6px radius (`fe-contact-1440-full.png`). Use `rounded-full` on the form button in the `form` block's class list.
  - Body text has two colors. Text blocks use the muted color `oklch(0.46 0.007 87)`. Rich text uses the foreground `oklch(0.22 0.006 92)`. On `/about`, "How we started" is grey and "How we work" is near-black (`fe-about-1440-full.png`). Pick one body color for both (the muted one reads well at 18px) in the rich text `prose` styles.
  - The Topic select is the native control with the browser chevron. Use `appearance-none` with a 16px chevron icon, the same border and radius as the inputs.
- *Command:* `/impeccable polish`.

**[P3] The mobile header loses the main CTA.**
- *Why it matters:* "Start a project" is in the desktop header, but below `md` it is hidden, and the menu lists only four links (`fe-mobile-menu-open.png`). On mobile the only path to the form is the hero button or the footer.
- *Fix:* Add "Start a project" as the last row of the mobile menu, styled as the primary pill, full width. On `/contact` at 390, the contact details push the form to about 870px down; use `order-first` on the form below `md`.
- *Command:* `/impeccable adapt`.

### Persona red flags

**Casey (mobile).**
- Blank hero on a slow phone until scripts run (P1).
- No CTA in the mobile menu (P3).
- The form starts below the first two screens on `/contact`.
- Tap targets pass: menu rows 53px, buttons 48px, the "Menu" toggle 81x44px.

**Jordan (first-time visitor).**
- "Website design · Payload development · Launch and editor training" under the hero looks like a row of links but does nothing. Link each one to its card on `/services`, or prefix the row with a small "What we do" label so it reads as a list.
- Testimonials have names and roles but no company or photo.

**Riley (stress tester).**
- `/blog` no longer skips from H1 to H3 (cards are H2 now). Fixed.
- With JavaScript off, the site is complete and the menu still works. Good.
- With reduced motion, content still waits for the runtime (P1).

### Animation review

| Effect | Where | Values | Verdict |
|---|---|---|---|
| Hero entrance | Home and page headers, on load | fade-up, 20px, 700ms | Good timing, wrong target. Do not hide the H1 (P1). |
| Reveal | Work cards, CTA, sections | fade-up, 16px, plays once | Good. Subtle, does not slow reading (`fe-anim-reveal-100ms.png`). |
| Stagger | Feature rows, testimonials, post cards | 80ms between items | Good. Three items finish in under 1s. |
| Image slide plus scroll | "A small studio" image | fade-right 24px plus a scroll effect | Acceptable. The only scroll-linked effect on the site; keep it the only one. |
| Hover lift | Post cards | translateY(-4px) plus title underline | Good. |
| Press shrink | All buttons | scale down on press | Good, felt and not seen. |
| Button hover | "Start a project" | opacity transition 150ms, no visible change measured | Weak. Darken the fill by 6% on hover. |

Not too much. Nothing loops, nothing bounces, and the header and footer stay still.

### Minor observations

- The mobile menu panel uses a large shadow on the same background; `shadow-md` is enough.
- Testimonial quotes would gain trust from a company name ("Maria Lopez, Head of Marketing, Linden Bakery").
- The footer repeats the contact details from `/contact`. That is fine.

### Questions to consider

- Should the hero H1 be still, and the motion start one beat later on the intro and buttons?
- Would one "case study" page per work item turn the Home grid into real proof?

---

## Quick wins and larger changes

### Quick wins (under an hour each)

| # | Change | Where | Screenshot |
|---|---|---|---|
| 1 | Empty canvas text: "…from the Sections tab, or a block from the Blocks tab." | `builder-react/src/canvas/BuilderCanvas.tsx:707` | `ed-40-empty-page-light-1440.png` |
| 2 | Heading Level help and option labels in plain words | `builder/src/blocks/defaults.ts:165` | `ed-02-heading-content-light.png` |
| 3 | Stack "HTML element" help in plain words | `defaults.ts:102` | `ed-53-select-top-section-light-1440.png` |
| 4 | `isClearable={false}` on Level, HTML element, Link to | field config | `ed-44-array-field-light-1440.png` |
| 5 | Check mark on the current option in the Styles "⋯" popover | `styles/popover.tsx` | `ed-15b-styles-select-open-light-1440.png` |
| 6 | Hide the category under the block name in the inspector | `Inspector.tsx`, `BlockHeader` | `ed-10-stack-motion-light-1440.png` |
| 7 | Slider thumb `var(--theme-elevation-0)` with a 1px `--theme-elevation-400` ring | `ui/controls.scss:269-276` | `ed-11-motion-expanded-light-1440.png` |
| 8 | Group the Motion effect list (Fade, Zoom, Blur, Wipe) | `motion/MotionPanel.tsx` | `ed-13-motion-select-open-light-1440.png` |
| 9 | Menu placeholder: "add links in the Content tab" | Menu block placeholder | `ed-44-array-field-light-1440.png` |
| 10 | Hide rule inside `prefers-reduced-motion: no-preference` | `builder-react/src/motion/style.tsx` | `fe-reduced-home-200ms.png` |
| 11 | `rounded-full` on "Send message" | contact form block classes | `fe-contact-1440-full.png` |
| 12 | One body text color for text and rich text | site theme / rich text styles | `fe-about-1440-full.png` |
| 13 | `aspect-[16/10]` on service card images (`styles.image`) | `apps/starter/src/data/sections/build.ts:67` | `fe-services-1440-full.png` |
| 14 | "Start a project" row in the mobile menu | header section | `fe-mobile-menu-open.png` |

### Larger changes (half a day or more)

| # | Change | Command | Screenshot |
|---|---|---|---|
| 1 | Editor type scale: three tokens, remap 13 sizes | `typeset` | `ed-15-stack-styles-spacing-dark-2560.png` |
| 2 | Empty-page start: three sections plus "Ask the assistant" | `onboard` | `ed-40-empty-page-light-1440.png` |
| 3 | Load entrances in CSS, so the hero paints before hydration | `optimize`, `animate` | `fe-anim-home-150ms.png` |
| 4 | One option-list component for Base UI selects and Styles popovers; one shadow token | `polish` | `ed-13-…`, `ed-15b-…` |
| 5 | Saved-section top bar on the page pattern | `layout` | `ed-57-section-topbar-light.png` |
| 6 | Insert "+" and insert line clear of the selection chrome | `polish` | `ed-22-insert-picker-light-1440.png` |
| 7 | Post page single column and "More posts" grid | `layout` | `fe-post-1440-full.png` |
| 8 | Re-export illustrations at one ratio, one per service | `polish` | `fe-blog-1440-full.png` |

---

## Status of critique 1 issues

| Critique 1 issue | Status |
|---|---|
| Styles panel shows too much | **Fixed.** Groups with values open, one breakpoint row, State select, "More sizing". |
| "Height" and "Spaces" labels | **Fixed.** "Line height", "Whitespace". |
| Two AI entry points, violet accent | **Fixed.** Inspector tab and Ctrl+I only; Payload colors; no sparkle per suggestion. |
| Page settings drawer is the whole edit view | **Mostly fixed.** Title, Slug, Published At and SEO only. Still 1040px wide with ID and dates. |
| Outline rows all read "Stack" | **Fixed.** Rows show content text; sections show their label. |
| Six-icon action bar | **Fixed.** Drag, parent, "⋯". |
| Add panel takes half the left column | **Fixed.** Layers / Blocks / Sections tabs. Real section thumbnails. |
| No Publish or move shortcut | **Fixed.** Ctrl+Alt+P, Alt+↑/↓. |
| Heading Level ✕ and `<h1>` help text | **Open.** |
| Empty canvas "library" text, no start options | **Open.** The text now names an "Add panel" that no longer exists. |
| Blocks without descriptions | **Open.** |
| `2xl` / `md` chip unlabeled | **Partly fixed.** Tooltip added. |
| Connect card mid-word wrap | **Fixed.** Tabs and horizontal scroll. The copy button now sits outside the box. |
| Disabled "Revert" in red | **Fixed.** |
| Same initials for two users | **Open.** |
| Site: three-row mobile header, 20px links | **Fixed.** Menu disclosure, 53px rows, `aria-current`. |
| Site: placeholder gradient images | **Fixed.** Illustrated client sites and service art. |
| Site: same page structure, no proof | **Fixed.** Selected work, named testimonials, left-aligned interior headers. |
| Site: cramped form, 14px inputs, browser errors | **Fixed.** Stacked, 16px, inline errors, "Topic (optional)". |
| Site: Tailwind default theme | **Fixed.** Newsreader, Hanken Grotesk, deep green. |
| Site: `/blog` skips H1 to H3 | **Fixed.** |

## Run notes

- The snapshot was not written to `.impeccable/critique/`; the brief limited writes to this file and the screenshots.
- The overlay live server created `apps/starter/.impeccable/live/`. The critic stopped the server and removed the folder. `git status` is clean apart from this file.
- The Next.js dev tools button ("N", bottom left) shows in every screenshot. It is dev-only and was ignored.
- Questions for the user are left to the lead, who owns the follow-up.

## Fix status

### Site and motion (agent D, 2026-10-06)

Screenshots before and after: `%TEMP%\fix3d\` (`before-*`, `after-*`, `*-firstpaint-*`). The demo was re-seeded with `pnpm seed:demo` after the lead agreed. "ZZ test AI" (page 172) is unchanged.

| Item | Status | What changed |
|---|---|---|
| P1 Hero blank on first paint | Fixed | Entrances with `trigger: "load"` now play in CSS from first paint. `MotionStyle` writes one rule per such block, with keyframes from the same preset data, and the runtime leaves those blocks alone. The rule that hides scroll entrances now applies only under `prefers-reduced-motion: no-preference`, and it ends by itself after 1.2 s (was 2.5 s). With reduced motion, nothing is hidden. The hero H1 is now still; the intro, buttons and notes fade up 120 ms later. Files: `packages/builder-react/src/motion/style.tsx`, `runtime.ts`, one line in `render/RenderLayout.tsx`, `apps/starter/src/data/sections/hero.ts`, `build.ts`. |
| | LCP on `/` | Dev server, 1440x900, median of 5. Before: LCP 2144 ms, FCP 1236 ms, LCP 916 ms after FCP. H1 opacity 0 at first paint (also with reduced motion: LCP 532 ms after FCP). After: LCP = FCP in both modes (0 ms gap). H1 visible at first paint. Absolute LCP after was 1972 ms because the shared dev server's TTFB rose from 872 ms to 1429 ms during the run. |
| | CLS | 0.0007 (was 0.00006). The motion adds no shift. The value comes from the Google Fonts swap (`display=swap` in `packages/builder/src/theme/css.ts`): the hero is now visible while the fonts swap, so its 1-4 px text reflow counts. Not changed (outside the site files). |
| #3 Heading Level help | Fixed | Options read "Heading 1 – page title", "Heading 2 – section", "Heading 3 – part of a section", "Heading 4" to "Heading 6". The help says it sets the page outline, not the size. Stack "HTML element" is now "Kind of area" with "Page section (section)" and similar options. Image alt, Field path and fallback, and Collection list sort and "leave out" help are in plain words. File: `packages/builder/src/blocks/defaults.ts`. |
| P2 Illustrations cropped, art repeated | Fixed | Card images use `styles.cardImage` (`aspect-[16/10]`, the art's ratio) in the card grid, the post cards and the post page. Three new service illustrations (design, development, training) replace the post art on `/services`. The palette art has six edge-to-edge swatches (no paper strip). The blocks art sits on a full-bleed sand field (no cream margin). Files: `seed-demo-images.ts`, `seed-demo.ts`, `build.ts`, `cardGrid.ts`, `posts.ts`, `postTemplate.ts`. |
| P2 Post page two left edges | Fixed | The header, the body and "More posts" share one `max-w-3xl` column with the padding outside it, so all start at one x. "More posts" is left-aligned above a two-column grid of two posts (no empty column). File: `postTemplate.ts`, `posts.ts` (`postGrid` `columns: 2`). |
| P2 Small inconsistencies | Fixed | "Send message" is `rounded-full`. Rich text body uses the muted color, like Text blocks (`globals.css`, `.prose`). The Topic select keeps the native control (keyboard and phone pickers) but drops the browser chevron: `appearance-none` and a 16 px chevron icon, the same border and radius as the inputs (`FormView.tsx`, `formClasses.ts`). |
| Button hover | Fixed | Primary buttons (sections, header CTA, form) darken by 14% on hover instead of fading (`PRIMARY_HOVER` in `build.ts`). |
| P3 Mobile header CTA | Partly | The `/contact` form now comes right after the intro on phones (details below it). The "Start a project" row in the mobile menu is not done: the menu panel is rendered by `packages/builder-react/src/components/Menu.tsx`, which has no slot for a call-to-action row. |
| Mobile menu shadow | Fixed | Panel uses `shadow-md` (`MENU_CLASS_MAP.panel` in `defaults.ts`). |
| Hero service row looks like links | Fixed | A small "What we do" label sits before the notes (`hero.ts` `notesLabel`). |
| Testimonials without company | Fixed | "Maria Lopez, Head of Marketing, Linden Bakery", "Tom Becker, CTO, Oakmoor Clinic" (seed). |
| README "Animations" | Updated | Load entrances in CSS, the 1.2 s hiding, reduced motion, "keep the largest element still". `docs/architecture.md` section on motion updated to match. |

Checks: `pnpm test`, `pnpm typecheck` pass in `packages/builder` (1535 tests) and `packages/builder-react` (139 tests); `pnpm lint` 0 problems in `builder-react` and `apps/starter`; `apps/starter` typecheck passes. `packages/builder` lint reports 1 error in `src/admin/editor/topbar/DocumentTitle.tsx` (`prefer-tag-over-role`), which is in agent C's files.

### Editor visuals, wording and accessibility (agent B, 2026-10-06)

Screenshots before and after: `%TEMP%\fix3b\` (`before-*`, `after-*`, light and dark, 1440 and 2560). axe results: `%TEMP%\fix3b\axe-light.txt`, `axe-dark.txt`.

| Item | Status | What changed |
|---|---|---|
| P1 Type scale | Fixed | Three size tokens and three weight tokens on `:root` in `editor.scss`: `--be-text-s` (`1rem - 2px`, 11px), `--be-text-m` (`1rem`, Payload's 13px), `--be-text-l` (`1rem + 1px`, 14px); `--be-weight-regular/medium/strong` (400/500/600). All 170 `font-size` and 90 `font-weight` values in `packages/builder/src/admin/**/*.scss` now use them (no half pixels, no 700). Labels, inputs, tree rows, tabs, menu items and buttons are 13px. Captions, counts, badges, keys, tooltips, the status bar and small group titles are 11px. Kept in px on purpose: the wireframe drawings in section cards and the initials in presence avatars (graphics, not text). Checked at 1440 and 2560 in both themes: no overflow; tree rows show a few characters less. |
| P1 Stale words | Fixed | Empty canvas text replaced by the start card (below); agent A removed the old "Add panel" line. The inspector header no longer shows the category ("Content") under the block name; a renamed block shows its type there. Styles inputs show arbitrary values without brackets (`1.02`, `-0.03em`); the Classes box keeps the class. Editing such a value to another decimal keeps it arbitrary (`styles/model.ts`, `styles/controls.tsx`). Menu placeholder: "Menu: add links in the Content tab". "Save as section" text, its toast and the collection description say "the Sections tab, under Saved". Heading and Stack help text: agent D. |
| P2 Empty page start | Fixed | New `admin/editor/empty/EmptyStart.tsx`: a card over the canvas (not zoomed) with "Start this page", three suggested sections with real thumbnails (Heroes, Features, Calls to action; one click inserts, Ctrl+Z brings the card back), "Browse sections", "Add a block" (both open the tab and focus its search) and "Ask the assistant" (only with AI; opens the panel and focuses the input). Only the card takes the pointer, and it hides during a drag, so library drops still work. |
| P2 Option lists | Fixed | The Styles "⋯" list marks the current value with the check (also when a button above shows it) and offers "–" to clear a set value. Level, HTML element and Link to have no ✕ any more (`isClearable` is off for selects with a default value). One shadow token `--be-shadow` for menus, Styles popovers, select lists and tooltips. Popovers that fit neither below nor above their control now move up instead of being cut off (QA p15). |
| P2 Insert "+" on the selection frame | Partly | The name tag and the action bar now draw above the "+" and its line, so the line no longer cuts through the tag. Not done: hiding the "+" on the selected block's own top and bottom edge needs logic in `insert/` (agent A's files); handed to the lead. |
| Slider thumb reads as disabled | Fixed | Thumb uses `--theme-elevation-0` with a 1px `--theme-elevation-400` ring (`ui/controls.scss`). |
| "Select parent" icon | Fixed | Corner-up-left arrow. The motion icon is a ball with two trailing arcs instead of speed lines. |
| Outline hover icons cut the name | Fixed | The hover shows two buttons: hide/show and "⋯" (opens the block menu). Rename, duplicate and delete stay in the menu and on their keys. |
| Outline name "Stack Main" | Fixed | A container takes its name from text inside before menu and button labels (`names.ts`, tested in `names.test.ts`). |
| "Collectio…" tile | Fixed | Block tile labels wrap to two lines. |
| Low contrast (QA m14) | Fixed | `--be-muted` is `--theme-elevation-600`; accent text uses `--theme-success-600`; the selection tag uses `--color-success-600` behind white text; Payload's help text in the inspector uses `--theme-elevation-600`. axe (WCAG 2 A/AA) on 5 builder screens: 0 violations in light and dark (was 31 to 64 contrast violations per screen). |
| Not done here | Open | Status bar "Play" label and the drag style tooltip (`Canvas.tsx`, agent A); grouped shortcuts (top bar, agent C); grouped Motion effect list and editable slider values (`motion/MotionPanel.tsx`); same initials for two users (`live/`); saved-section top bar; Page settings drawer width; array row titles. |

Checks: `pnpm test` (1540 tests), `pnpm typecheck` and `pnpm lint` (0 problems) in `packages/builder`; the same in `packages/builder-react` (139 tests); `pnpm typecheck` and `pnpm lint` in `apps/starter`. Impeccable detector on the changed admin files: 0 findings. Test pages "ZZ test fix3b main" and "ZZ test fix3b empty" are deleted.

### Top bar (agent C, 2026-10-06)

| Item | Status | What changed |
|---|---|---|
| Saved-section top bar (P2, larger change #5) | Fixed | The breadcrumb is "Saved sections › ZZ test design section", like pages. The category is plain muted text after a "·" and still editable in place (no dashed chip). "● Details" is now a "Details" button with a calendar icon; it opens the dates card, so it no longer looks like the Draft status chip. "Pages keep their copy" is a 14 px info icon with the same tooltip, with 16 px before Undo. Screenshot: `%TEMP%\fix3c\d-04-section-topbar.png`. |
| Page settings drawer width (minor) | Fixed | 720 px instead of 1040 px. |
| Connect card (minor) | Fixed | The copy button sits inside the code box, top right. A long command scrolls sideways with a right fade. Not checked in the browser. |
| Grouped shortcuts (Alex) | Open | Needs a group per entry in `shortcuts.ts`, outside the top bar files. |

### Leftovers (agent E, 2026-10-06)

| Item | Status | What changed |
|---|---|---|
| P3 Mobile header CTA | Fixed | The Menu block has two new optional fields: "Panel button text" (`ctaLabel`) and "Panel button link" (`cta`). The component shows them as the last row of the small-screen panel, a full-width primary button (`MENU_CLASS_MAP.panelCta`, in the block's `classes`). The inline links and the wide-screen header are unchanged. The header section passes its CTA to the menu (`header.ts`, `menu()` in `build.ts`); the seed already passes the CTA, so the demo needs a re-seed to show it. Checked on a test page at 390 px: the open panel ends with a green "Start a project" button linking to `/contact`; at 1440 px it is not shown. Files: `builder/src/blocks/defaults.ts`, `builder-react/src/components/Menu.tsx`, tests in `Menu.test.ts` and `defaults.test.ts`. |
| CLS from the font swap | Fixed | `themeCss` adds a fallback `@font-face` for each chosen family with known metrics (about 90 popular Google families, `builder/src/theme/fallbacks.ts`): Arial or Times New Roman with `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override`; `--font-sans` and `--font-heading` list it after the family. Values come from the same data and method as `next/font`. `display=swap` stays (`display=optional` would show the fallback fonts on a first visit). Median of 5 loads on `/`, cold cache, dev server: CLS 0.00066 to 0.00004 at 1440x900, 0.00056 to 0 at 390x844. Not done: `<link rel="preload">` for the heading font, because the font file URL is only known after fetching Google's CSS. Families outside the table keep the plain `sans-serif`/`serif` fallback. |

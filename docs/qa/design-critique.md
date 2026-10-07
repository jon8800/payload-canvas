# Design critique: builder editor and Northwind demo site

Method: dual-agent. Assessment A (design review, live browser, source reading) ran in the critic agent. Assessment B (Impeccable detector CLI and in-page overlay) ran in a separate sub-agent. A was recorded before B's results were read.

Date: 2026-10-04. Dev server: http://localhost:3300. Commit: `12743e9` plus working-tree changes.

Context: no PRODUCT.md or DESIGN.md exists. The incumbent implementation is the design authority. This is a refinement critique, not a redesign.

- The editor is **Operate** mode. It must feel native to the Payload admin: Payload CSS variables, Payload type and density, light and dark themes.
- The demo site is **Persuade** mode. It is a marketing site for the fictional "Northwind Studio", built only from the plugin's blocks and Tailwind theme.

Screenshots are in `%TEMP%\critique\` (`ed-*.png` for the editor, `fe-*.png` for the site, `sheet-*.png` for contact sheets).

---

## Part 1: Editor

Surfaces reviewed: top bar, Add panel (Blocks and Sections), outline, canvas overlay and action bar, drop indicator, status bar, inspector (Content, Styles, Assistant, the "Use Claude Code or Codex" card), Page settings drawer, publish menu, shortcuts popover, template mode (Post template), multiplayer presence (two accounts), dark theme at 2560x1440 and light theme at 1440x900. I read the empty-page and no-key states in source; I did not create data to see them live.

### Design health score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | "Saved · 14:56", the Published chip, the status-bar path and presence are clear. The `2xl` / `md` chip next to the width input has no label. |
| 2 | Match system / real world | 2 | Developer words leak into editor UI: `Stack <section>`, "Spaces" (white-space), "Height" (line-height), "base · all sizes", "HTML heading level: "1" renders <h1>". |
| 3 | User control and freedom | 3 | Undo and redo, Esc, Revert to published with a confirmation, and follow / unfollow all work. |
| 4 | Consistency and standards | 2 | Two entry points to the AI (top-bar sparkle and the Assistant tab). The Page settings drawer repeats Publish and shows an "Open builder" button inside the builder. The AI uses a violet accent that Payload does not have. The panel is called "Add" but the canvas says "library". |
| 5 | Error prevention | 3 | Undo covers most edits. The heading Level select can be cleared to empty (✕ button). Delete sits next to Duplicate in a 6-icon bar. |
| 6 | Recognition rather than recall | 2 | The canvas action bar is 6 unlabeled icons. The outline shows 16 rows that all read "Stack". |
| 7 | Flexibility and efficiency | 3 | Good shortcuts list, copy and paste, raw classes, AI, MCP. No shortcut for Publish or for moving a block up or down. |
| 8 | Aesthetic and minimalist design | 2 | The Styles panel shows ~45 controls before scrolling, with Margin and Padding entered in two places. The Add panel stays open and takes 55% of the left column. |
| 9 | Error recovery | 3 | Save has offline, reconnecting and failed states (`topbar/topbar.scss:285-300`). Not exercised live. |
| 10 | Help and documentation | 3 | Shortcuts popover, empty-inspector hints, field descriptions, a setup guide for MCP. |
| **Total** | | **26/40** | **Acceptable** |

### Design specificity verdict

**Assessment A.** The editor is authored for this product. It uses Payload's own variables (`var(--theme-*)` appears 218 times across the four main SCSS files), Payload's drawer, Payload's select and Payload's density. It reads as a Payload screen, not a foreign app. That is the hardest part, and it is done. The interchangeable parts are the AI layer and the Styles panel. The AI layer uses the generic "violet sparkle" look of every AI product (`--be-remote: #8b5cf6` at `editor.scss:1675`, `assistant/assistant.scss:6`). The Styles panel copies the Webflow panel almost one-to-one, including Webflow's density, but without Webflow's progressive disclosure.

**Deterministic scan.** The CLI found 2 warnings in editor code, and 0 in `apps/starter/src`:

- `layout-transition` at `packages/payload-canvas/src/admin/editor/editor.scss:1272` (`transition: width`). This is real but low impact. Animating `width` forces layout on every frame. Use `transform` or remove the transition.
- `side-tab` at `packages/payload-canvas/src/admin/editor/templates/templates.scss:209` (a 2px colored left border on the bound-field sample). This is a false positive in intent: it marks a bound value, it is not a decorative card stripe. It does duplicate meaning, because the binding chip above it already says "Title · title".

The overlay ran on the site only, see Part 2.

### Overall impression

The editor works and looks native. The problem is volume. Every panel shows everything at once: all 15 blocks, all 6 breakpoints, all 4 states, every style group, two ways to enter spacing, two ways to open the AI, two Publish buttons. The single biggest opportunity is progressive disclosure: show the 20% of controls used 80% of the time, and fold the rest.

### What is working

1. **Payload-native shell.** The top bar, drawer, selects, and the dark and light themes match Payload. The light theme (`ed-13-light-1440.png`) needed no extra work.
2. **Canvas feedback.** The selection frame, the name tag, the drop line with a block-name chip (`ed-10-crop.png`) and the status-bar path give a clear sense of place.
3. **Template mode.** The binding chip "Title · title", the sample value "Designing with blocks", and the "previewing …" switcher in the top bar make data binding easy to understand (`ed-12-crop.png`).

### Priority issues

**[P1] The Styles panel shows too much at once.**
- *Why it matters:* A marketer who wants "bigger text" faces about 45 controls, 10 variant buttons and an empty box model before the Typography group. Most fields are empty boxes with no placeholder.
- *Evidence:* `styles/sections.tsx:20` opens `layout`, `spacing`, `size` and `typography` by default. `styles/BoxModel.tsx:63-84` renders the box model and then All / X / Y rows for Margin and Padding, so spacing has two inputs. `styles/VariantBar.tsx` always shows 6 breakpoints and 4 states.
- *Fix:*
  - Open only the groups that have a value on the selected block. Open Typography by default for text blocks and Layout by default for Stack and Grid.
  - Keep the box model. Move the All / X / Y rows behind a "More" toggle, or drop them, because the box model already sets each side.
  - Show breakpoints as one compact row. Hide the Hover / Focus / Active row behind a single "State: Default ▾" select.
  - Hide Min, Max, Ratio and Fit under "More sizing".
  - Rename "Height" to "Line height" and "Spaces" to "Whitespace" (`styles/sections.tsx:322`, `:337`).
- *Command:* `/impeccable distill`, then `/impeccable clarify`.

**[P1] Two entry points to the AI, and the AI does not use Payload's palette.**
- *Why it matters:* The top-bar sparkle (`topbar/TopBar.tsx:173-188`) and the "Assistant" tab in the inspector open the same panel. Users wonder if they are two features. The panel header repeats "Assistant" under the tab that already says "Assistant". The violet accent and sparkle icons on every suggestion compete with Payload's blue selection color and with collaborator colors.
- *Fix:*
  - Keep one entry point: the inspector tab plus Ctrl+I. Remove the top-bar button, or make it the only entry and drop the tab.
  - Remove the duplicate "Assistant" header row. Move the model name and the "Claude Code or Codex" link into a small overflow menu.
  - Use Payload's accent for the AI. Keep violet only for the AI's presence avatar and cursor.
  - Remove the sparkle icon from each suggestion row.
- *Command:* `/impeccable distill`, `/impeccable quieter`.

**[P1] The Page settings drawer is the whole edit view.**
- *Why it matters:* It is a full-screen Payload document drawer (`topbar/DocumentActions.tsx:105-128`). It repeats Publish changes and Preview, shows ID, created and modified dates, and has a "Builder: 43 blocks … Open builder" field. Clicking "Open builder" from inside the builder is a dead end. Editors lose their place.
- *Fix:*
  - Hide the layout field and the document controls in this drawer. The drawer should show Title, Slug, Published at and the SEO tab only.
  - Use a narrower side drawer so the canvas stays visible.
- *Command:* `/impeccable distill`.

**[P2] The outline and the action bar do not say what things are.**
- *Why it matters:* 16 of 43 rows read "Stack" or "Stack <section>" (`Outline.tsx`). Users cannot tell the hero from the CTA without clicking. The canvas action bar shows six bare icons (drag, select parent, up, down, duplicate, delete). The "select parent" arrow (↰) reads as "undo".
- *Fix:*
  - Label each top-level section by its first heading, for example "Section · Why teams choose us". Let users rename a block.
  - Drop the `<section>` / `<article>` tag text from the row. Show it only in the inspector.
  - In the action bar keep drag, parent and a "⋯" menu. Move up, down, duplicate and delete into that menu. The keyboard shortcuts stay.
- *Command:* `/impeccable clarify`, `/impeccable distill`.

**[P2] The Add panel always takes half of the left column.**
- *Why it matters:* At 1440x900 the Add panel uses 55% of the left column, and the outline shows about 12 rows (`ed-13-light-1440.png`). Users add blocks occasionally but navigate the outline constantly. The Sections tab shows gray wireframe thumbnails, not real previews.
- *Fix:*
  - Collapse Add by default once the page has blocks. Open it as a popover from a "+" button, from the empty page, and from a "+" between blocks on the canvas.
  - Render real (scaled) previews for sections.
- *Command:* `/impeccable layout`.

### Persona red flags

**Alex (power user).**
- There is no shortcut for Publish (Ctrl+S or Ctrl+Enter) and none to move a block up or down (Alt+↑/↓).
- The breakpoint `2xl` chip is not clickable to switch breakpoints.
- The shortcuts popover lists 12 items but no section shortcuts.

**Jordan (first-time editor).**
- "Stack", "Grid", "Spacer", "Field" and "Collection list" sit in the Add panel with no descriptions.
- The heading Level help text says `"1" renders <h1>`. Jordan does not know HTML.
- The Level select has a ✕ that clears the level to nothing.
- The empty canvas says "Drag a block here from the library." (`payload-canvas/src/react/canvas/BuilderCanvas.tsx:295`). No panel is called "library", and the canvas offers no sections or AI as a start.
- "Templates" and "Template Parts" are two separate sidebar entries in the admin.

**Sam (keyboard and screen reader).**
- The outline is a real `role="tree"` with arrow-key support. That is good.
- Presence avatars are `aria-label="builder-dev: follow"`. Two users with the same initials ("BD" for `builder-dev` and `builder-dev2`, `live/presence.ts` `initials()`) look identical to sighted users.
- The color is the only difference, and both colors are close to indigo.

### Minor observations

- The Claude Code / Codex card wraps commands in the middle of words (`PAYLOAD_MCP_KE` / `Y`) because of `word-break: break-all` at `assistant/assistant.scss:164-165`. Use `white-space: pre` with horizontal scroll. Show Claude Code and Codex as two tabs, not one long list.
- In the publish menu, the disabled "Revert to published" stays red (`topbar/DocumentActions.tsx:175`, `--danger`). Disabled items should be neutral grey. "Unpublish" is first; put the safe actions first and the destructive ones last, after a separator.
- The breadcrumb title in the top bar is an editable text box, but it looks like plain text. Add a hover border.
- When the same account has a second tab open, presence shows a "builder-dev is editing this block" banner for your own account. Label it "You, in another tab".
- Collaborator selection colors (indigo, violet) are close to the editor's own blue selection frame and to the demo site's indigo primary color. Use a hue set that skips the accent hue.
- The no-selection inspector shows a short shortcut list. That is good; add "Publish" to it once a shortcut exists.

### Questions to consider

- What would the inspector look like if it showed only the properties this block already uses, plus "Add style"?
- Does a marketer ever need Hover / Focus / Active, or Min / Max size? Could those live behind a "Developer" toggle?
- What if the empty page offered three starting sections and an "Ask the AI" box, instead of a drag hint?

---

## Part 2: Front end (Northwind Studio demo)

Pages reviewed at 1440x900 and 390x844: `/`, `/about`, `/services`, `/contact`, `/blog`, `/blog/designing-with-blocks`.

### Design health score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | The nav has no current-page state. On `/contact` the "Contact" button looks the same as on every page. |
| 2 | Match system / real world | 3 | Copy is plain and short. |
| 3 | User control and freedom | 3 | Header and footer nav on every page. |
| 4 | Consistency and standards | 3 | Consistent to a fault. `/about` mixes two container widths (the "How we started" block starts at x=66, "How we work" at x=154 in the 700px sheet). |
| 5 | Error prevention | 2 | Form inputs use 14px text, so iOS Safari zooms on focus. The "Topic" select starts on "Select…". |
| 6 | Recognition rather than recall | 3 | Nav is visible. |
| 7 | Flexibility and efficiency | n/a | Marketing site. |
| 8 | Aesthetic and minimalist design | 2 | Clean, but generic. Placeholder gradient images carry most of the visual weight. |
| 9 | Error recovery | 2 | Only browser-native validation bubbles ("Please fill in this field."). No designed error or success state seen. |
| 10 | Help and documentation | n/a | Marketing site. |
| **Total** | | **20/32** | **Acceptable (62%)** |

### Design specificity verdict

**Assessment A.** The site is category-interchangeable. Swap the name and it is any SaaS template: centered hero on a grey band, three equal cards, image-left text-right, two testimonial cards, an indigo CTA band, a two-row footer. Every interior page opens with the same grey band with a centered H1 and one line of text. Nothing says "design studio": there is no work, no portfolio, no faces, no client logos. A design studio that shows no designs fails its own pitch.

The images are generated gradients with two translucent circles and a word in a box ("Studio", "Workshop", "Launch"; `apps/starter/scripts/seed-demo.ts:42-86`). They read as placeholders, and the purple-to-violet gradient is a common AI-template pattern. The brand color is Tailwind's default indigo, and the only font is Inter.

**Deterministic scan.** The CLI found 0 issues in `apps/starter/src`. The in-page overlay found:

- `overused-font`: Inter on 100% of text, on all four pages scanned. This agrees with A.
- `skipped-heading` on `/blog`: the H1 "Blog" is followed by H3 card titles with no H2. This is real. The post-card section needs an H2, or the cards need H2s.
- `line-length` on `/` (~85 characters) and `/about` (~96 characters). This is real on `/about` (the "How we started" paragraph). On `/` it is borderline.
- `layout-transition` (`transition: height`) on all pages. The source was not traced. It is probably a vendored component, so it is likely a false positive.

### Overall impression

The site is tidy, readable and responsive. It proves the blocks work. As a sales page it is flat. The biggest opportunity is real imagery and one distinctive section per page (a work showcase on Home, a team row on About), so the demo shows what the builder can make, not only that it can make a page.

### What is working

1. **Readable type.** Post body text is 18px with a 28px line height (`/blog/designing-with-blocks`). The H1 to body scale is clear.
2. **Copy.** Headlines are short and concrete ("Websites your team can change in minutes", "We reply within one working day").
3. **It collapses cleanly.** All grids go to one column at 390px with no horizontal scroll.

### Priority issues

**[P1] The mobile header wraps into three rows and has tiny tap targets.**
- *Why it matters:* At 390px the header is ~155px tall: the name, then four links, then "Contact" on its own row (`fe-home-390-top.png`). Nav links are 20px tall (measured), far below the 44px minimum.
- *Evidence:* `apps/starter/src/data/sections/header.ts` uses `flex-wrap` with no small-screen pattern. The block set has no menu or disclosure block.
- *Fix:* Add a menu block to the plugin (a disclosure button with links, and an `aria-current` state). Use it in the header section: name plus "Menu" on mobile, inline links from `md`. Give links `py-3` on mobile. Mark the current page.
- *Command:* `/impeccable adapt`.

**[P1] Placeholder gradient images carry the visual weight.**
- *Why it matters:* The largest element on Home, About, Services, every blog card and the post hero is a generated gradient with a text label. Visitors read it as an unfinished site. It also hides what the Image block can do.
- *Fix:* Seed real photos or real screenshots of sites (studio work, the editor itself) in `apps/starter/scripts/seed-demo.ts`. If the seed must stay offline, use flat, single-color brand panels without the circles and labels.
- *Command:* `/impeccable bolder` (imagery direction).

**[P2] Every page has the same structure, and Home has no proof.**
- *Why it matters:* About, Services, Contact and Blog all open with an identical grey band. Home has no work samples, no client logos and no numbers. Testimonials have no photo or company.
- *Fix:*
  - Add a "Selected work" section (Collection list of case studies, or an image grid) to Home.
  - Give testimonials a name, company and small photo.
  - Use a left-aligned header on interior pages so the hero is not the same centered band.
  - Ship these as sections in `apps/starter/src/data/sections/` so editors get them too.
- *Command:* `/impeccable layout`, `/impeccable bolder`.

**[P2] The contact form is cramped on mobile and has no designed states.**
- *Why it matters:* At 390px, Name and Email sit side by side at 123px each. Inputs use 14px text, so iOS zooms on focus. Errors are browser bubbles only.
- *Fix:* Stack Name and Email below `sm`. Set input text to 16px (`text-base`). Show inline error text under each field and a clear success message after send. "Topic" should start with a real default or the placeholder "Choose a topic".
- *Command:* `/impeccable harden`, `/impeccable adapt`.

**[P3] Theme is Tailwind defaults.**
- *Why it matters:* Indigo `#4f46e5` and Inter everywhere make the demo look like a starter kit, not a studio.
- *Fix:* Pick one brand color and one display face for headings in Theme Settings. Keep Inter for body. This also demonstrates the theme feature.
- *Command:* `/impeccable typeset`, `/impeccable colorize`.

### Persona red flags

**Casey (mobile).**
- The three-row header pushes the hero below the first screen.
- Nav links are 20px tall.
- The form zooms on focus because of 14px inputs.
- Name and Email are 123px wide each.
- The CTA buttons are about 40px tall; they pass, but are close to the limit.

**Jordan (first-time visitor).**
- There is no current-page indicator.
- There is no example work, so Jordan cannot judge the studio.
- Blog cards show no reading time or category.

**Riley (stress tester).**
- `/blog` skips from H1 to H3.
- The contact form relies on browser validation only. A failed send has no designed message (not tested to avoid writing data).

### Minor observations

- The footer repeats the hero tagline and the header links. It has no email, address or social links, while the contact page lists them.
- The "More posts" heading is left-aligned while the rest of the post page is centered.
- The post page bullets are very faint grey dots.
- The FAQ on `/services` is a static list. With three items that is fine. With more, use a disclosure list.

### Questions to consider

- What would make a visitor believe Northwind designs good websites within five seconds?
- Should the demo seed show off the builder's range (a work grid, a team row, a pricing table) rather than the minimum?

---

## Recommended commands by area

| Area | Commands |
|------|----------|
| Styles panel | `distill`, then `clarify` (labels) |
| Inspector and AI panel | `distill`, `quieter` |
| Outline and canvas action bar | `clarify`, `distill` |
| Add panel and empty page | `layout`, `onboard` |
| Page settings drawer, publish menu | `distill`, `polish` |
| MCP connect card | `clarify`, `polish` |
| Site header and nav | `adapt` |
| Site imagery and Home structure | `bolder`, `layout` |
| Contact form | `harden`, `adapt` |
| Site theme | `typeset`, `colorize` |
| Everything, last | `polish` |

## Run notes

- The snapshot was not written to `.impeccable/critique/`; the lead limited writes to this file and the screenshots.
- The overlay live server created `apps/starter/.impeccable/live/`. The critic removed it after the run.
- Questions for the user are deferred to the lead, who owns the follow-up.

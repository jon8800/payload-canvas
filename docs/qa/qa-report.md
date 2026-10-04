# QA report: website builder plugin

Date: 2026-10-04. Dev server: http://localhost:3300. Users: `builder-dev@local.test`, `builder-dev2@local.test`.
Viewports tested: 2560x1440, 1440x900, 1280x800, plus 390 and 768 on the site.

Three testers ran at the same time: the main pass (builder, publish flow, multiplayer, edge cases), a front-end pass and a templates pass.

Screenshots are not in the repo. `docs/qa/` is not gitignored, so they are in:

- `C:\Users\Eugene\AppData\Local\Temp\qa\` (main pass, written `qa\NN-*.png` below)
- `C:\Users\Eugene\AppData\Local\Temp\qa\fe\` (front end, written `fe\*.png`)
- `C:\Users\Eugene\AppData\Local\Temp\qa\tpl\` (templates, written `tpl\*.png`)

## Counts

| Severity | Count |
|---|---|
| Blocker | 2 |
| Major | 15 |
| Minor | 33 |
| Polish | 19 |

---

## Blocker

### B1. Ticking "Default template" publishes another template's unpublished draft
- **Area:** templates, publishing.
- **Repro:**
  1. Open "Post template" in the builder. Change something. Do not publish. The status is "Changed".
  2. Create a new template. Tick only "Default template". Do not publish.
- **Expected:** nothing goes live until someone clicks Publish.
- **Actual:** autosave runs the hook. The hook writes a new *published* version of "Post template", with the unpublished layout and `isDefault: false`. It also resets that template's sample post (20 back to 19). Ticking Default on template 6 later did the same to template 7.
- **Screenshots:** `tpl\36-new-template-published.png`, `tpl\37-anon-post-empty-default.png`
- **Likely file:** `packages/builder/src/plugin/templates.ts:133-153` (`keepOneDefault`). It calls `payload.update` without `draft: true`, and it runs on draft autosaves.

### B2. Pages built from library sections cannot be published, and the error does not say where the problem is
- **Area:** sections library, publish.
- **Repro:**
  1. Create a page. Open the builder.
  2. In **Add > Sections**, click "Image left" (the same happens with "Image right", "Card grid" and "Contact form").
  3. Click **Publish changes**.
- **Expected:** the section publishes as inserted. If something is missing, the editor points to the block and says what to fill in.
- **Actual:**
  - Publish fails. A toast shows raw validation paths for a few seconds, for example: `blocks[2].slots.children[0].slots.children[0].props.image: "image" is required`. With empty blocks on the page, the toast lists 8 such paths in one line.
  - Nothing marks the broken blocks in the outline, the canvas or the inspector.
  - The sections ship with `image: { id: NO_ID }` (0) and `formId: NO_ID`. The canvas shows a grey "Image" placeholder, so the section looks fine until Publish.
- **Screenshots:** `qa\12-sections-inserted.png` (the placeholder), `qa\51-publish-error.png`. The toast closes too fast to capture, so the text above was read from the DOM.
- **Likely files:**
  - `apps/starter/src/data/sections/library.ts:20,112-114,133,152,260` (`NO_ID`)
  - `packages/builder/src/core/validate.ts:122` (message format)
  - `packages/builder/src/admin/editor/topbar/DocumentActions.tsx` (toast)
  - `packages/builder/src/live/` (publish endpoint)

---

## Major

### M1. Uploading a new image from the inspector sends the whole window away from the builder
- **Area:** inspector, Image and Video upload fields.
- **Repro:**
  1. Select an Image block, or a Video block's "Poster image".
  2. Click **Create New**, or **Choose from existing > Add new Media**.
  3. Pick a file, type an alt text, click **Save**.
- **Expected:** the drawer closes. The image is set on the block. You stay in the builder.
- **Actual:** the browser goes to `/admin/collections/media/24` (and `/25` on the second try). The image is attached to the block, but the user has left the builder. Reproduced 3 times.
- **Screenshot:** `qa\29-after-upload.png`
- **Likely file:** `packages/builder/src/admin/screen/BuilderScreen.tsx`. No `EditDepthProvider` exists anywhere in `src/admin/`. Payload uses edit depth to tell a drawer from the main document, so the drawer acts as the top-level document and redirects after create.

### M2. "Desktop" mode shows the tablet or mobile layout on normal laptop screens
- **Area:** canvas, devices.
- **Repro:** open any page in the builder in a 1440x900 window. Then try a 1280x800 window.
- **Expected:** "Desktop" shows the desktop (lg+) layout, zoomed out to fit if needed.
- **Actual:**
  - At 1440x900 the canvas is 820 px wide, so the md layout shows.
  - At 1280x800 it is 660 px, the sm layout: the 3 feature cards stack in one column.
  - Only screens near 2560 px wide show the real desktop layout. The side panels take about 620 px.
- **Screenshots:** `qa\58-1440-builder.png`, `qa\67-1280.png`
- **Likely files:** `packages/builder/src/admin/editor/Canvas.tsx:33-50` (zoom only when the frame is *wider* than the stage), `topbar/TopBar.tsx:24` ("Desktop · fill the stage").

### M3. Style changes on desktop often do nothing visible, because the panel edits "base"
- **Area:** Styles panel, breakpoints.
- **Repro:**
  1. In "Hero, two buttons", select the heading (classes `text-4xl … md:text-6xl`).
  2. Open **Styles**. The bar shows "Editing base · all sizes", while the canvas is at 2xl.
  3. Set **Size** to 5xl.
- **Expected:** the heading gets bigger. Or the panel says the value is overridden at md and offers to edit md.
- **Actual:** the class becomes `text-5xl`. The canvas stays at 60 px, because `md:text-6xl` wins. The Size box shows "5xl", not the 6xl the user sees. The only hint is a small dot on the "md" chip. The same applies to Grid columns (shows "1" on a 3-column grid).
- **Screenshot:** `qa\42-crop.png`
- **Likely files:** `packages/builder/src/admin/editor/styles/VariantBar.tsx`, `styles/StylesPanel.tsx`, `styles/viewport.ts` (the panel does not follow the canvas breakpoint).

### M4. Rich text: the toolbar runs off screen, so links cannot be added
- **Area:** inspector, Rich text block.
- **Repro:**
  1. Add a Rich text block. Type a paragraph and a list.
  2. Select a word.
- **Expected:** the inline toolbar fits the panel. Ctrl+K adds a link.
- **Actual:**
  - The inline toolbar spans x 2245–2721 on a 2560 px screen, so the link button (x 2687) is off screen.
  - Ctrl+K does nothing.
  - The toolbar covers the line below the selection (the second list item).
- **Screenshot:** `qa\25-richtext-link.png`
- **Likely files:** `packages/builder/src/admin/editor/fields/RichTextField.tsx`, `fields/fields.scss`

### M5. Publishing a page with an empty title or slug says "This field is required. This field is required."
- **Area:** publish flow.
- **Repro:**
  1. Pages > Create new. Click **Open builder** at once.
  2. Click **Publish changes**.
- **Expected:** "Add a title and a slug in Page settings", with a button that opens the drawer.
- **Actual:** the toast says "This field is required. This field is required." It names no field and offers no next step.
- **Screenshot:** `qa\07-publish-untitled.png`
- **Likely files:** `packages/builder/src/live/` (publish endpoint error mapping), `topbar/DocumentActions.tsx`

### M6. The Link block accepts buttons, forms, links and lists inside it
- **Area:** blocks, HTML validity.
- **Repro:**
  1. Select a Link block.
  2. Click **Form**, **Field** and **Collection list** in Add.
- **Expected:** these blocks are refused inside a link. Interactive content inside `<a>` is invalid HTML.
- **Actual:** all three go inside the Link. With a URL set, the site renders a form and a list of links inside one `<a>`. Only the AI hint says "Do not put buttons or other links inside it".
- **Screenshot:** `qa\38-form-in-link.png`
- **Likely file:** `packages/builder/src/blocks/defaults.ts:224` (`slots: { children: { label: 'Content' } }` has no `allow`).

### M7. In the outline every section is "Stack <section>", and no block can be renamed
- **Area:** outline.
- **Repro:**
  1. Insert 5 sections from the library.
  2. Click **Collapse all**.
- **Expected:** "Hero", "Three features", … or a way to rename a block.
- **Actual:** five identical rows, "Stack <section> 1". The block menu has no Rename. Breadcrumbs read "Stack > Stack > Stack > Button".
- **Related:** selecting a section and clicking **Stack** puts the new Stack *inside* the section, not after it, so a user who wants a new section gets nested content.
- **Screenshots:** `qa\13-select-from-outline.png`, outline at `qa\65-empty-page.png` (before the delete)
- **Likely files:** `packages/builder/src/admin/editor/Outline.tsx`, `actions.ts` (insert position)

### M8. Keyboard users cannot reach the outline, and two top-bar buttons have no name
- **Area:** accessibility.
- **Repro:**
  1. Load the builder with nothing selected. Press Tab repeatedly.
  2. Run axe (WCAG 2 A/AA) at 1440x900.
- **Expected:** Tab reaches the tree (roving tabindex). Every button has a name.
- **Actual:**
  - Focus goes from "Expand all" straight into links inside the canvas iframe. 0 of 53 tree items have `tabIndex >= 0`.
  - axe reports 3 violations:
    - critical `button-name`: Page settings, icon-only at 1440
    - serious `link-name`: Preview
    - serious `scrollable-region-focusable`: `.builder-editor__outline` has `tabindex="-1"`
  - The library search box has no label (placeholder only).
- **Data:** `C:\Users\Eugene\AppData\Local\Temp\qa\a11y-builder.json`
- **Likely files:** `Outline.tsx`, `topbar/TopBar.tsx`, `Library.tsx`

### M9. Footer CSS overrides responsive classes in page content (site differs from canvas)
- **Area:** site rendering, CSS.
- **Repro:** open `/` at 1440x900. Read the computed font size of the hero subtitle (`text-lg … md:text-xl`).
- **Expected:** 20 px, as the canvas shows.
- **Actual:** 18 px, on every page.
  - Each page has 3 `<style data-builder-css>` blocks: header part, page, footer part. Each one redeclares the utilities layer.
  - The footer block comes last, so its `.text-lg` beats the page's `md:text-xl`. Any `md:`/`lg:` class loses to a base class that the footer also uses.
- **Screenshots:** `fe\site-home-1440-viewport.png` vs `fe\canvas-home-1440.png`
- **Likely files:** `packages/builder-react/src/render/RenderLayout.tsx:198`, `apps/starter/src/app/(frontend)/layout.tsx` (3 `BuilderContent` calls), `packages/builder/src/css/`

### M10. The site has no mobile menu
- **Area:** site header.
- **Repro:** open `/` at 390x844.
- **Actual:** the header wraps into 3 rows (logo / 4 links / Contact) and takes 157 px. There is no menu toggle. No menu or navigation block exists.
- **Screenshots:** `fe\home-390-header.png`, `fe\p_home-390.png`
- **Likely folder:** `packages/builder-react/src/components/` (no nav block), the header part in the seed.

### M11. Every page has the same title and no description
- **Area:** site SEO.
- **Repro:** `curl -s http://localhost:3300/about | grep -o '<title>[^<]*'`
- **Actual:**
  - All 8 pages, posts included, are titled "Payload Starter", with no `<meta name="description">`.
  - `og:url` is always `http://localhost:3000`.
  - Pages where the SEO "Auto-generate" button was used get the placeholder "QA Landing | Site Name | Payload Starter" (see m23).
- **Likely file:** `apps/starter/src/utilities/generateMeta.ts`. It uses only `meta.title` with no fallback to `doc.title`, and passes the slug string to an `Array.isArray` check.

### M12. The 404 page is the bare Next.js default: blank without JavaScript, broken in dark mode
- **Area:** site.
- **Repro:** `curl -s http://localhost:3300/nope | head -c 200`, then open `/nope` with dark mode on.
- **Actual:**
  - The server HTML is `<html id="__next_error__">`, with no `lang`, no `<title>` and no content.
  - After JavaScript runs, it shows the default "404 | This page could not be found."
  - In dark mode the header and footer brand turns white on white.
  - The status codes are correct (404).
- **Screenshots:** `fe\p_nope-1440.png`, `fe\404-light-1440.png`
- **Fix location:** add `apps/starter/src/app/(frontend)/not-found.tsx`.

### M13. An empty default template silently turns off the working template
- **Area:** templates.
- **Repro:**
  1. Create a template with no blocks. Tick Default. Publish.
  2. Open `/blog/designing-with-blocks` signed out.
- **Actual:** the old default is unticked. Empty templates are skipped. Every post falls back to plain title + content, and nothing warns about it.
- **Screenshots:** `tpl\37-anon-post-empty-default.png`, `tpl\38-empty-template-builder.png`
- **Likely file:** `packages/builder/src/plugin/templates.ts` (`keepOneDefault`)

### M14. Templates can publish users' private email addresses
- **Area:** templates, privacy.
- **Repro:**
  1. In the Post template, add a Field block with path `author.email` (or just `author`). Publish.
  2. Open the post signed out.
- **Actual:** the page shows `builder-dev@local.test`. `/api/users` refuses signed-out visitors, but the template output bypasses that. `author` shows the email too, because email is the Users title field.
- **Screenshot:** `tpl\46-anon-override-email.png`
- **Likely files:** the field walk in `packages/builder/src/plugin/templates.ts` (around lines 110-125), and `loadLayoutData` in `packages/builder-react/src/render/` (Local API with access checks off).

### M15. A link can be bound to any text field and produces broken URLs
- **Area:** binding.
- **Repro:** add a Button in a template. Click the bind icon next to Link. Pick Title.
- **Actual:**
  - The picker offers Title, Slug, Alt and author Name.
  - The canvas renders `href="Designing with blocks"`.
- **Screenshots:** `tpl\19-button-link-title.png`, `tpl\c19.png`
- **Likely file:** `packages/builder/src/admin/editor/templates/binding.ts:65` (`LINK_SOURCES` includes `text`).

---

## Minor

Builder and editor:

- **m1. Click-inserted blocks are not scrolled into view.**
  - Repro: with the canvas at the top, click a section or block in Add while a block near the bottom is selected.
  - Actual: the block is added and selected off screen; the canvas does not move.
  - Also, when the canvas does scroll to a block selected in the outline, it stops with the block on the very top or bottom edge, under the floating toolbar.
  - Screenshots: `qa\12-sections-inserted.png`, `qa\37-empty-states.png`, `qa\40-canvas-indigo.png`
  - Files: `Editor.tsx`/`actions.ts`, `Overlay.tsx`
- **m2. Escape that closes a menu also clears the block selection.**
  - Repro: select a block, open **More document actions**, press Escape.
  - Actual: the menu closes and the selection is cleared.
  - File: `packages/builder/src/admin/editor/shortcuts.ts`
- **m3. Ctrl+Z does nothing right after picking a value in a Styles combobox.**
  - Repro: pick Size 5xl, press Ctrl+Z.
  - Actual: focus stays in the combobox input, so the input eats the key. Undo works only after you click elsewhere.
  - File: `styles/controls.tsx`
- **m4. The Classes box accepts any text without warning and keeps double spaces.**
  - Repro: type ` underline decoration-wav`, accept `decoration-wavy`, type ` foo-bar-notaclass`.
  - Actual: the stored className is `… decoration-wavy  foo-bar-notaclass …`. The double space stays until another control rewrites the classes. The unknown class gets no warning.
  - File: `styles/RawClasses.tsx`
- **m5. The Font list shows the CSS-entry fonts, not the fonts the site uses.**
  - Actual: Font offers "sans: GeistSans…", but the canvas and site render Inter (`--font-sans: 'Inter'` from the theme global).
  - Files: `packages/builder/src/css/tokens.ts:127`, starter `ThemeHead.tsx`
- **m6. The color picker lists 40 theme tokens with cut-off names.**
  - Actual: names like "card-foregro…" and "secondary-fo…" are cut off. Developer tokens (`sidebar-*`, `chart-1..5`, `ring`, `input`) are offered for text color.
  - Screenshot: `qa\43-crop.png`
  - File: `styles/ColorPicker.tsx`
- **m7. An invalid video URL gives no message.**
  - Repro: Video > Source URL > type `not a url`.
  - Actual: the canvas shows an empty placeholder, and the inspector shows no error.
  - Screenshot: `qa\35-video-bad-url.png`
  - File: `packages/builder-react/src/components/videoUrl.ts`, Video field description.
- **m8. Out-of-range canvas widths are rejected silently.**
  - Repro: type 100, 99999 or `abc` in the width box.
  - Actual: the box goes empty; on blur it shows the old width. No message or allowed range.
  - File: `topbar/TopBar.tsx`
- **m9. When another editor deletes the block you are editing, nothing tells you.**
  - Repro: user 1 types in a Text block; user 2 deletes it.
  - Actual: user 1's selection clears and further typing is lost. User 1's undo history empties (Undo disabled). Only the deleter can undo.
  - Screenshot: `qa\60-user1-after-delete.png`
  - Files: `live/useMultiplayer.ts`, `live/sync.ts`
- **m10. Your own second tab shows as another collaborator, and avatars are ambiguous.**
  - Actual: opening the same page in a second tab adds a "builder-dev: follow" avatar next to "builder-dev2". Both users get the initials "BD".
  - File: `live/PresenceUI.tsx`
- **m11. The top bar overlaps itself while someone is editing.**
  - Actual: the "builder-dev is editing" chip pushes the Preview button over the save state ("Saved · 1[icon]7"). The offline message is cut to "Offline — changes will sync wh…".
  - Screenshots: `qa\59-user2-sees-edit.png`, `qa\63-offline.png`
  - File: `topbar/topbar.scss`
- **m12. The AI assistant looks ready when no key exists.**
  - Actual: the panel shows "Claude Opus 5.5" and suggestion chips. Only after a message is sent does it show "Not sent" and the setup card.
  - Actual: the chips do not match the block ("Rewrite this text to be punchier" for a Stack).
  - Actual: the setup card is env vars and CLI commands, so a non-technical editor has nothing to act on.
  - Screenshots: `qa\68-assistant.png`, `qa\69-assistant-nokey.png`
  - File: `assistant/AssistantPanel.tsx`
- **m13. "Create new Page" (and "Create new Template") saves an empty record at once.**
  - Actual: `/create` becomes `/pages/46` with no title. The builder top bar shows "46", and clicking it to rename starts with "46" in the box. Leaving creates an orphan draft.
  - Screenshots: `qa\05-page-create.png`, `qa\06-new-page-builder-untitled.png`, `tpl\35-create-template.png`
  - Files: autosave settings of the collections, `topbar/DocumentTitle.tsx`
- **m14. Long unbroken text makes the whole page scroll sideways.**
  - Repro: set a heading to one 300-character word.
  - Actual: the canvas scroll width goes from 805 to 2625 px. Heading and Text have no `break-words`/`overflow-wrap`.
  - Screenshot: `qa\64-long-word.png`
  - Files: `packages/builder-react/src/components/Heading.tsx`, `Text.tsx` (or the default classes)
- **m15. The Image block's upload field sometimes lacks "Create New".**
  - Actual: the first Image inspector after a page load showed only "Choose from existing", with no drag-and-drop line. A later Image block showed both. Not reliably reproducible.
  - Screenshot: `qa\27-image-inspector.png`
- **m16. The preview URL carries the default secret.**
  - Actual: the Preview link is `/next/preview?…&previewSecret=preview-secret-change-in-production`. It is a starter config value, but it ships in the client HTML.
  - Files: starter `.env` / `payload.config.ts`
- **m17. The library search box has no accessible name** (see M8). File: `Library.tsx`.

Front end (from the front-end pass):

- **m18. Wrong origin in sitemap and OG tags; missing static files.**
  - `sitemap.xml`, `og:url` and `og:image` use `http://localhost:3000` (`NEXT_PUBLIC_SERVER_URL` in `apps/starter/.env`).
  - `/og-image.webp`, `/favicon.ico` and `/favicon.svg` return 404 but are linked.
  - `/robots.txt` returns 404 even though `(frontend)/robots.ts` exists.
  - The SEO preview in Page settings shows `http://localhost:3000/qa-landing` for the same reason.
- **m19. Form field borders are almost invisible.** The border is `oklch(0.970)` on white, about 1.1:1 contrast. Screenshot: `fe\p_contact-1440.png`. File: `apps/starter/src/fields/theme/deriveColors.ts`.
- **m20. Keyboard focus on the site is hard to see.**
  - The focus ring is a 1 px `outline:auto` in pale lavender.
  - There is no skip link, and nav links have no `aria-current`.
  - Screenshots: `fe\focus-nav-home-crop.png`, `fe\focus-contact-btn-crop.png`
- **m21. Name and Email stay half width on mobile.** Each input is 123 px at 390. Screenshot: `fe\contact-form-390.png`. File: `apps/starter/src/components/blocks/FormView.tsx:125`.
- **m22. The form shows only native validation.**
  - No inline errors and no `aria-invalid`.
  - The success and error messages have no `role="status"`/`role="alert"`.
  - Screenshot: `fe\contact-success.png`. File: `FormView.tsx:96,158`.
- **m23. SEO "Auto-generate" writes the placeholder "Site Name".** Page settings > SEO > Auto-generate gives "QA Landing | Site Name". The live tab title becomes "QA Landing | Site Name | Payload Starter". File: `apps/starter/src/payload.config.ts:111`.
- **m24. Header and footer do not line up with page content.** At 1440 they are 24 px narrower on each side (`px-6` inside `max-w-6xl`). Screenshot: `fe\p_services-1440.png`.
- **m25. The canvas shows no header or footer.** Editors never see the full page. Screenshot: `fe\canvas-home-1440.png`.
- **m26. axe on the site.** Header and footer `<nav>` have no `aria-label`. `/blog` cards jump from H1 to H3.
- **m27. Possible draft metadata leak.** `generateMetadata` in `[...slug]/page.tsx` and `(frontend)/page.tsx` queries pages without a `_status: 'published'` filter. Nothing leaks today.

Templates (from the templates pass):

- **m28. A heading can be bound to rich text.** The whole post body collapses into one `<h2>`. Screenshot: `tpl\12-heading-content-bound.png`. File: `binding.ts:63` (`TEXT_SOURCES` includes `richText`).
- **m29. The Field block offers group fields that render nothing.** "SEO meta" gives an empty `<div>` and ignores the fallback. Screenshot: `tpl\22-field-SEO_meta.png`. Files: `binding.ts:223`, `packages/builder-react/src/components/Field.tsx`.
- **m30. "Number of items" drops keystrokes silently.** 500 becomes 50, 0 becomes empty, -5 becomes 5, with no 1–100 message. Screenshot: `tpl\30-limit-edge.png`. File: `packages/builder/src/blocks/defaults.ts:399`.
- **m31. The outline does not flag broken bindings after the list collection changes.** The inspector warns; the outline shows a normal bound badge. Screenshots: `tpl\31-list-pages.png`, `tpl\c32.png`. File: `Outline.tsx`.
- **m32. The sample picker shows posts that use a different template, with no hint.** The button says "Post template · previewing X" on every template. Every row says "Updated 4 Oct 2026". `aria-selected` marks the highlighted row, not the chosen one. Screenshot: `tpl\48-1440-sample-picker.png`. File: `templates/SamplePicker.tsx`.
- **m33. A stale copy of your own presence after reload (unconfirmed).** Once, after a reload, "builder-dev is editing this block" appeared for the user's own earlier selection. Screenshot: `tpl\07-after-reload.png`.

---

## Polish

- **p1.** The floating block toolbar is wider than small blocks. On an empty Text block it covers the block's label chip ("xt" shows) and the heading above. Screenshot: `qa\17b-after-drop.png`. File: `Overlay.tsx`.
- **p2.** "Move up"/"Move down" use vertical arrows in horizontal rows (buttons in a flex row).
- **p3.** The presence label shows twice, above and below the other editor's block. The follow tooltip overlaps the "Following builder-dev · Esc to stop" pill. Screenshots: `qa\59-user2-sees-edit.png`, `qa\61-follow.png`.
- **p4.** After inserting a block, focus does not go to its main field (Text, Label). The user must click the inspector.
- **p5.** The inspector stays on the Styles tab when another block is selected, so content fields seem to vanish.
- **p6.** The shortcuts list has no Cut, Hide, Move or Select parent shortcuts. Screenshot: `qa\19-shortcuts.png`.
- **p7.** The Page settings drawer inside the builder shows its own "Open builder" button and a second "Publish changes". It has no saved feedback. Its tooltip lists slug and SEO for templates, which have neither. Screenshots: `qa\09-page-settings.png`, `tpl\33-template-settings.png`.
- **p8.** The block menu offers "Copy block ID", a developer action, but has no Paste, Rename or Save as section.
- **p9.** The Edit view layout field summary reads "43 blocks: 16 × Stack, 8 × Heading…", which is developer-ish. Screenshot: `qa\03-home-edit.png`.
- **p10.** The Pages list has no Status (Draft/Published/Changed) column. Screenshot: `qa\02-pages-list.png`.
- **p11.** A new Stack or Rich text has no padding or width, so on the site its content touches the screen edge (x≈10 px). Screenshot: `qa\55-site-qa-landing-1440.png`.
- **p12.** New Rich text renders grey `prose` text, which is low contrast on a coloured section. Other text is near-black. Screenshots: `qa\26-ctrlk.png`, `fe\p_about-1440.png`.
- **p13.** Zoom is automatic only, with no manual zoom or "fit" control (README says "canvas with zoom").
- **p14.** Template admin shows raw values: the Collection column reads "posts", the Default column reads "true". Screenshot: `tpl\01-templates-list.png`.
- **p15.** The template fallback input has a doubled label ("Text * Text *" for screen readers). File: `templates/Bindable.tsx`.
- **p16.** At 768 the 3-column service cards on `/services` are cramped. Screenshot: `fe\p_services-768.png`.
- **p17.** Images are served as the full 1600x1000 PNG with no `srcset`, even at 340 px wide.
- **p18.** Email and phone on `/contact` are plain text, not `mailto:`/`tel:` links.
- **p19.** Every site page carries about 14.6 KB of inline toast (sonner) CSS. It is probably dev-only; check this.

---

## What confuses a non-technical user

- **Desktop is not desktop.** On a 1280–1440 px laptop, "Desktop" shows the tablet or phone layout (M2). Then the Styles panel edits "base" while a bigger breakpoint wins, so changes seem to do nothing (M3). Together these make styling feel broken.
- **Everything is a "Stack".** Sections lose their names after insert. The outline, breadcrumbs and collapsed tree are rows of "Stack". There is no rename (M7).
- **Publish fails with code.** Error text like `blocks[4].slots.children[1]…props.form: "form" is required` means nothing to an editor. The ready-made sections cause it themselves (B2).
- **"Insert" puts things inside.** Clicking a block while a section or Link is selected nests it. A Link even accepts a whole form (M6).
- **Image upload leaves the builder** (M1). It feels like a crash.
- **Templates.** "Default template" acts at once, before Publish (B1). The binding picker lists 25+ code paths (`featuredImage.filename`, Width, ID, author email). A Field block and a bound Heading look like two ways to do the same thing.
- **The AI panel** looks ready but needs a server key. Its help is env vars and CLI commands (m12).
- **Styles jargon.** Colours named `sidebar-primary-foreground` and `chart-3`. Fonts named "GeistSans" that are not the font on the page (m5, m6).

## Front-end output review

- **Design quality:** at 1440 and 2560 the generated site is clean and consistent. The type scale is clear, Inter is used throughout, section spacing is steady (80/128 px), and the hero, cards and CTA bands have good hierarchy. All images have alt text, and no page scrolls sideways at 390, 768, 1440 or 2560.
- **Responsive:** mobile is the weak point. There is no mobile menu, so the header takes 157 px (M10). Contact form inputs stay half width (m21). Service cards are cramped at 768 (p16).
- **Site shell:**
  - The 404 page, titles and meta descriptions are bare defaults (M11, M12).
  - Form borders and focus rings are hard to see (m19, m20).
  - The contact form works: `POST /api/form-submissions` returns 201 and shows the success message.
  - Every nav, footer and button link works. Unknown URLs return a real 404. Drafts never reached anonymous visitors.
- **Canvas vs site parity:**
  - Fonts, colours, spacing, image sizes and buttons match.
  - On the QA page, every class I set in the Styles panel matched on the site: `md:text-7xl`, `md:hover:text-primary`, `decoration-wavy`, `bg-[#ffe4b5]`, `p-8`, a numbered list, a Vimeo embed, and a hidden block omitted.
  - One systemic gap: the footer's CSS block overrides responsive classes in page content, so the site can differ from the canvas for any `md:`/`lg:` class (M9).
  - The canvas has no header or footer (m25).

## What worked well

- Undo/redo is solid: duplicate, copy/paste into a container, delete, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, and Escape cancels a drag.
- Hide/show renders a faded dashed block on the canvas and is omitted on the site.
- Live editing:
  - Edits reach the other editor in about 1 s, with cursors, selections and follow mode.
  - Undoing another user's delete restores the block for both users.
  - Both users can publish at once without trouble.
  - Offline edits sync on reconnect, and edits survive an immediate reload.
- The publish flow (Publish, Unpublish, Revert with confirmations, status chip card with versions) works and updates every editor.

## Test data left behind

- Page "QA Landing" (id 46, slug `qa-landing`): published, with draft changes. It is a useful repro page for M2, M3, M6, m14 and p11. Delete it when done.
- Media 23, 24, 25 (`qa-upload.png`, `qa-upload-1.png`, `qa-upload-2.png`).
- One contact form submission ("QA Tester", `qa-fe@example.test`).
- Post template (id 6): same layout as before, published and default, with 3–4 extra versions. Template 7 and post 22 were deleted permanently.

## Testing notes

- During the run, someone edited `packages/builder/src/live/apply.ts` and `document.ts`. The canvas once showed a Turbopack "Export payloadErrorMessage doesn't exist" error. It cleared on reload, so it is not counted.
- The browser automation daemon often timed out at 2560x1440. The auto-scroll-while-dragging test is therefore inconclusive: the canvas moved only 55 px while the pointer rested at the top edge. Re-test it by hand. The code is in `Editor.tsx:33-50`.

---

## Status after fix round (2026-10-04)

Checked against the code on the evening of 2026-10-04. The dev server was down for part of the check (another agent was moving the theme into the plugin), so most front-end items were checked in the code, not in the browser. "Fixed here" means fixed in this hardening round.

Totals: report items 57 fixed, 8 open, 4 won't fix. Design critique: 16 fixed, 2 open, 2 won't fix.

### Blocker

- B1 — fixed — `plugin/templates.ts` `keepOneDefault` acts only on a published, ticked default. Draft autosaves no longer publish another template.
- B2 — fixed — the Image `image` prop is optional, library sections drop media ids, and Publish names the problem blocks (`topbar/problems.ts`).

### Major

- M1 — fixed — `BuilderScreen.tsx` wraps the editor in `EditDepthProvider`, so upload stays in a drawer.
- M2 — fixed — Desktop frames at least 1280 px and zooms to fit (`Canvas.tsx`).
- M3 — fixed — the Styles panel shows "Overridden at md by …" with an action to edit that breakpoint.
- M4 — fixed — the rich text toolbar is width-capped. Ctrl+K adds a link.
- M5 — fixed — the message is deduplicated ("Title is required"). Document-field problems open the settings drawer.
- M6 — fixed — the Link slot refuses interactive blocks at any depth.
- M7 — fixed — outline rows show block names, with rename (F2). New containers go after the selected section.
- M8 — fixed — outline rows have roving tabindex. Page settings, Preview and the library search have names.
- M9 — fixed — header, page and footer share one compiled stylesheet (`compilePageCss`).
- M10 — fixed — the Menu block has a mobile disclosure and `aria-current`.
- M11 — fixed — `generateMeta.ts` falls back to the page title plus the site name and sets a description.
- M12 — fixed — `not-found.tsx`, `global-not-found.tsx` and `NotFoundContent.tsx` exist.
- M13 — fixed — `requireBlocksForDefault` refuses to publish an empty default template.
- M14 — fixed — bindings load with `overrideAccess: false`, and the picker hides `email`.
- M15 — fixed — a link binds only to `$url` or to URL-like fields.

### Minor

- m1 — fixed — `scrollToBlock` keeps a margin, and the canvas sends the reveal again after an insert.
- m2 — fixed — Escape is ignored while a popover is open.
- m3 — fixed — `useUndoKeys` passes Ctrl+Z from the combobox to the editor.
- m4 — fixed — whitespace is collapsed on write, and unknown classes are flagged.
- m5 — fixed — fonts map to `var(--font-<name>)`, and the app can pass `fontFamilies`.
- m6 — open (partly fixed) — developer tokens are under "More theme colors", but long names such as `secondary-foreground` are still cut off in the 2-column grid. Files: `admin/editor/styles/ColorPicker.tsx`, `styles.scss`.
- m7 — open — the Video source has no URL check, and the canvas shows an empty placeholder. Files: `blocks/defaults.ts` (Video field `validate`), `builder-react/src/components/Video.tsx`.
- m8 — fixed — the width box clamps to 320–2560 and says so.
- m9 — fixed — the editor warns "<name> deleted the block you had selected".
- m10 — fixed — distinct initials (BD, BD2) and "You (another tab)".
- m11 — fixed — the live chip is width-capped, and the offline text is short.
- m12 — open (partly fixed) — the chips fit the block and the setup card is plain. The panel still looks ready before the first message, because nothing reads the server's `ai.ready` / `setupProblem`. File: `admin/editor/assistant/controller.ts`.
- m13 — won't fix — Payload's autosave creates the record when the create view opens. That is Payload's behavior for autosave collections. The builder shows "Untitled" instead of the id.
- m14 — open (partly fixed) — the site CSS adds `overflow-wrap`, but the canvas does not load it, and the Heading and Text defaults have no `break-words`. File: `blocks/defaults.ts`.
- m15 — won't fix — not reproducible. The M1 drawer-depth fix is the likely cause.
- m16 — fixed — the preview URL carries no secret.
- m17 — fixed — the library search box has `aria-label`.
- m18 — fixed — `robots.txt` serves, `og:image` is no longer linked, and the site now has a favicon (`app/(frontend)/icon.svg`, fixed here). The origin comes from `NEXT_PUBLIC_SERVER_URL`, which is a deploy setting (`.env` has `http://localhost:3000`).
- m19 — fixed — the input border mixes background and foreground 50%.
- m20 — fixed — a 2 px `:focus-visible` ring, a skip link and `aria-current`.
- m21 — fixed — form fields are full width below `sm`.
- m22 — fixed — inline errors with `aria-invalid` / `aria-describedby`, and `role="alert"`.
- m23 — fixed — SEO titles use the site name from Site Settings.
- m24 — fixed — header, footer and sections share `px-5 md:px-8` around `max-w-6xl`.
- m25 — won't fix — the canvas leaves out the header and footer on purpose (`(builder-canvas)/layout.tsx`).
- m26 — fixed — menus have labels. Card titles are H2 when the list has no title.
- m27 — fixed — page queries filter `_status: 'published'` outside draft mode.
- m28 — fixed — rich text binds only to textarea props.
- m29 — fixed — the Field block leaves out group and array fields.
- m30 — open — "Number of items" still turns each keystroke into a number, with no 1–100 message. File: `admin/editor/fields/renderField.tsx`.
- m31 — fixed — the outline shows a broken-binding badge.
- m32 — open (partly fixed) — `aria-selected` and the per-row dates are fixed. Posts that use another template are still listed with no hint. Files: `admin/editor/templates/SamplePicker.tsx`, `useTemplate.ts`.
- m33 — won't fix — unconfirmed. "You (another tab)" now covers your own earlier session.

### Polish

- p1 — fixed — the action bar is compact and can sit below or inside small blocks.
- p2 — fixed — left/right arrows in rows, up/down arrows in columns.
- p3 — fixed — one name row, and no tooltip while following.
- p4 — fixed — focus goes to the first field after an insert.
- p5 — fixed — the inspector goes back to Content for a different block type.
- p6 — fixed — Cut, Hide, Move and Select parent are listed.
- p7 — fixed — the settings drawer has no Publish, no "Open builder" and no "…" menu.
- p8 — open (partly fixed) — "Copy block ID" is gone, and Rename, Paste and Select parent are there. "Save as section" does not exist. File: `admin/editor/inspector/Inspector.tsx`.
- p9 — fixed — the layout field reads "N sections, M blocks in total".
- p10 — fixed — the Pages and Posts lists have a Status column (Payload shows Draft or Published, not "Changed").
- p11 — open — the Stack default is `flex flex-col gap-4` and Rich text is `prose`, with no padding or width. File: `blocks/defaults.ts`.
- p12 — fixed — prose colors follow the theme foreground.
- p13 — fixed — a zoom control with fit, in and out.
- p14 — fixed — the templates list shows collection labels and "Default".
- p15 — fixed — the fallback label is read once.
- p16 — fixed — 2 columns at 768 px.
- p17 — fixed — images get a `srcset` from Payload's image sizes.
- p18 — fixed — email and phone are `mailto:` / `tel:` links.
- p19 — fixed — nothing on the site imports the toast CSS.

### Design critique (`design-critique.md`)

Editor priority issues, in order (D1 Styles panel, D2 AI entry points, D3 settings drawer, D4 outline and action bar, D5 Add panel):

- D1 — fixed — groups open only when they have values. The box model hides All/X/Y behind a toggle.
- D2 — fixed — one AI entry (inspector tab, Ctrl+I). The assistant uses the editor accent.
- D3 — fixed here — the drawer has no layout field, Publish or actions, and it is now at most 1040 px wide, on the right (`topbar/topbar.scss`, marker in `topbar/settingsDrawer.tsx`).
- D4 — fixed — rows show names, with rename. The action bar is drag, parent and "More".
- D5 — open (partly fixed) — the Add panel starts closed once the page has blocks. Section thumbnails are still wireframes, and there is no "+" between blocks. Files: `admin/editor/Library.tsx`, the canvas overlay.

Front-end priority issues (DF1 mobile header, DF2 images, DF3 page structure and proof, DF4 contact form, DF5 theme):

- DF1 — fixed — the Menu block folds into a disclosure below `md`, with 44 px targets.
- DF2 — fixed — the seed images are mockups and editorial compositions, not labelled gradients.
- DF3 — won't fix (rest) — "Selected work" and left-aligned interior headers exist. Testimonial photos are not added, because the seed has no portrait images.
- DF4 — fixed — stacked on mobile, `text-base` inputs, inline errors and a designed success state.
- DF5 — fixed — Newsreader and Hanken Grotesk, and a deep-green primary (the theme is moving into the plugin).

Minor observations (Dm1–Dm6 editor, Dm7–Dm10 front end):

- Dm1 — fixed — command cards scroll instead of breaking words. Claude Code and Codex are tabs.
- Dm2 — fixed — disabled items are neutral. Safe actions come first, destructive ones after a separator.
- Dm3 — fixed — the title box has a hover border.
- Dm4 — fixed — "You are editing this block in another tab".
- Dm5 — fixed here — collaborator colors no longer use blue, cyan, indigo or violet, which were close to the editor's blue selection (`live/session.ts`).
- Dm6 — open — there is no Publish shortcut, so the empty inspector cannot list one. Files: `admin/editor/shortcuts.ts`, `inspector/Inspector.tsx`.
- Dm7 — fixed — the footer has a contact column.
- Dm8 — fixed here — "More posts" on the post template has a centered heading, like the article (`data/sections/postTemplate.ts`). Existing databases get it on the next `pnpm seed:demo`.
- Dm9 — fixed — bullets use the muted foreground.
- Dm10 — won't fix — three FAQ items work as a static list, as the critique says.

### Found during this round

- Fixed here — Payload's "Document locked" dialog opened behind the builder's settings drawer (modal z-index 30, drawer 100 and up). A second person saw an editable form with no warning. `topbar/topbar.scss` lifts the lock dialogs above drawers.
- Open (Payload behavior) — in the settings drawer, the lock dialog's "Go back" button goes to the collection list and leaves the builder. "View read-only" is the right choice there. A fix needs a custom drawer or a Payload change.

### Open items for the editor UI owners

m6, m7, m12, m14, m30, m32, p8, p11, D5, Dm6. Each has one line above, with its files.

# QA report 2: website builder plugin

Date: 2026-10-06. Dev server: http://localhost:3300. Users: `builder-dev@local.test`, `builder-dev2@local.test`.
Browser: Playwright with Chrome, headless, real mouse and keyboard input.
Viewports: 1440x900 and 2560x1440 for the admin, 1440x900 and 390x844 for the site.

The tests ran on my own documents ("ZZ test qa main" page 189, "ZZ test qa template" 16, saved section 13, media 79). All of them are deleted. The demo pages were only opened, never changed.

Screenshots are in `C:\Users\Eugene\AppData\Local\Temp\qa2\`. The scripts that produced them are in `qa2\scripts\`.

## Counts

| Severity | Count |
|---|---|
| Blocker | 0 |
| Major | 2 |
| Minor | 17 |
| Polish | 17 |

---

## Major

### M1. Backspace at the start of a list item deletes that item's text
- **Area:** inline text editing, List block.
- **Repro:**
  1. Add a List block. Double-click the first item on the canvas.
  2. Type `Alpha`, press Enter, type `Beta`.
  3. Press Home, then Backspace (to join "Beta" to "Alpha").
  4. Type `X`. Press Escape.
- **Expected:** one item, "AlphaBetaX", with the caret between "Alpha" and "Beta".
- **Actual:**
  - After Backspace the data holds "AlphaBeta" (the inspector shows it), but the canvas item still shows only "Alpha".
  - Any typing then writes the canvas text back. The item becomes "AlphaX". "Beta" is gone.
  - If you press Escape at once without typing, the joined text survives. Most people keep typing, so they lose text.
  - Reproduced 3 times, with fast and slow typing.
- **Screenshots:** `19-list-editing.png`, `24-list-merge-slow.png` (canvas "First item", inspector "First itemSecond item")
- **Likely files:** `packages/payload-canvas/src/admin/editor/inline.ts`, the list item join in `packages/payload-canvas/src/react/canvas/` (the editing element is not updated after the join).

### M2. Two people can edit Page settings at once, and one edit is lost without a message
- **Area:** multiplayer, Page settings drawer.
- **Repro:**
  1. User 2 opens the page in the builder and clicks **Page settings**.
  2. User 1 opens the same page and clicks **Page settings**. Neither user sees a "Document locked" dialog.
  3. User 1 adds " U1" to the title. Wait 4 s (autosave).
  4. User 2 adds " U2" to the title in the still-open drawer.
- **Expected:** user 2 sees the lock dialog in step 1 or 2. If not, user 2 sees "Someone changed this page. Reload to see their changes" when the save fails.
- **Actual:**
  - No lock dialog for either user.
  - User 2's autosave gets `409 PATCH /api/pages/189?autosave=true`. The drawer still says "Last saved less than a minute ago" and shows "… renamed U2".
  - The server keeps "… renamed U1". User 2's change is lost, and nothing tells them.
- **Screenshots:** `78-u2-settings-locked.png` (no lock), `81-u2-stale-save.png` (drawer after the rejected save)
- **Likely files:** `packages/payload-canvas/src/live/fieldsGuard.ts` (sends the 409), `packages/payload-canvas/src/admin/editor/topbar/settingsDrawer.tsx` (no handling of the 409, and the lock is not shown for the drawer).

---

## Minor

Builder and editor:

- **m1. Focus is lost after you insert a block with the "+" picker.**
  - Repro: hover between two blocks, click **+**, type `Heading`, press Enter. Then type.
  - Expected: focus goes to the new block's first field (as report 1, p4, says it was fixed).
  - Actual: focus is on `<body>`. The typed text goes nowhere. After a click-insert from the Blocks tab, focus stays on the library button.
  - Screenshot: `12-after-plus-insert.png`
  - Files: `packages/payload-canvas/src/admin/editor/insert/`, `actions.ts`
- **m2. Undo steps in inspector text fields are unpredictable.**
  - Repro A: in a Menu block, fill 3 labels and 3 URLs, about 0.2 s apart. Press Ctrl+Z once. All six values are undone, and Undo turns grey.
  - Repro B: type " Q1" in a Quote, wait 2.5 s, type " T1" in a Text, wait 2.5 s, press Ctrl+Z. Only the "1" goes. The next Ctrl+Z removes " T".
  - Expected: one undo step per field edit (a pause or a field change starts a new step).
  - Screenshots: `42-menu-after.png`
  - Files: `packages/payload-canvas/src/admin/editor/store.ts` (merge window), `fields/`
- **m3. When two people type in the same field, one person's letters disappear, but the banner says "Changes merge live".**
  - Repro: both users select the same Quote and type in its field at the same time (user 1 "AB", user 2 "ab").
  - Actual: both end with "…ab". User 1's "AB" is gone. The inspector banner says "builder-dev is editing this block. Changes merge live."
  - Last write wins per prop is the documented design, so the problem is the message. Say "Changes to the same field overwrite each other".
  - Screenshot: `77-u2-follow-click.png` (the banner)
  - File: `packages/payload-canvas/src/admin/editor/live/` (presence banner text)
- **m4. Manual zoom stays on when you change the device, and Fluid then shows the wrong breakpoint.**
  - Repro: Desktop, click **Zoom out** twice (33 %). Click **Tablet**, then **Fluid**.
  - Actual: Tablet shows at 33 % with empty space around it. Fluid renders a 2485 px frame (2xl layout) at 33 %, not the 820 px md layout. You must click the zoom chip to get back.
  - Expected: a device button or Fluid resets zoom to Fit.
  - Screenshot: `53-resize-dragging.png` (Tablet at 33 %)
  - File: `packages/payload-canvas/src/admin/editor/Canvas.tsx`
- **m5. Version compare shows the whole layout as changed JSON.**
  - Repro: **…** > **Versions** > open an autosave version. "Modified only" is ticked.
  - Actual: the Builder field is two full JSON dumps, hundreds of lines, all highlighted. An editor cannot find the one changed quote.
  - Expected: a short list such as "Quote: text changed", or a diff of only the changed lines.
  - Screenshot: `70-version-compare.png`
  - Files: the layout field's version diff component (Payload's JSON diff is used as is)
- **m6. The API drawer's URL contains `locale=undefined`.**
  - Repro: **…** > **API**.
  - Actual: `http://localhost:3300/api/pages/189?depth=2&draft=false&locale=undefined&trash=false`.
  - Screenshot: `73-api-drawer.png`
  - File: `packages/payload-canvas/src/admin/editor/topbar/screens/`
- **m7. A post that renders through a template opens in the builder as "This page is empty".**
  - Repro: open `/admin/builder/posts/35` ("Designing with blocks").
  - Actual: empty canvas and "This page is empty. Add a section or a block from the Add panel." Nothing says that the site shows this post through "Post template", or what happens if you add blocks here.
  - Expected: "This post uses Post template" with a link to edit the template, and one line on how own blocks relate to the template.
  - Screenshot: `112-builder-posts.png`
  - Files: `packages/payload-canvas/src/admin/editor/Canvas.tsx` (empty state), `Outline.tsx`
- **m8. The "Paste inside or after" menu item is enabled when nothing is copied.**
  - Repro: in a new browser session, right-click a block. Click **Paste inside or after**.
  - Actual: nothing happens and no message shows.
  - Expected: the item is disabled, or a toast says "Nothing to paste. Copy a block first."
  - File: `packages/payload-canvas/src/admin/editor/menu/`
- **m9. Escape during a drag also clears the selection.**
  - Repro: select a block, drag its grip, press Escape before you release.
  - Actual: the drag cancels and the block is no longer selected. The action bar is gone.
  - Screenshot: `60-smooth-cancel.png`
  - File: `packages/payload-canvas/src/admin/editor/shortcuts.ts`
- **m10. An intermittent hydration error in the builder.**
  - Seen twice in about 30 builder loads: "Hydration failed because the server rendered HTML didn't match the client". Both times the Sections tab had been opened (the thumbnail iframe loads then). Not reproduced on demand, so the component is not known.
  - Files: start with `packages/payload-canvas/src/react/canvas/thumbnail/` and the `?mode=thumbnail` canvas route.

AI assistant (3 real requests and 1 real image):

- **m11. The reply shows a raw tool error.**
  - Repro: "Add a short FAQ section with three questions about pricing at the end of the page."
  - Actual: the reply lists a red step: `Could not insert FAQ: Parent block "__PAGE_ROOT__" not found. Use parentId null for the page root, or a block id from getLayout.` The model then retried and succeeded.
  - Expected: retries that succeed are hidden, or shown as "Retried". Commit fa6445d ("root parent ids from models") does not cover `__PAGE_ROOT__`.
  - Screenshot: `107-ai-stopped.png` (shows the first reply)
  - Files: `packages/payload-canvas/src/ai/` (parent id repair), `admin/editor/assistant/`
- **m12. The assistant's changes happen off screen.**
  - The panel says "The assistant edits this page on the canvas as you watch". The FAQ was added at the end and the image was set lower on the page, but the canvas stayed at the top both times.
  - Expected: the canvas scrolls to each changed block, or offers "Show".
  - Screenshots: `105-ai-faq-midway.png`, `109-ai-image-done.png`
- **m13. The conversation is gone after a reload.** The undo of a reply goes with it (the undo history also resets on reload). Expected: the chat stays for the session, or the panel says that a reload clears it.

Accessibility:

- **m14. Low contrast in the editor chrome.** axe (WCAG 2 A/AA) at 1440x900 finds 31 `color-contrast` violations: grey labels `#808080` on white (3.94:1), for example `.builder-bar__crumb` and field sub-labels, and the breakpoint badge `#1587ba` on `#deeef5` (3.39:1). Data: `qa2\axe-builder.json`.
- **m15. Controls without names, and modals without a dialog role.**
  - The upload field's edit and remove icon buttons, and the array row drag handles, have no accessible name.
  - The "Link to", "Collection" and "Sort" selects are comboboxes with no name.
  - The Revert confirmation and the "Save as section" form have no `role="dialog"` or `alertdialog`.
  - The upload, array and select controls come from Payload, so some fixes may need wrappers or labels.
  - Files: `fields/renderField.tsx`, `menu/` confirmations, `sections/` save dialog
- **m16. Two collaborators both show as "BD".** Each user sees the other as "BD", which is also their own initials. The name is only in the tooltip. Report 1 m10 says "BD, BD2"; that did not show here with two people. File: `packages/payload-canvas/src/admin/editor/live/PresenceUI.tsx`.
- **m17. Undo after a list editing session is several steps.** Report 1 and the architecture say one editing session is one undo step. After typing in a list, pressing Enter twice and Backspace, one Ctrl+Z after Escape undid only the last Backspace. Screenshot: `19-list-editing.png`. File: `inline.ts` (`mergeWithin` does not cover the structure operations of a list).

---

## Polish

- **p1.** Old wording "Add panel" is still used. The empty canvas says "Add a section or a block from the Add panel." The Save as section form says "finds it under Add › Sections › Saved." The panels are now the Blocks and Sections tabs. Screenshots: `01-empty-page.png`, `82-save-as-section-dialog.png`.
- **p2.** The "Collection list" tile in the Blocks tab reads "Collectio…". Screenshot: `01-empty-page.png`.
- **p3.** The block name chip covers text. On the top block the chip covers the start of the heading ("H̶e̶ading"). The "Editing text · Esc to finish" chip and the collaborator's name chip cover the block above. Screenshots: `03-heading-inserted.png`, `24-list-merge-slow.png`, `77-u2-follow-click.png`.
- **p4.** The drag card shows the block type ("Stack"), not its name ("Card grid"). Screenshot: `57-drag-big-block-top.png`.
- **p5.** "Save as section" gives no confirmation. The form closes, and the section appears only in the Sections tab.
- **p6.** The template preview button reads "Post template · previewing …" on every template for posts. A template named "Post template" also exists, so the label reads like the wrong template is open. Screenshot: `92-sample-picker.png`.
- **p7.** The Generate image form shows the raw model id `black-forest-labs/flux.2-klein-4b` and no cost hint. Screenshot: `104-generate-image-dialog.png`.
- **p8.** A Field block that shows rich text (post Content) has no styling: headings and list bullets look like plain lines until you add classes. Screenshot: `90-field-content.png`.
- **p9.** An empty Collection list is a striped box with no text. Nothing says "Add blocks here to design one item". Screenshot: `91-collection-list.png`.
- **p10.** The Versions list shows the same minute on most rows, with no author or summary. Only the ID tells them apart. Screenshot: `69-versions-drawer.png`.
- **p11.** Opening Versions writes `?limit=10` into the builder's own URL (`/admin/builder/pages/189?limit=10`).
- **p12.** Stop gives no feedback. After Stop, the message silently goes back into the text box, and the conversation shows no "Stopped" line. Screenshot: `107-ai-stopped.png`.
- **p13.** In Layers, a rich text row label stops at the first link ("Rich paragraph with a").
- **p14.** **Show** in the publish problem list selects the block but does not focus the empty field. Screenshot: `64-publish-problems.png`.
- **p15.** At 1440x900 the color picker popover cuts off the palette rows at the bottom, and it covers the State control. Screenshot: `30-color-picker.png`.
- **p16.** Once, right after an entrance preset was picked, the selection box stayed 24 px below the Button (the fade-up distance). It was correct after a later Preview. Screenshot: `35-motion-entrance-set.png`.
- **p17.** The "Drag and drop style" button's tooltip does not say which style is on. You must open the menu to see it.

---

## What worked well

- Left panel: Alt+1/2/3, drag from Blocks to the canvas, and a drag that rests on the Layers tab opens it and drops into the tree.
- The "+" between blocks: correct spot, the picker filters as you type, and Enter inserts at that spot.
- Context menus on canvas and Layers are complete: rename (F2), move, duplicate, copy, paste, copy/paste styles, hide, save as section, delete, with shortcuts shown.
- Inline editing of headings, button labels and rich text. The rich text toolbar fits, Ctrl+B and Ctrl+K work, the link URL box opens, and one Ctrl+Z undoes the whole rich text session.
- Styles panel: Base UI selects, the Opacity slider (keys and drag), breakpoints, states, the box model. The "Overridden at md and wider" popover with **Edit md** and **Remove** fixes report 1 M3 well. Unknown classes are kept.
- Motion tab: presets, Preview, settings, the Layers "animated" mark, and **Play animations**.
- Arrays: add rows, collapse all, drag to reorder.
- Upload: **Choose from existing** and **Create New** both stay in the builder (report 1 M1 is fixed).
- Canvas: device modes, resize handles with a width chip, keyboard resize, the 320 px clamp, and no stray horizontal scrollbar at Fit.
- Both drag styles drop where they show. The large-block drag card works.
- Publish flow: the problem list names each block and marks it in Layers. Ctrl+Alt+P works. Publish, Changed, Revert (with confirmation), Unpublish, Versions, **Restore as draft** and the API drawer all work.
- Title rename (Enter saves, Escape cancels) updates the browser tab title.
- Multiplayer: presence avatars, live cursors, follow mode with "Esc to stop", and edits in different blocks reach both users in about 1 s.
- Saved sections: Save as section, a real thumbnail in the Saved group, Edit section full screen with Back. Pages keep their own copy.
- Templates: the binding picker lists only fitting fields with sample values, the heading follows the sample document, the sample picker marks "Other template", and "Number of items" now explains the 1-100 limit.
- Assistant: building a FAQ (15 s), one Ctrl+Z undoes the reply and redo restores it, Stop, New chat, image generation that places the image (media 80), and a clear "Use Claude Code or Codex" card.
- Media: "Used in" lists the page. Delete is refused with a clear toast that names the page.
- Site at 1440 and 390: every page returns 200 (404 page for `/nope`), with no console errors, no sideways scroll, correct titles and descriptions, and alt text on all images. The mobile menu opens and closes. The contact form shows inline errors with `aria-invalid`. Entrances, stagger, press and parallax play. With reduced motion, parallax and press stop and content shows. The skip link comes first in Tab order.
- Keyboard: Tab reaches the Layers tree, arrows move in it, Enter goes to the inspector, F2 renames, Shift+F10 opens the block menu, Escape returns focus to the row, and `?` lists the shortcuts.

## Status of items left open in report 1

- m14 (long words): fixed. New headings get `break-words`.
- m30 ("Number of items"): fixed. It shows "Enter a number from 1 to 100".
- m32 (sample picker): fixed. Rows say "Other template".
- p8 (Save as section): fixed.
- D5 ("+" between blocks, real thumbnails): fixed.
- Dm6 (Publish shortcut): fixed (Ctrl+Alt+P).
- p11 (new Stack, Text and Menu blocks touch the frame edge): still open. Screenshot: `05-after-drag-text.png`.
- m6, m7, m12: not re-tested.

## Not tested

- **Field access (hidden or locked fields):** the access demo block is off (`NEXT_PUBLIC_BUILDER_ACCESS_DEMO` is not set), so no block has access rules.
- **Inspector Generate (real call):** the one allowed real image was spent through the assistant. The form was opened, not submitted.
- **Contact form submission:** only validation was tested, so no form-submissions record was created.
- **Templates "Default template" and publishing a template:** not done, to leave the live Post template untouched.
- **Saved section Rename and Delete from the card menu:** the section was deleted over REST during cleanup.
- **Offline, reconnect and the "deleted the block you had selected" warning:** covered in report 1, not repeated.
- **Localization, Video block URLs, Form block relationship picker, legacy Payload blocks:** out of the time spent.
- **axe on the public site:** not run this round.

## Test data left behind

- Media 80 (`ai-a-single-handmade-ceramic-coffee-cup-fil-fufbvp.jpg`), made by the assistant's image tool. It is not used by any document now. Delete it if not wanted.
- Nothing else. Page 189, template 16, saved section 13 and media 79 are deleted permanently.

## Fix status

### Site items (agent D, 2026-10-06)

- **Site findings in this report:** none were open. The site passed this round (see "What worked well").
- **p8** (Field block rich text without styling): not changed. The post template's Field block already uses `prose prose-lg`; a Field block added without classes shows plain text. Styling it by default belongs in `packages/payload-canvas/src/react/components/Field.tsx`, outside the site files.
- Site items from `design-critique-2.md` (hero first paint, help texts, images, post page, button and form mismatches): see its "Fix status" section.

### Editor items (agent B, 2026-10-06)

- **m1** (focus lost after inserting a block): root cause fixed in `Inspector.tsx`. The focus request is cleared inside the animation frame, so the re-render no longer cancels the frame before the field gets focus. Agent A adds a fallback in `insert/`.
- **m7** (post with a template opens as an empty page): fixed. The empty canvas says "This post uses the template “Post template”", explains that blocks added here do not show while a template applies, and offers "Open the template" and "Add blocks here anyway" (`empty/EmptyStart.tsx`). The template is found with the same rule as `loadTemplate`: the post's own template, else the newest published default with blocks.
- **m8** ("Paste inside or after" with nothing copied): fixed. The item is grey until a block was copied in this browser.
- **m14** (low contrast): fixed. axe reports 0 violations on the builder (heading, styles, button, image and empty page screens) in light and dark. See `design-critique-2.md`, "Fix status".
- **m15** (names and dialog roles): partly fixed.
  - Payload's icon-only controls in the inspector get names: upload "Edit file" and "Remove file", "Create new", array "Drag to reorder" and "Row actions". "Link to", "Collection", "Sort" and other react-select inputs are named by their field label. react-select's hidden chevron and clear buttons leave the tab order. A popup wrapper around a real button is no longer a second button (`ui/payloadA11y.ts`).
  - Payload's confirmation modals are `<dialog>` elements with a focus trap, but were named by their slug. `useModalA11y` (`ui/modalA11y.ts`) names them by their heading and text, and makes Delete an `alertdialog`. Used in the saved-section dialogs. The Revert and Unpublish confirmations (`topbar/DocumentActions.tsx`) and the drawer's confirmation (`topbar/screens/ScreenDrawer.tsx`) are agent C's files; the hook is handed over.
- **p1** (old "Add panel" wording): fixed, also in the "Save as section" dialog and toast.
- **p2** ("Collectio…" tile): fixed, labels wrap to two lines.
- **p13** (rich text row name stops at a link): fixed. The row shows the first paragraph with its link text.
- **p15** (color picker cut off): fixed. A popover that fits neither below nor above moves up until it fits.
- **p3, p17**: not changed (overlay chip placement and `Canvas.tsx` are outside these files).

### Top bar, drawers, assistant and live items (agent C, 2026-10-06)

Screenshots: `%TEMP%\fix3c\` (`m2-*`, `c-*`, `d-*`, `e-*`). Test documents "ZZ test fix3c …" are deleted.

- **M2** (lost change in Page settings): fixed. Tested with two users in the browser.
  - Cause: Payload's form takes the document lock only at the first change, and Payload deletes the lock after every save of the lock holder. With a 300 ms autosave the lock was gone almost all the time, so nobody saw the "Document locked" dialog.
  - The settings drawer now takes the lock when it opens and gives it back when it closes, when the builder is left, or when the tab closes (`POST`/`DELETE …/settings-lock`, `live/document.ts`; `takeSettingsLock`/`releaseSettingsLock` in `live/fieldsGuard.ts`). While the drawer is open, the owner's own autosaves keep the lock (`keepLockBeforeOperation` in `plugin/hook.ts`). The builder view itself still never takes the lock.
  - Result: the second person to open Page settings gets Payload's "Document locked" dialog with the other person's name. "Go back" closes the drawer and stays in the builder (it used to go to the Pages list). "Take over" works: the first person then gets Payload's "taken over" dialog.
  - If the lock is gone anyway (expired, server restart), the stale save is still rejected with 409. Now the drawer shows a red banner above the fields: "Not saved. builder-dev@local.test changed Title after you opened this form. Your text is still in the form", with **Reload with their changes**. The typed text stays in the form until the user reloads. Payload's toast also shows. Each changed field gets the error in the 409 response (`staleSaveErrors`).
  - The drawer is 720 px wide (was 1040 px), so the canvas stays visible.
- **m5** (version compare is a JSON dump): fixed. The Builder field shows "2 changes: 1 moved, 1 changed", then one row per block: Added, Removed, Moved (from position 3 to 1, or to another parent) and Changed, with the block name and each changed setting as old → new text. "Show JSON" opens Payload's word diff of both layouts. The generated CSS field no longer shows in the compare view. Files: `admin/diff/` (`changes.ts` with 14 tests, `LayoutDiff.tsx`, `LayoutJsonDiff.tsx`, `NoDiff.tsx`), registered in `plugin/index.ts`.
- **m6** (`locale=undefined` in the API drawer): fixed. Without localization the shown URL and the copied URL have no `locale` parameter. With localization the API screen opens in the locale the canvas shows. Payload's API screen always adds `locale=${code}`, so the drawer cleans the link (`ScreenDrawer.tsx`, `withoutUndefinedLocale`).
- **m11** (raw tool error): fixed, unit-tested. `isRootParentId` accepts `__PAGE_ROOT__`, `page-root`, `root_page`, `$root`, `<root>`, `pageRoot` and similar, never a real block id. The MCP `applyOperations` tool repairs root parent ids too. A failed tool call shows a short chip ("Retried: Insert FAQ" when a later call fixed it, else "Could not insert FAQ"); the raw text is only under "Details".
- **m12** (changes off screen): fixed, unit-tested. After each operation batch the canvas scrolls to the first changed block (at most once per second) and flashes it. A "Show" button on the tool chip selects and scrolls to the block.
- **m13** (conversation gone after reload): fixed, unit-tested. The chat was saved, but a missing `provider` field made every adapter except Anthropic drop it on reload. A restored chat says "Undo of earlier replies is not available after a reload."
- **p12** (Stop gives no feedback): fixed. The conversation shows "Stopped. Your message is back in the box."
- **p11** (`?limit=10` in the builder URL): the builder URL comes back when the drawer closes (checked). While the Versions drawer is open, Payload's list still writes its query into the URL.
- **m15** (dialog roles, the part in these files): the Revert, Unpublish and Restore confirmations are `alertdialog`s named by their heading and described by their text (checked in the browser).
- Not done: m11, m12, m13 and p12 are not checked in the browser, because the fake AI adapter needs `BUILDER_AI_FAKE=1` and a server restart. Grouped shortcuts (critique) need a group per entry in `shortcuts.ts`, which is outside these files. p10 (Versions list rows) is Payload's own list.
- Found while testing, not in these files: `GET /api/builder-templates?where[targetCollection][equals]=pages…` answers 500 on every page in the builder. The request comes from `empty/EmptyStart.tsx`. Pages are probably not an allowed template target, so the select filter fails in Postgres.

### Canvas, inline editing, undo and presence items (agent A, 2026-10-06)

Tested in Chrome with real keys and mouse (scripts in `%TEMP%\fix3a\`). All "ZZ test fix3a" pages are deleted.

- **M1** (Backspace join loses text): fixed. The canvas starts editing the joined item only after it shows the admin's newest layout (`BuilderCanvas.tsx`, layouts are numbered as they arrive). The item shows "AlphaBeta" at once, and typed text goes in at the join point ("AlphaXBeta"). Letters typed in the short wait after Enter or Backspace are kept and typed into the new item; Backspace and Delete in that wait do nothing, so they no longer delete the new block. Checked at 30 ms per key: "Two", Enter, "Three", Home, Backspace, "Y" gives "TwoYThree".
- **m17** (list editing is several undo steps): fixed. Typing, Enter, Backspace and the typing in the new items form one undo step until editing ends (`inline.ts` list runs, store groups). One Ctrl+Z undoes the whole run; redo restores it.
- **m1** (focus after "+" insert): fixed by agent B's `Inspector.tsx` change; checked: after "+", "Heading", Enter, typing goes into the new heading's Text field, and a click in the Blocks tab focuses the new Quote's field. No extra fallback was needed.
- **m2** (inspector undo): fixed. One undo step per field: a pause of 1 s or leaving the field starts a new step, and two fields never merge, also two fields of one array row (`fields/undoPath.ts`). Ctrl+Z and Ctrl+Shift+Z in an inspector text input run the editor's undo, not the browser's. Checked: three labels and three URLs give six steps; " Q1" then " T1" undo as " T1", then " Q1".
- **m3** (same-field typing): the banner now says "Changes sync live. If you both type in the same field, the last change wins." Awareness carries the field a person types in (inspector focus or inline editing). The inspector shows "builder-dev2 is editing this field." under that field, and the canvas tag reads "builder-dev2 · typing". No field lease: a lease needs the server to refuse writes and makes a field lock under a person's hands; last write wins per prop stays the design.
- **m4** (zoom after device change): fixed. Picking a device or Fluid resets the zoom to Fit. Fluid always fills the stage at 100 %; its zoom buttons are off.
- **m10** (hydration error): reproduced in 20 of 100 loads of `/builder-canvas`, in Next's metadata outlet. Cause: the canvas layout put `<ThemeStyle live />` inside an explicit `<head>`; `live` adds a client component there. The layout now renders it at the start of `<body>` (React still moves the tags into the head). 0 of 160 loads fail now. Both READMEs say so.
- **m16** (both users "BD"): fixed. Initials are made unique against your own name too: builder-dev sees "BD2", builder-dev2 sees "BD".
- **p16** (selection box 24 px off after a preset): fixed. The canvas measures again when a preview ends and when Play animations stops.
- **p17** (drag style tooltip): fixed. The tooltip names the style that is on.
- **Design critique "+" on the selected frame**: the "+" is not offered on the selected block's own edges (within 4 screen px); the neighbour's edge still offers that spot. Unit-tested in `insert/spots.test.ts`.
- **Design critique, presence frames**: another person's frame on your own selection draws 3 px outside your frame.
- **Empty page text**: removed from the canvas (`BuilderCanvas.tsx`); agent B's start screen covers it.
- **p3**: not changed (`Overlay.tsx`).

### Leftovers (agent E, 2026-10-06)

- **p8** (Field block rich text without styling): fixed. A Field block with rich text and no `prose` class now gets `prose max-w-none` (`FIELD_CLASS_MAP` in `blocks/defaults.ts`, listed in the field block's `classes`; used in `payload-canvas/src/react/components/Field.tsx`). A block that has a `prose` class keeps its own. Unit-tested in `templates.test.ts`.
- **p3** (name chips cover text): fixed in `Overlay.tsx` and `editor.scss`. A tag sits above the block when there is room (as before). When there is none, it now sits under the block (`builder-editor__tag--below`) instead of inside, so it no longer covers the block's first line. It stays inside only when the bottom edge is out of view or the action bar is under the block (narrow block); a block scrolled up past the view keeps its inside tag at the top of the view. Checked in the browser: the top heading's tag sits under the heading (hover, selection, collaborator and "Editing text" tags share the logic). Not changed: a tag above a block still overlaps the bottom 20 px of the block before it when the two touch. Screenshots: `%TEMP%ix3e\overlay-*.png`.

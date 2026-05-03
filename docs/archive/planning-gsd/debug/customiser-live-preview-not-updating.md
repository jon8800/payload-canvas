---
status: resolved
trigger: "Editing block fields in customizer view does not update live preview iframe"
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - two bugs found and fixed
test: code analysis confirmed missing postMessage sync and broken URL origin check
expecting: after fix, iframe receives form data via postMessage and triggers route refresh on save
next_action: awaiting human verification

## Symptoms

expected: When editing a block's text field in the customizer right panel, changes should immediately reflect in the live preview iframe
actual: Live preview iframe does not update when editing block fields. Shows "Save the document with a title to enable preview" or stale content. Default edit view's live preview works fine.
errors: None observed in console
reproduction: 1) Create page, add Heading block, 2) Switch to Customiser tab, 3) Select Heading block in left sidebar, 4) Edit Text field in right panel, 5) Observe live preview doesn't update
started: Has likely never worked correctly - ported from a plugin

## Eliminated

## Evidence

- timestamp: 2026-03-15T00:01:00Z
  checked: Payload's built-in LivePreviewWindow (node_modules/@payloadcms/ui/dist/elements/LivePreview/Window/index.js)
  found: Uses useAllFormFields() to get formState, then useEffect sends postMessage to iframe with reduceFieldsToValues(formState) whenever formState changes
  implication: This is the mechanism that makes live preview update in real-time

- timestamp: 2026-03-15T00:02:00Z
  checked: Customizer's Preview component (apps/starter/src/views/customiser/LivePreview/Preview/index.tsx)
  found: Only renders iframe with URL. No useAllFormFields, no postMessage, no reduceFieldsToValues. Completely missing data sync.
  implication: This is why live preview never updates -- the data flow is missing entirely

- timestamp: 2026-03-15T00:03:00Z
  checked: generatePreviewPath utility
  found: Returns empty string when slug is empty. URL could be falsy for new pages without slug.
  implication: Secondary issue -- "Save the document with a title" message appears when URL is falsy

- timestamp: 2026-03-15T00:04:00Z
  checked: Customizer LivePreviewProvider vs Payload's LivePreviewProvider
  found: Customizer's provider stores fieldSchemaJSON but never uses it for postMessage. It lacks isLivePreviewing state entirely.
  implication: The customizer provider was ported for UI layout only, not for data sync

- timestamp: 2026-03-15T00:05:00Z
  checked: LivePreviewProvider message handler origin check
  found: url?.startsWith(event.origin) fails because url is relative ('/next/preview?...') while event.origin is absolute ('http://localhost:3000'). Payload's built-in provider uses formatAbsoluteURL to convert relative URLs.
  implication: appIsReady never becomes true, even if postMessage sync was added

- timestamp: 2026-03-15T00:06:00Z
  checked: Frontend RefreshRouteOnSave component
  found: Uses ready() to send {type:'payload-live-preview', ready:true} to parent. Listens for 'payload-document-event' to trigger router.refresh(). This is save-time refresh, not real-time data merging.
  implication: Live preview updates happen on save (via document-event), which is the expected behavior for RefreshRouteOnSave strategy

## Resolution

root_cause: Two bugs preventing live preview from working: (1) The customizer's Preview component was missing the postMessage data sync that Payload's built-in LivePreviewWindow provides -- no useAllFormFields, no reduceFieldsToValues, no postMessage to iframe. (2) The LivePreviewProvider stored the preview URL as a relative path (e.g., /next/preview?...) but the ready-message handler checks url?.startsWith(event.origin) where event.origin is absolute (e.g., http://localhost:3000), so appIsReady was never set to true.
fix: (1) Added LivePreviewSync component to Preview/index.tsx that mirrors Payload's LivePreviewWindow useEffect -- watches form state, serializes it, and sends postMessage to iframe. (2) Added formatAbsoluteURL to LivePreviewProvider to convert relative URLs to absolute, fixing the origin check.
verification:
files_changed:
  - apps/starter/src/views/customiser/LivePreview/Preview/index.tsx
  - apps/starter/src/views/customiser/LivePreview/Context/index.tsx

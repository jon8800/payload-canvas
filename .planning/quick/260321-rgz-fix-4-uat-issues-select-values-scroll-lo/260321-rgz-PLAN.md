---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/starter/src/components/admin/StylesPanel.tsx
  - apps/starter/src/components/admin/StylesPanel.scss
  - apps/starter/src/views/customiser/DocumentFields.scss
autonomous: true
requirements: [ISSUE-1, ISSUE-2, ISSUE-3, ISSUE-4]
must_haves:
  truths:
    - "Selecting a Base UI Select option updates the displayed trigger text to match the chosen label"
    - "Opening a Select dropdown does NOT lock page scrollbar"
    - "Sidebar fields have no extra left/right padding"
    - "Spacing section shows a Webflow-style nested bounding box with margin outer / padding inner"
  artifacts:
    - path: "apps/starter/src/components/admin/StylesPanel.tsx"
      provides: "Fixed StyledSelect, bounding box SpacingBoxControl"
    - path: "apps/starter/src/components/admin/StylesPanel.scss"
      provides: "Bounding box CSS styles"
    - path: "apps/starter/src/views/customiser/DocumentFields.scss"
      provides: "Padding override on sidebar-fields"
  key_links:
    - from: "StyledSelect"
      to: "Select.Root"
      via: "items prop + modal={false}"
      pattern: "items=.*modal.*false"
---

<objective>
Fix 4 UAT issues from Phase 12 testing: Base UI Select value display, scroll lock, sidebar padding, and Webflow-style spacing bounding box.

Purpose: Resolve all critical UI bugs blocking UAT sign-off.
Output: Working StylesPanel with correct select behavior and visual bounding box spacing control.
</objective>

<context>
@apps/starter/src/components/admin/StylesPanel.tsx
@apps/starter/src/components/admin/StylesPanel.scss
@apps/starter/src/views/customiser/DocumentFields.scss
@.planning/phases/12-ui-component-primitives/12-UAT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Select value display, scroll lock, and sidebar padding (ISSUE-1, ISSUE-2, ISSUE-3)</name>
  <files>apps/starter/src/components/admin/StylesPanel.tsx, apps/starter/src/views/customiser/DocumentFields.scss</files>
  <action>
**ISSUE-1 — Select value not displaying (CRITICAL):**

In `StyledSelect` component (~line 195), the root cause is that Base UI v1.3.0 `Select.Value` needs a way to map the raw value back to its label. Two changes needed:

1. Pass `items` prop to `Select.Root` so it can resolve value-to-label mapping:
   ```tsx
   <Select.Root value={value} onValueChange={(val, event) => onChange(val ?? '')} items={options} modal={false}>
   ```
   The `options` array already has `{ label, value }` shape which matches the `items` prop format.

2. The `onValueChange` callback signature in Base UI v1.3.0 is `(value, eventDetails)` — the current code `(val) => onChange(val ?? '')` works but confirm the val is the string value directly (it is, since Item values are strings).

**ISSUE-2 — Scroll lock:**

Add `modal={false}` to the `Select.Root` in `StyledSelect`. This is already included in the items fix above. The `modal` prop defaults to `true` which adds `overflow: hidden` to body.

**ISSUE-3 — Sidebar padding:**

In `DocumentFields.scss`, add padding overrides to the `&__sidebar-fields` rule:
```scss
&__sidebar-fields {
  width: 100%;
  padding-left: 0 !important;
  padding-right: 0 !important;
}
```
  </action>
  <verify>Open the admin customiser, confirm: (1) selecting a value from any dropdown shows the label in the trigger, (2) page scrollbar remains visible when dropdown is open, (3) sidebar content has no extra left/right padding.</verify>
  <done>Select triggers display chosen label text. Page scroll is not locked. Sidebar has zero horizontal padding.</done>
</task>

<task type="auto">
  <name>Task 2: Replace spacing controls with Webflow-style bounding box (ISSUE-4)</name>
  <files>apps/starter/src/components/admin/StylesPanel.tsx, apps/starter/src/components/admin/StylesPanel.scss</files>
  <action>
**Replace the SpacingControl component** with a new `SpacingBoxControl` component that renders a nested bounding box visual (Webflow-style).

**In StylesPanel.tsx:**

1. Remove the existing `SpacingControl` component entirely (lines ~221-297).
2. Remove `UniformIcon` and `PerSideIcon` SVG components (no longer needed).
3. Create a new `SpacingBoxControl` component:

```tsx
function SpacingBoxControl({ styles, onUpdate }: { styles: StylesData; onUpdate: (path: string[], value: unknown) => void }) {
  const getVal = (group: 'margin' | 'padding', dir: string): string => {
    const g = styles[group] as SpacingGroup | undefined
    if (!g) return ''
    const d = g[dir as keyof SpacingGroup]
    return d?.base ?? ''
  }

  const handleChange = (group: 'margin' | 'padding', dir: string, val: string) => {
    if (val === '' || val === 'none') {
      onUpdate([group, dir], undefined)
      return
    }
    onUpdate([group, dir, 'base'], val)
  }

  return (
    <div className="spacing-box">
      <div className="spacing-box-margin">
        <span className="spacing-box-label">MARGIN</span>
        <input className="spacing-box-input spacing-box-input--top" type="text" value={getVal('margin', 'top')} onChange={(e) => handleChange('margin', 'top', e.target.value)} placeholder="0" />
        <input className="spacing-box-input spacing-box-input--right" type="text" value={getVal('margin', 'right')} onChange={(e) => handleChange('margin', 'right', e.target.value)} placeholder="0" />
        <input className="spacing-box-input spacing-box-input--bottom" type="text" value={getVal('margin', 'bottom')} onChange={(e) => handleChange('margin', 'bottom', e.target.value)} placeholder="0" />
        <input className="spacing-box-input spacing-box-input--left" type="text" value={getVal('margin', 'left')} onChange={(e) => handleChange('margin', 'left', e.target.value)} placeholder="0" />

        <div className="spacing-box-padding">
          <span className="spacing-box-label">PADDING</span>
          <input className="spacing-box-input spacing-box-input--top" type="text" value={getVal('padding', 'top')} onChange={(e) => handleChange('padding', 'top', e.target.value)} placeholder="0" />
          <input className="spacing-box-input spacing-box-input--right" type="text" value={getVal('padding', 'right')} onChange={(e) => handleChange('padding', 'right', e.target.value)} placeholder="0" />
          <input className="spacing-box-input spacing-box-input--bottom" type="text" value={getVal('padding', 'bottom')} onChange={(e) => handleChange('padding', 'bottom', e.target.value)} placeholder="0" />
          <input className="spacing-box-input spacing-box-input--left" type="text" value={getVal('padding', 'left')} onChange={(e) => handleChange('padding', 'left', e.target.value)} placeholder="0" />
        </div>
      </div>
    </div>
  )
}
```

4. In the main `StylesPanel` render, replace the spacing section:
   - Remove the two `<SpacingControl>` instances.
   - Replace with: `<SpacingBoxControl styles={styles} onUpdate={handleUpdate} />`
   - Keep the `.spacing-section` wrapper div.

**Input behavior:**
- Inputs accept preset token strings (xs, sm, md, lg, xl, 2xl, none) OR numeric px values.
- Empty string or "0" clears the value (sets to undefined).
- Placeholder "0" shows when no value is set.

**In StylesPanel.scss:**

Replace `.spacing-control*` styles with bounding box styles:

```scss
.spacing-box {
  padding: 8px 10px;
}

.spacing-box-margin {
  position: relative;
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  grid-template-rows: 28px 1fr 28px;
  align-items: center;
  justify-items: center;
  background: var(--theme-elevation-100);
  border: 1px dashed var(--theme-elevation-300);
  border-radius: 4px;
  min-height: 120px;
  padding: 4px;
}

.spacing-box-padding {
  position: relative;
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  grid-template-rows: 28px 1fr 28px;
  align-items: center;
  justify-items: center;
  grid-column: 1 / -1;
  grid-row: 2;
  width: 100%;
  background: var(--theme-elevation-50);
  border: 1px dashed var(--theme-elevation-250, var(--theme-elevation-200));
  border-radius: 3px;
  min-height: 60px;
  padding: 4px;
}

.spacing-box-label {
  position: absolute;
  top: 4px;
  left: 8px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-elevation-500);
  pointer-events: none;
}

.spacing-box-input {
  width: 36px;
  height: 22px;
  text-align: center;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--theme-text);
  padding: 0 2px;
  outline: none;

  &::placeholder {
    color: var(--theme-elevation-400);
  }

  &:hover {
    border-color: var(--theme-elevation-300);
  }

  &:focus {
    border-color: var(--theme-elevation-400);
    background: var(--theme-elevation-0);
  }

  &--top {
    grid-column: 2;
    grid-row: 1;
  }

  &--right {
    grid-column: 3;
    grid-row: 2;
  }

  &--bottom {
    grid-column: 2;
    grid-row: 3;
  }

  &--left {
    grid-column: 1;
    grid-row: 2;
  }
}
```

Remove the old spacing control styles: `.spacing-control`, `.spacing-control-header`, `.spacing-control-label`, `.spacing-mode-toggle`, `.spacing-control-uniform`, `.spacing-control-perside`, `.spacing-side`, `.spacing-side-label`.
  </action>
  <verify>Open admin customiser, confirm: (1) nested bounding box renders with MARGIN outer / PADDING inner, (2) typing values into edge inputs updates the styles data, (3) dark theme consistent backgrounds, (4) compact and centered layout.</verify>
  <done>Webflow-style spacing bounding box renders correctly with 8 number inputs (4 margin edges, 4 padding edges), labels "MARGIN" and "PADDING" visible, dark themed backgrounds, values persist when typed.</done>
</task>

</tasks>

<verification>
1. All 4 select dropdowns in panel (spacing preset selects are now gone, but border/typography/color selects remain) show selected label after choosing an option
2. No scroll lock on body when any select dropdown opens
3. Sidebar has flush edges (no 26px padding)
4. Bounding box shows nested margin/padding with 8 editable inputs
</verification>

<success_criteria>
All 4 UAT issues resolved: select value display works, scroll lock removed, sidebar padding zeroed, spacing section shows Webflow bounding box.
</success_criteria>

<output>
After completion, update `.planning/phases/12-ui-component-primitives/12-UAT.md` to mark issues as resolved.
</output>

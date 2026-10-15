'use client'

// Opens the settings drawer at one field: a page region's "Edit fields", or a publish problem of
// a document field. Payload's document drawer has no option for this, so it opens the tabs on the
// way and focuses the field's element (`field-<path>`, with `-<depth>` inside a drawer). When
// Payload's markup changes, the drawer still opens, at its top.

/** The field the settings drawer opens at. `tabs`: the labels of the tabs that hold it, outermost first. */
export type SettingsFocus = { path: string; tabs: readonly string[] }

const TIMEOUT_MS = 5000
const RETRY_MS = 100

/** The id Payload gives a field's element: dots become "__". */
export const fieldElementId = (path: string) => `field-${path.replace(/\./g, '__')}`

/** True for Payload's id of the field: `field-title`, or `field-title-2` in a drawer. */
export function isFieldElementId(id: string, path: string): boolean {
  const base = fieldElementId(path)
  return id === base || (id.startsWith(base) && /^-\d+$/.test(id.slice(base.length)))
}

/** Finds the field in the drawer `slug` and focuses it. Gives up quietly after a few seconds. */
export function focusDrawerField(slug: string, focus: SettingsFocus) {
  const started = Date.now()
  const opened = new Set<string>()
  const step = () => {
    if (Date.now() - started > TIMEOUT_MS) return
    const drawer = document.getElementById(`close-drawer__${slug}`)?.closest<HTMLElement>('.drawer')
    if (!drawer) {
      window.setTimeout(step, RETRY_MS)
      return
    }
    for (const label of focus.tabs) {
      if (opened.has(label)) continue
      const tab = [...drawer.querySelectorAll<HTMLButtonElement>('.tabs-field__tab-button')].find((button) => button.textContent?.trim().startsWith(label))
      if (!tab) break
      opened.add(label)
      if (!tab.classList.contains('tabs-field__tab-button--active')) {
        tab.click()
        window.setTimeout(step, RETRY_MS)
        return
      }
    }
    const field = [...drawer.querySelectorAll<HTMLElement>('[id^="field-"]')].find((el) => isFieldElementId(el.id, focus.path))
    if (!field) {
      window.setTimeout(step, RETRY_MS)
      return
    }
    field.scrollIntoView({ block: 'center' })
    const input = field.matches('input, textarea, select, button') ? field : field.querySelector<HTMLElement>('input, textarea, [contenteditable="true"], button')
    input?.focus({ preventScroll: true })
  }
  step()
}

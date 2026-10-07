'use client'

// Accessible names for Payload's field controls in the inspector. Payload renders some icon-only
// buttons and react-select inputs without a name (upload edit and remove, array drag handles,
// "Link to" and other selects). This hook names them from their field label, once they appear.
// Remove a rule here when Payload names the control itself.

import { useEffect, type RefObject } from 'react'

/** Icon-only Payload buttons and the name they get. */
const BUTTON_NAMES: [selector: string, name: string][] = [
  ['.upload-relationship-details__edit', 'Edit file'],
  ['.upload-relationship-details__remove', 'Remove file'],
  ['.relationship-add-new__add-button', 'Create new'],
  ['.collapsible__drag', 'Drag to reorder'],
  ['.array-actions .popup-button', 'Row actions'],
]

/** The field's visible label: the `label` of the closest field wrapper. */
function fieldLabel(el: Element): string | null {
  const field = el.closest('.field-type')
  const label = field?.querySelector('.field-label, label')?.textContent?.replace(/\*$/, '').trim()
  return label || null
}

function nameControls(root: HTMLElement) {
  for (const [selector, name] of BUTTON_NAMES) {
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      // Their only text is a hidden tooltip, so the label is set even when textContent is not empty.
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', name)
    }
  }
  // A popup whose custom trigger is a real button: the wrapper is not a second button around it.
  for (const wrapper of root.querySelectorAll<HTMLElement>('.popup-button--custom[role="button"]')) {
    if (!wrapper.querySelector('button, a[href], input')) continue
    wrapper.setAttribute('role', 'presentation')
    wrapper.removeAttribute('tabindex')
  }
  // react-select inputs: named by their field label.
  for (const input of root.querySelectorAll<HTMLInputElement>('input.rs__input:not([aria-label]):not([aria-labelledby])')) {
    const label = fieldLabel(input)
    if (label) input.setAttribute('aria-label', label)
  }
  // react-select marks its chevron and clear buttons aria-hidden but leaves them focusable.
  for (const el of root.querySelectorAll<HTMLElement>('[aria-hidden="true"]:is(button, [tabindex="0"])')) {
    el.setAttribute('tabindex', '-1')
  }
}

/** Names Payload's unnamed controls inside `ref`, also those that mount later. */
export function usePayloadControlNames(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        nameControls(root)
      })
    }
    nameControls(root)
    const observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [ref])
}

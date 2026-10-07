'use client'

// Payload's ConfirmationModal renders a `<dialog id={slug}>` with a focus trap, but names it with
// its slug ("builder-section-dialog") and takes no aria props. This hook names it with its
// heading, describes it with its text, and makes a destructive confirmation an `alertdialog`.

import { useModal } from '@payloadcms/ui'
import { useEffect } from 'react'

/**
 * Call next to a `ConfirmationModal` with the same `modalSlug`. `alert`: the confirmation deletes
 * or overwrites something (Delete, Revert), so screen readers announce it as an alert dialog.
 */
export function useModalA11y(slug: string, { alert = false }: { alert?: boolean } = {}) {
  const { isModalOpen } = useModal()
  const open = isModalOpen(slug)
  useEffect(() => {
    if (!open) return
    const dialog = document.getElementById(slug)
    if (!dialog) return
    const heading = dialog.querySelector<HTMLElement>('h1, h2')
    if (heading) {
      heading.id ||= `${slug}-title`
      dialog.setAttribute('aria-labelledby', heading.id)
      dialog.removeAttribute('aria-label')
    }
    const body = dialog.querySelector<HTMLElement>('.confirmation-modal__content p')
    if (body) {
      body.id ||= `${slug}-text`
      dialog.setAttribute('aria-describedby', body.id)
    }
    if (alert) dialog.setAttribute('role', 'alertdialog')
    else dialog.removeAttribute('role')
  }, [open, slug, alert])
}

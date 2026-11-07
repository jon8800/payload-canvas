'use client'

import type { ComponentPropsWithoutRef } from 'react'

import { Icon } from '../icons'

type Props = Omit<ComponentPropsWithoutRef<'button'>, 'type'> & { readonly children: string }

/**
 * The inspector's quiet "+ Add …" action: a plus and a short label in muted text, no border.
 * Used under array rows, condition rows and URL filter rows, so every list adds rows the same way.
 */
export function AddButton({ children, className, ...rest }: Props) {
  return (
    <button type="button" className={`builder-add${className ? ` ${className}` : ''}`} {...rest}>
      <Icon name="plus" size={12} />
      {children}
    </button>
  )
}

/** The small "×" that removes one row (a condition, a URL filter). */
export function RemoveRowButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" className="builder-where__remove" aria-label={label} onClick={onClick}>
      <Icon name="close" size={12} />
    </button>
  )
}

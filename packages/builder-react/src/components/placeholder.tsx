import type { CSSProperties, ReactNode } from 'react'

// Canvas-only stand-ins for empty blocks, so they have a size and can be selected.
// Inline styles only: the site's CSS never sees them, and the site renders nothing instead.

const MUTED: CSSProperties = { opacity: 0.4 }

const BOX: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 96,
  minWidth: 96,
  border: '1px dashed rgb(128 128 128 / 0.6)',
  borderRadius: 4,
  background: 'rgb(128 128 128 / 0.12)',
  color: 'rgb(128 128 128)',
  font: '12px/1.4 system-ui, sans-serif',
}

/** Muted text inside the block's real element, so the placeholder keeps the block's font size. */
export function PlaceholderText({ children }: { children: ReactNode }) {
  return (
    <span data-builder-placeholder="" style={MUTED}>
      {children}
    </span>
  )
}

/** A dashed box with a label, for media blocks without media. */
export function PlaceholderBox({
  attributes,
  className,
  label,
  style,
}: {
  attributes: Record<string, string>
  className?: string
  label: string
  style?: CSSProperties
}) {
  return (
    <div {...attributes} data-builder-placeholder="" className={className} style={{ ...BOX, ...style }}>
      {label}
    </div>
  )
}

export const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

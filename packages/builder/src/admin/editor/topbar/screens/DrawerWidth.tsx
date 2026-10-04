'use client'

// The width of a Payload drawer that takes no class name (the document drawer of
// `useDocumentDrawer`). The rule targets the drawer's slug class, so it applies from the first
// frame: Payload animates every drawer property, so a width that arrived later (for example with
// the drawer's content) would animate from full width to this one.

/** Escapes a class name for a CSS selector (no `CSS.escape` during the server render). */
function escapeClass(value: string): string {
  return value.replace(/[^\w-]/g, (c) => `\\${c.codePointAt(0)?.toString(16) ?? ''} `)
}

export function DrawerWidth({ slug, width }: { slug: string; width: string }) {
  // Payload's modal provider prefixes its classes with "payload".
  return <style>{`.payload__modal-item--slug-${escapeClass(slug)} > .drawer__content { width: ${width} !important; }`}</style>
}

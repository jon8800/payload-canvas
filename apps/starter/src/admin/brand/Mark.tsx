/** The brand mark. A copy of the site icon `src/app/(frontend)/icon.svg`: change both together. */
export function Mark({ size }: { size: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="#1f3d2b" />
      <path d="M9 23V9h2.6l7.8 9.7V9H22v14h-2.6l-7.8-9.7V23z" fill="#f4f1ea" />
    </svg>
  )
}

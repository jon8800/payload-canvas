/**
 * The browser tab title for the builder. Whitespace is collapsed and trimmed the way
 * `document.title` reads it back: the top bar compares the two on every head change, and a title
 * with extra spaces ("Home ") would never match, so it would set the title again forever.
 */
export function tabTitle(title: string, isSection: boolean): string {
  const name = title.replace(/\s+/g, ' ').trim()
  return isSection ? `Section: ${name} · Builder` : `${name} · Builder`
}

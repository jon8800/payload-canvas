// Counts in the editor's text: "No blocks", "1 block", "1,001 blocks" (digits grouped in the
// browser's locale). Pure, safe in tests.

/** `total` with its noun: `none` for 0, `one` for 1, else the grouped number and `many`. */
export function countText(total: number, words: { none?: string; one: string; many: string }, locale?: string): string {
  if (total === 0 && words.none) return words.none
  if (total === 1) return `1 ${words.one}`
  return `${new Intl.NumberFormat(locale).format(total)} ${words.many}`
}

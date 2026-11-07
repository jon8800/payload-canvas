'use client'

// With `editor.openInBuilder` on, the documents whose edit form the user opened on purpose ("All
// fields" in the builder, `?form=1`) in this browser tab. Payload's own document tabs (Versions,
// API, then Edit) drop the search parameter, so this keeps the form open for them. Opening the
// builder for the document forgets the choice. A full page load forgets every choice.

const chosen = new Set<string>()
const key = (collection: string, id: string | number) => `${collection}:${String(id)}`

export const rememberForm = (collection: string, id: string | number) => void chosen.add(key(collection, id))

export const forgetForm = (collection: string, id: string | number) => void chosen.delete(key(collection, id))

export const formChosen = (collection: string, id: string | number) => chosen.has(key(collection, id))

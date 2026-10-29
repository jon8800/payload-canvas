// Names that client block components need. No imports: a component that reads them does not
// pull the binding code into the page's JavaScript. `bindings.ts` re-exports them.

/** The collection list block: renders its `item` slot once per loaded document. */
export const COLLECTION_LIST_BLOCK = 'collectionList'
/**
 * The repeat block: renders its `item` slot once per row of an array or hasMany field of the
 * current document (`props.path`). The rows are its runtime-only `$items` prop.
 */
export const REPEAT_BLOCK = 'repeat'
/** The URL query parameter of a paginated list's page (`?page=3`). Filter links drop it. */
export const PAGE_PARAM = 'page'

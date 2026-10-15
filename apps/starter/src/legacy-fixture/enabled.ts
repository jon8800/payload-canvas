// Dev fixture switch. NEXT_PUBLIC_ so client code (the canvas) gets the same value.
export const legacyDemo = process.env.NEXT_PUBLIC_BUILDER_LEGACY_DEMO === '1'

export const LEGACY_COLLECTION = 'legacy-pages'

/** The fixture collection whose builder field is its own Payload blocks field (one source of truth). */
export const SHARED_BLOCKS_COLLECTION = 'shared-blocks-pages'

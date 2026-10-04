// Dev fixture switch. NEXT_PUBLIC_ so client code (the canvas) gets the same value.
export const legacyDemo = process.env.NEXT_PUBLIC_BUILDER_LEGACY_DEMO === '1'

export const LEGACY_COLLECTION = 'legacy-pages'

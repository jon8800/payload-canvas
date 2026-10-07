// Admin server components (import map paths):
//   'payload-canvas/rsc#BuilderView'     — the full-screen builder, a root admin view
//   'payload-canvas/rsc#BuilderRedirect' — the document's `/builder` path, redirects to it
//   'payload-canvas/rsc#LayoutDiff'      — the layout field in Versions > compare, in plain words
//   'payload-canvas/rsc#NoDiff'          — no row in Versions > compare (the generated CSS)
export { BuilderView } from './server/BuilderView'
export { BuilderRedirect } from './server/BuilderRedirect'
export { LayoutDiff } from './diff/LayoutDiff'
export { NoDiff } from './diff/NoDiff'

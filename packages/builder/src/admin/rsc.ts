// Admin server components (import map paths):
//   '@payload-toolkit/builder/rsc#BuilderView'     — the full-screen builder, a root admin view
//   '@payload-toolkit/builder/rsc#BuilderRedirect' — the document's `/builder` path, redirects to it
//   '@payload-toolkit/builder/rsc#LayoutDiff'      — the layout field in Versions > compare, in plain words
//   '@payload-toolkit/builder/rsc#NoDiff'          — no row in Versions > compare (the generated CSS)
export { BuilderView } from './server/BuilderView'
export { BuilderRedirect } from './server/BuilderRedirect'
export { LayoutDiff } from './diff/LayoutDiff'
export { NoDiff } from './diff/NoDiff'

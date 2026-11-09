// Admin server components (import map paths):
//   'payload-canvas/rsc#BuilderView'     — the full-screen builder, a root admin view
//   'payload-canvas/rsc#BuilderRedirect' — the document's `/builder` path, redirects to it
//   'payload-canvas/rsc#LayoutDiff'      — the layout field in Versions > compare, in plain words
//   'payload-canvas/rsc#NoDiff'          — no row in Versions > compare (the generated CSS)
//   'payload-canvas/rsc#SubmissionView'        — a form submission: answers with the form's labels, files, reply link; marks it read
//   'payload-canvas/rsc#SubmissionSummaryCell' — the submissions list's Message column
//   'payload-canvas/rsc#SubmissionReadCell'    — the submissions list's "New" badge / opened date
export { BuilderView } from './server/BuilderView'
export { BuilderRedirect } from './server/BuilderRedirect'
export { LayoutDiff } from './diff/LayoutDiff'
export { NoDiff } from './diff/NoDiff'
export { SubmissionView } from './forms/SubmissionView'
export { SubmissionReadCell, SubmissionSummaryCell } from './forms/SubmissionCells'

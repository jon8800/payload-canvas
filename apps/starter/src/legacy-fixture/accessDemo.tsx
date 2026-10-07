// Dev fixture for field access of block props in the builder (NEXT_PUBLIC_BUILDER_ACCESS_DEMO=1):
// one block whose props have `access.read` and `access.update` for one user only. The editor hides
// and locks them for everyone else. Blocks are JSON, so turning it on changes no database table.
// Client-safe: the canvas imports the component.
import { defineBlock } from 'payload-canvas/blocks'
import { editableText, type BlockComponentProps } from 'payload-canvas/react'
import type { Field, FieldAccess } from 'payload'

export const accessDemo = process.env.NEXT_PUBLIC_BUILDER_ACCESS_DEMO === '1'

/** The user who counts as "admin" for the demo (the agents' first dev user). */
const ADMIN_EMAIL = 'builder-dev@local.test'

const isAdmin: FieldAccess = ({ req }) => (req.user as { email?: unknown } | null)?.email === ADMIN_EMAIL

const fields: Field[] = [
  {
    name: 'title',
    type: 'text',
    admin: { description: 'access.update reads the block: everyone may change it until an admin ticks "Locked".' },
    access: { update: (args) => isAdmin(args) || (args.siblingData as { locked?: unknown } | undefined)?.locked !== true },
  },
  { name: 'locked', type: 'checkbox', admin: { description: `access.update: only ${ADMIN_EMAIL}.` }, access: { update: isAdmin } },
  { name: 'adminNote', type: 'text', label: 'Admin note', admin: { description: `access.update: only ${ADMIN_EMAIL}.` }, access: { update: isAdmin } },
  { name: 'secret', type: 'text', label: 'Secret', admin: { description: `access.read: only ${ADMIN_EMAIL}.` }, access: { read: isAdmin } },
  { name: 'items', type: 'array', fields: [{ name: 'label', type: 'text', access: { update: isAdmin } }] },
]

export const accessDemoBlock = defineBlock({
  type: 'accessDemo',
  label: 'Field access demo',
  icon: 'form',
  category: 'Dev fixtures',
  fields,
  ai: { description: 'Dev fixture: props with field access. Do not use on real pages.' },
})

const text = (value: unknown) => (typeof value === 'string' && value ? value : '–')

/** Shows the title and the admin note, both editable in place. The secret is never rendered. */
export function AccessDemoBlock({ props, className, attributes, mode }: BlockComponentProps) {
  return (
    <div {...attributes} className={className}>
      <h3 {...editableText(mode, 'title')}>{text(props.title)}</h3>
      <p {...editableText(mode, 'adminNote')}>{text(props.adminNote)}</p>
    </div>
  )
}

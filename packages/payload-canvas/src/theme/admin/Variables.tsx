'use client'

// The theme's Variables list in Payload's admin: the value field that follows the row's type, the
// row label with a preview, and the warning while a rename or a removal would break blocks or
// classes that use a variable (as Webflow warns).

import { FieldError, TextInput, useConfig, useDocumentInfo, useField, useFormFields, useRowLabel } from '@payloadcms/ui'
import type { TextFieldClientComponent, TextFieldClientProps } from 'payload'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'

import { builderViewPath } from '../../plugin/links'
import { VARIABLE_TYPES, type ThemeVariable, type ThemeVariableType } from '../variables'
import { ThemeColorField } from './ColorField'
import { FieldShell } from './FieldShell'
import { ThemeFontField } from './FontField'
import './fields.scss'

/** `variables.2.value` → `variables.2`. */
const rowPath = (path: string) => path.slice(0, path.lastIndexOf('.'))

const asType = (value: unknown): ThemeVariableType => (value === 'size' || value === 'font' ? value : 'color')

/** A variable's value (or dark value): a color picker, a size input or a Google Font, from the row's type. */
export const ThemeVariableValueField: TextFieldClientComponent = function ThemeVariableValueField(props) {
  const type = useFormFields(([fields]) => asType(fields[`${rowPath(props.path)}.type`]?.value))
  if (type === 'color') return <ThemeColorField {...props} />
  if (type === 'font') return <ThemeFontField {...props} />
  return <SizeField {...props} />
}

function SizeField({ path, field, readOnly }: TextFieldClientProps) {
  const { value, setValue, disabled, showError } = useField<string>({ path })
  return (
    <FieldShell field={{ ...field, label: false }} path={path} className="theme-variable-size">
      <TextInput
        path={path}
        label={field.label}
        value={value ?? ''}
        placeholder="24px or 1.5rem"
        readOnly={Boolean(readOnly || disabled)}
        showError={showError}
        Error={<FieldError path={path} showError={showError} />}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      />
      {value ? <span className="theme-variable-size__bar" style={{ width: `min(100%, ${value})` }} aria-hidden="true" /> : null}
    </FieldShell>
  )
}

/** The row's preview: a swatch, the size as a bar, or "Ag" in the font. */
function Preview({ type, value }: { type: ThemeVariableType; value: string }) {
  if (!value) return <span className="theme-variable-label__preview" data-empty="" aria-hidden="true" />
  if (type === 'color') return <span className="theme-variable-label__preview" style={{ background: value }} aria-hidden="true" />
  if (type === 'font') {
    return (
      <span className="theme-variable-label__preview theme-variable-label__preview--font" style={{ fontFamily: `"${value}", sans-serif` }} aria-hidden="true">
        Ag
      </span>
    )
  }
  return (
    <span className="theme-variable-label__preview theme-variable-label__preview--size" aria-hidden="true">
      <span style={{ width: `min(100%, ${value})` }} />
    </span>
  )
}

/** The row label: preview, name, type and value. */
export function ThemeVariableRowLabel() {
  const { data, rowNumber } = useRowLabel<Partial<ThemeVariable>>()
  const type = asType(data?.type)
  const name = data?.name?.trim()
  const value = data?.value?.trim() ?? ''
  return (
    <span className="theme-variable-label">
      <Preview type={type} value={value} />
      <span className="theme-variable-label__name">{name || `Variable ${(rowNumber ?? 0) + 1}`}</span>
      <span className="theme-variable-label__meta">
        {VARIABLE_TYPES.find((t) => t.value === type)?.label}
        {value ? ` · ${value}` : ''}
      </span>
    </span>
  )
}

type Usage = { blocks: number; documents: Array<{ collection: string; id: string | number; title: string; blocks: number }>; classes: string[] }

type Row = { id: string; name: string; type: ThemeVariableType }

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** Where it is used, as a phrase: "3 blocks on 2 pages and 1 class". */
function usedText(usage: Usage): string {
  const parts: string[] = []
  if (usage.blocks > 0) parts.push(`${plural(usage.blocks, 'block')} on ${plural(usage.documents.length, 'page')}`)
  if (usage.classes.length > 0) parts.push(plural(usage.classes.length, 'class', 'classes'))
  return parts.join(' and ')
}

const rowsOf = (list: unknown): Row[] =>
  Array.isArray(list)
    ? (list as Array<Partial<ThemeVariable> | null>).flatMap((v) => (v?.id && typeof v.name === 'string' ? [{ id: v.id, name: v.name.trim(), type: asType(v.type) }] : []))
    : []

/**
 * Under the list: for each saved variable in use that this form renames, retypes or removes, what
 * breaks, with links to the pages. Nothing while no change touches a used variable.
 */
export function ThemeVariablesWarning() {
  const {
    config: {
      routes: { admin, api },
    },
  } = useConfig()
  const { savedDocumentData } = useDocumentInfo()
  const saved = useMemo(() => rowsOf((savedDocumentData as { variables?: unknown } | undefined)?.variables), [savedDocumentData])
  // The current rows as text, so the form's other edits do not render this again.
  const currentKey = useFormFields(([fields]) => {
    const count = Number(fields.variables?.value ?? 0)
    const rows: string[] = []
    for (let i = 0; i < count; i++) rows.push([fields[`variables.${i}.id`]?.value, fields[`variables.${i}.name`]?.value, fields[`variables.${i}.type`]?.value].map((v) => String(v ?? '').trim()).join('\u0000'))
    return rows.join('\u0001')
  })
  const [usage, setUsage] = useState<Record<string, Usage> | null>(null)

  const savedKey = saved.map((v) => `${v.type}:${v.name}`).join(',')
  useEffect(() => {
    if (!savedKey) return
    const controller = new AbortController()
    // Same origin, as the admin's own requests: `serverURL` may name another host.
    fetch(`${api}/builder/theme/variables/usage?variables=${encodeURIComponent(savedKey)}`, { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ usage?: Record<string, Usage> }>) : null))
      .then((body) => setUsage(body?.usage ?? null))
      .catch(() => {
        // Offline or aborted: no warning.
      })
    return () => controller.abort()
  }, [api, savedKey])

  if (!usage) return null
  const current = new Map(
    currentKey
      .split('\u0001')
      .filter(Boolean)
      .map((row) => {
        const [id = '', name = '', type = ''] = row.split('\u0000')
        return [id, { name, type: asType(type) }] as const
      }),
  )
  const broken = saved.flatMap((variable) => {
    const used = usage[variable.name]
    if (!used || (used.blocks === 0 && used.classes.length === 0)) return []
    const now = current.get(variable.id)
    if (now && now.name === variable.name && now.type === variable.type) return []
    const change = !now ? 'removed' : now.name !== variable.name ? `renamed to “${now.name || '…'}”` : `changed to a ${now.type}`
    return [{ variable, used, change }]
  })
  if (broken.length === 0) return null

  return (
    <div className="theme-variables-warning" aria-live="polite">
      <p className="theme-variables-warning__title">{broken.length === 1 ? 'A variable in use changes' : `${broken.length} variables in use change`}</p>
      <ul className="theme-variables-warning__list">
        {broken.map(({ variable, used, change }) => (
          <li key={variable.id}>
            <p>
              <code>{variable.name}</code> is {change}. {usedText(used)} still use <code>{variable.name}</code> and lose this {variable.type} when you save.
            </p>
            {used.documents.length > 0 || used.classes.length > 0 ? (
              <p className="theme-variables-warning__where">
                Used on{' '}
                {used.documents.map((doc, index) => (
                  <span key={`${doc.collection}:${doc.id}`}>
                    {index > 0 ? ', ' : ''}
                    <a href={builderViewPath(admin, doc.collection, doc.id)} target="_blank" rel="noreferrer">
                      {doc.title}
                    </a>
                  </span>
                ))}
                {used.classes.length > 0 ? `${used.documents.length > 0 ? ' and in ' : ''}${used.classes.map((name) => `.${name}`).join(', ')}` : ''}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="theme-variables-warning__hint">Change those blocks first, or keep the old name.</p>
    </div>
  )
}

// The builder layout field in Payload's Versions > compare view: the changes in plain words
// (blocks added, removed, moved and changed, with the changed values), instead of two full JSON
// dumps. "Show JSON" still opens Payload's word diff of both layouts.
//
// A server component (`admin.components.Diff` on the layout field): Payload passes the server
// field config, whose `admin.custom.builder` holds the block definitions, and the locales the
// person picked in the compare view.

import { FieldDiffLabel } from '@payloadcms/ui'
import type { FieldDiffServerProps, JSONField, JSONFieldClient } from 'payload'

import { localeLabel } from '../../core/locale'
import type { BuilderClientConfig, LocaleSettings } from '../../core/types'
import { diffLayouts, summarizeLayoutChanges, type LayoutChange, type LayoutChangeDetail } from './changes'
import { LayoutJsonDiff } from './LayoutJsonDiff'

const base = 'layout-diff'

const KIND_LABELS: Record<LayoutChange['kind'], string> = {
  added: 'Added',
  removed: 'Removed',
  moved: 'Moved',
  changed: 'Changed',
}

function fieldLabel(label: unknown, language: string, fallback: string): string {
  if (typeof label === 'string' && label) return label
  if (label && typeof label === 'object') {
    const record = label as Record<string, unknown>
    const text = record[language] ?? Object.values(record).find((value) => typeof value === 'string')
    if (typeof text === 'string' && text) return text
  }
  return fallback
}

function Value({ text, as: Tag }: { text: string; as: 'del' | 'ins' }) {
  if (!text) return <span className={`${base}__empty`}>(empty)</span>
  return <Tag className={`${base}__value ${base}__value--${Tag}`}>{text}</Tag>
}

function LocaleChip({ code, settings }: { code?: string; settings: LocaleSettings | null }) {
  if (!code) return null
  return (
    <span className="field-diff__locale-label" title={localeLabel(settings, code)}>
      {code}
    </span>
  )
}

function Detail({ detail, settings }: { detail: LayoutChangeDetail; settings: LocaleSettings | null }) {
  if (detail.kind === 'classes') {
    return (
      <li className={`${base}__detail`}>
        <span className={`${base}__detail-label`}>Styles</span>
        {detail.removed.map((name) => (
          <del key={`-${name}`} className={`${base}__class ${base}__value--del`}>
            {name}
          </del>
        ))}
        {detail.added.map((name) => (
          <ins key={`+${name}`} className={`${base}__class ${base}__value--ins`}>
            {name}
          </ins>
        ))}
      </li>
    )
  }
  if (detail.kind === 'note') {
    return (
      <li className={`${base}__detail`}>
        <span className={`${base}__detail-label`}>
          <LocaleChip code={detail.locale} settings={settings} />
          {detail.label}
        </span>
        <span>{detail.text}</span>
      </li>
    )
  }
  return (
    <li className={`${base}__detail`}>
      <span className={`${base}__detail-label`}>
        <LocaleChip code={detail.locale} settings={settings} />
        {detail.label}
      </span>
      <Value text={detail.from} as="del" />
      <span className={`${base}__arrow`} aria-label="changed to">
        →
      </span>
      <Value text={detail.to} as="ins" />
    </li>
  )
}

function ChangeRow({ change, settings }: { change: LayoutChange; settings: LocaleSettings | null }) {
  return (
    <li className={`${base}__change ${base}__change--${change.kind}`}>
      <div className={`${base}__head`}>
        <span className={`${base}__pill ${base}__pill--${change.kind}`}>{KIND_LABELS[change.kind]}</span>
        <strong className={`${base}__name`}>{change.name}</strong>
        {(change.kind === 'added' || change.kind === 'removed') && change.where ? (
          <span className={`${base}__where`}>in {change.where}</span>
        ) : null}
        {(change.kind === 'added' || change.kind === 'removed') && change.inside > 0 ? (
          <span className={`${base}__where`}>
            with {change.inside} {change.inside === 1 ? 'block' : 'blocks'} inside
          </span>
        ) : null}
        {change.kind === 'moved' ? (
          <span className={`${base}__where`}>
            from {change.from} to {change.to}
          </span>
        ) : null}
      </div>
      {change.kind === 'changed' ? (
        <ul className={`${base}__details`}>
          {change.details.map((detail, index) => (
            <Detail key={index} detail={detail} settings={settings} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function LayoutDiff(props: FieldDiffServerProps<JSONField, JSONFieldClient>) {
  const { comparisonValue, versionValue, field, clientField, i18n, locale, nestingLevel, selectedLocales } = props
  const builder = field.admin?.custom?.builder as BuilderClientConfig | undefined
  const settings = builder?.localization ?? null
  // Translations follow the locales picked in the compare view; all of them when none are picked.
  const locales = settings && selectedLocales?.length ? selectedLocales : undefined
  const changes = diffLayouts(comparisonValue, versionValue, { blocks: builder?.blocks ?? [], ...(locales ? { locales } : {}) })
  const label = fieldLabel(clientField?.label ?? field.label, i18n?.language ?? 'en', field.name)

  return (
    <div className={`${base} nested-level-${nestingLevel ?? 0}`}>
      <FieldDiffLabel>
        {locale ? <span className="field-diff__locale-label">{locale}</span> : null}
        {label}
      </FieldDiffLabel>
      <div className={`${base}__content`}>
        <p className={`${base}__summary`}>{summarizeLayoutChanges(changes)}</p>
        {changes.length > 0 ? (
          <ul className={`${base}__list`}>
            {changes.map((change) => (
              <ChangeRow key={`${change.kind}:${change.id}`} change={change} settings={settings} />
            ))}
          </ul>
        ) : null}
        <LayoutJsonDiff from={comparisonValue} to={versionValue} />
      </div>
    </div>
  )
}

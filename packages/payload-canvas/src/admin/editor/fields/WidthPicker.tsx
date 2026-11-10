'use client'

// `admin.custom.builderWidthPicker`: a form field's width (a percentage, as the form-builder plugin
// stores it) as a row of buttons with a bar each: full, 3/4, 2/3, 1/2, 1/3, 1/4. "Full" removes
// the width. A width between presets shows as the preset the site draws for it.

import { FORM_FIELD_WIDTHS, formFieldWidth } from '../../../forms/fieldSettings'

type Props = {
  readonly label: string
  readonly description?: string
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}

export function WidthPickerField({ label, description, value, onChange }: Props) {
  const current = formFieldWidth(value)
  return (
    <fieldset className="builder-width-picker">
      <legend className="field-label">{label}</legend>
      <div className="builder-width-picker__options">
        {FORM_FIELD_WIDTHS.map((width) => (
          <button
            key={width.value}
            type="button"
            className="builder-width-picker__option"
            aria-pressed={current === width.value}
            aria-label={width.title}
            title={width.title}
            onClick={() => onChange(width.value === 100 ? undefined : width.value)}
          >
            <span className="builder-width-picker__track" aria-hidden="true">
              <span className="builder-width-picker__bar" style={{ width: `${width.value}%` }} />
            </span>
            <span className="builder-width-picker__label">{width.label}</span>
          </button>
        ))}
      </div>
      {description && <p className="field-description">{description}</p>}
    </fieldset>
  )
}

'use client'

import { Slider } from '@base-ui/react/slider'
import { useField } from '@payloadcms/ui'
import type { StaticLabel } from 'payload'

import { FieldShell, labelText } from './FieldShell'
import './fields.scss'

type SliderCustom = { min?: number; max?: number; step?: number; unit?: string; fallback?: number }

/** The props Payload passes to a `text` or `number` field component (the parts used here). */
type SliderFieldProps = {
  path: string
  readOnly?: boolean
  field: { type?: string; label?: StaticLabel | false; admin?: { custom?: Record<string, unknown>; description?: unknown } }
}

/**
 * A slider with a number input, for a `number` or `text` field. `admin.custom` sets `min`, `max`,
 * `step`, `unit` and `fallback` (the position shown while the field is empty).
 */
export function ThemeSliderField({ path, field, readOnly }: SliderFieldProps) {
  const { value, setValue, disabled } = useField<string | number | null>({ path })
  const locked = Boolean(readOnly || disabled)
  const custom = (field.admin?.custom ?? {}) as SliderCustom
  const min = custom.min ?? 0
  const max = custom.max ?? 100
  const step = custom.step ?? 1
  const parsed = value == null || value === '' ? Number.NaN : Number(value)
  const isSet = Number.isFinite(parsed)
  const current = isSet ? parsed : (custom.fallback ?? min)

  function set(next: number | null) {
    if (next === null) return setValue(null)
    const clamped = Math.min(max, Math.max(min, next))
    setValue(field.type === 'number' ? clamped : String(clamped))
  }

  return (
    <FieldShell field={field} path={path} className="theme-slider">
      <div className={`theme-slider__controls${isSet ? '' : ' theme-slider__controls--empty'}`}>
        <Slider.Root
          value={current}
          min={min}
          max={max}
          step={step}
          disabled={locked}
          onValueChange={(next) => set(Array.isArray(next) ? next[0] : next)}
          className="theme-slider__root"
        >
          <Slider.Control className="theme-slider__control">
            <Slider.Track className="theme-slider__track">
              <Slider.Indicator className="theme-slider__indicator" />
              <Slider.Thumb className="theme-slider__thumb" aria-label={labelText(field, path)} />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
        <input
          type="number"
          className="theme-slider__number"
          min={min}
          max={max}
          step={step}
          value={isSet ? parsed : ''}
          placeholder={String(custom.fallback ?? '')}
          aria-label={`${labelText(field, path)}${custom.unit ? ` in ${custom.unit}` : ''}`}
          disabled={locked}
          onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))}
        />
        {custom.unit ? <span className="theme-slider__unit">{custom.unit}</span> : null}
        {isSet && !locked ? (
          <button type="button" className="theme-slider__reset" onClick={() => set(null)}>
            Reset
          </button>
        ) : null}
      </div>
    </FieldShell>
  )
}

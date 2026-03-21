'use client'

import type { TextFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'
import { Slider } from '@base-ui/react/slider'
import './SliderField.scss'

export const SliderField: TextFieldClientComponent = function SliderField({ path, field }) {
  const { value, setValue } = useField<string>({ path })

  const label = typeof field.label === 'string' ? field.label : path
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

  const custom = (field.admin?.custom as Record<string, unknown>) || {}
  const min = (custom.min as number) ?? 0
  const max = (custom.max as number) ?? 100
  const step = (custom.step as number) ?? 1
  const unit = (custom.unit as string) ?? ''

  const numericValue = parseFloat(String(value)) || min

  function handleSliderChange(newValue: number) {
    setValue(String(newValue))
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseFloat(e.target.value)
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed))
      setValue(String(clamped))
    }
  }

  return (
    <div className="slider-field">
      <label className="slider-field__label">{label}</label>
      <div className="slider-field__controls">
        <Slider.Root
          value={numericValue}
          onValueChange={handleSliderChange}
          min={min}
          max={max}
          step={step}
          className="slider-field__slider"
        >
          <Slider.Control className="slider-field__control">
            <Slider.Track className="slider-field__track">
              <Slider.Indicator className="slider-field__indicator" />
              <Slider.Thumb className="slider-field__thumb" />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
        <input
          type="number"
          className="slider-field__number"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={handleNumberChange}
        />
        {unit && <span className="slider-field__unit">{unit}</span>}
      </div>
      {description && <p className="slider-field__description">{description}</p>}
    </div>
  )
}

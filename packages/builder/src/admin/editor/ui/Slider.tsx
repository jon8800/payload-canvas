'use client'

// The builder's one range slider, on Base UI `Slider`: a thin track, the filled part in the
// accent color, a small round thumb with a larger invisible hit area. Arrow keys step,
// Shift+arrows and Page Up/Down take large steps, Home and End jump to the ends.

import { Slider as BaseSlider } from '@base-ui/react/slider'

import './controls.scss'

export type SliderProps = {
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (value: number) => void
  /** Called once when a drag or key press ends. */
  onValueCommitted?: (value: number) => void
  disabled?: boolean
  /** Grey fill: the position shows a default or inherited value, not one set here. */
  muted?: boolean
  'aria-label': string
  className?: string
}

const single = (value: number | readonly number[]) => (typeof value === 'number' ? value : (value[0] ?? 0))

export function Slider({ value, min, max, step = 1, onValueChange, onValueCommitted, disabled, muted, className, 'aria-label': label }: SliderProps) {
  return (
    <BaseSlider.Root
      className={`builder-slider${className ? ` ${className}` : ''}`}
      data-muted={muted || undefined}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      thumbAlignment="edge"
      onValueChange={(next) => onValueChange(single(next))}
      onValueCommitted={onValueCommitted ? (next) => onValueCommitted(single(next)) : undefined}
    >
      <BaseSlider.Control className="builder-slider__control">
        <BaseSlider.Track className="builder-slider__track">
          <BaseSlider.Indicator className="builder-slider__indicator" />
          <BaseSlider.Thumb className="builder-slider__thumb" aria-label={label} />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}

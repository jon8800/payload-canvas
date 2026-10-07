'use client'

import { FieldLabel } from '@payloadcms/ui'

import { NumberField } from './CheckedInputs'

type Props = {
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly required: boolean
  readonly value: unknown
  /** `[longitude, latitude]`, or `undefined` when both are empty. */
  readonly onChange: (value: [number, number] | undefined) => void
}

const coordinate = (value: unknown, index: number): number | undefined => {
  const n = Array.isArray(value) ? value[index] : undefined
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/**
 * Payload's point field: longitude and latitude, stored as `[longitude, latitude]`. When only one
 * is set, the other is stored as 0, because Payload needs both.
 */
export function PointField({ label, description, path, required, value, onChange }: Props) {
  const lng = coordinate(value, 0)
  const lat = coordinate(value, 1)
  const set = (index: 0 | 1, next: number | null) => {
    const pair: [number | undefined, number | undefined] = [lng, lat]
    pair[index] = next ?? undefined
    if (pair[0] === undefined && pair[1] === undefined) onChange(undefined)
    else onChange([pair[0] ?? 0, pair[1] ?? 0])
  }
  return (
    <div className="builder-field-point">
      <FieldLabel label={label} path={path} required={required} />
      {description && <p className="builder-field-group__description">{description}</p>}
      <div className="builder-field-point__inputs">
        <NumberField label="Longitude" limits={{ min: -180, max: 180, required }} onChange={(n) => set(0, n)} path={`${path}.lng`} required={required} value={lng} />
        <NumberField label="Latitude" limits={{ min: -90, max: 90, required }} onChange={(n) => set(1, n)} path={`${path}.lat`} required={required} value={lat} />
      </div>
    </div>
  )
}

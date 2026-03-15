'use client'

import { useCallback, useRef, useState } from 'react'
import { CodeEditor, useField } from '@payloadcms/ui'
import type { TextFieldClientProps } from 'payload'
import './StylesPanel.scss'

// ── Types ──

type SpacingDirection = {
  base?: string
  custom?: number
  sm?: string
  md?: string
  lg?: string
  xl?: string
}

type SpacingGroup = {
  top?: SpacingDirection
  right?: SpacingDirection
  bottom?: SpacingDirection
  left?: SpacingDirection
}

type PresetWithCustom = {
  base?: string
  custom?: number | string
  sm?: string
  md?: string
  lg?: string
  xl?: string
}

type ColorValue = {
  preset?: string
  custom?: string
  sm?: string
  md?: string
  lg?: string
  xl?: string
}

type StylesData = {
  padding?: SpacingGroup
  margin?: SpacingGroup
  borderRadius?: PresetWithCustom
  borderWidth?: PresetWithCustom
  textSize?: PresetWithCustom
  backgroundColor?: ColorValue
  textColor?: ColorValue
  customCSS?: {
    classes?: string
    inlineCSS?: string
  }
}

// ── Preset options ──

const spacingOptions = [
  { label: '-', value: '' },
  { label: 'None', value: 'none' },
  { label: 'XS', value: 'xs' },
  { label: 'SM', value: 'sm' },
  { label: 'MD', value: 'md' },
  { label: 'LG', value: 'lg' },
  { label: 'XL', value: 'xl' },
  { label: '2XL', value: '2xl' },
]

const borderRadiusOptions = [
  { label: '-', value: '' },
  { label: 'None', value: 'none' },
  { label: 'SM', value: 'sm' },
  { label: 'MD', value: 'md' },
  { label: 'LG', value: 'lg' },
  { label: 'XL', value: 'xl' },
  { label: 'Full', value: 'full' },
  { label: 'Custom', value: 'custom' },
]

const borderWidthOptions = [
  { label: '-', value: '' },
  { label: 'None', value: 'none' },
  { label: '1px', value: '1' },
  { label: '2px', value: '2' },
  { label: '4px', value: '4' },
  { label: '8px', value: '8' },
  { label: 'Custom', value: 'custom' },
]

const textSizeOptions = [
  { label: '-', value: '' },
  { label: 'XS', value: 'xs' },
  { label: 'SM', value: 'sm' },
  { label: 'Base', value: 'base' },
  { label: 'LG', value: 'lg' },
  { label: 'XL', value: 'xl' },
  { label: '2XL', value: '2xl' },
  { label: '3XL', value: '3xl' },
  { label: '4XL', value: '4xl' },
  { label: '5XL', value: '5xl' },
  { label: 'Custom', value: 'custom' },
]

const colorOptions = [
  { label: '-', value: '' },
  { label: 'None', value: 'none' },
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Muted', value: 'muted' },
  { label: 'Accent', value: 'accent' },
  { label: 'Destructive', value: 'destructive' },
  { label: 'Background', value: 'background' },
  { label: 'Foreground', value: 'foreground' },
  { label: 'Card', value: 'card' },
  { label: 'Popover', value: 'popover' },
  { label: 'Custom', value: 'custom' },
]

// ── Helpers ──

/** Immutably set a deeply nested value by path segments */
function updateNestedValue(
  obj: Record<string, unknown> | undefined,
  pathSegments: string[],
  newValue: unknown,
): Record<string, unknown> {
  const root = obj ? { ...obj } : {}
  if (pathSegments.length === 0) return root

  const [head, ...rest] = pathSegments

  if (rest.length === 0) {
    // Clear direction data when set to 'none' or empty
    if (newValue === '' || newValue === undefined) {
      const copy = { ...root }
      delete copy[head]
      return copy
    }
    root[head] = newValue
    return root
  }

  const child = root[head]
  const childObj = (child && typeof child === 'object' ? { ...(child as Record<string, unknown>) } : {})
  root[head] = updateNestedValue(childObj, rest, newValue)
  return root
}

// ── Sub-components ──

type SpacingSelectProps = {
  value: string
  onChange: (val: string) => void
}

function SpacingSelect({ value, onChange }: SpacingSelectProps) {
  return (
    <select
      className="spacing-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {spacingOptions.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

type BoundingBoxProps = {
  styles: StylesData
  onUpdate: (path: string[], value: unknown) => void
}

function BoundingBox({ styles, onUpdate }: BoundingBoxProps) {
  const getSpacing = (group: 'padding' | 'margin', dir: string): string => {
    const g = styles[group] as SpacingGroup | undefined
    if (!g) return ''
    const d = g[dir as keyof SpacingGroup]
    return d?.base ?? ''
  }

  const handleChange = (group: 'padding' | 'margin', dir: string, val: string) => {
    if (val === '' || val === 'none') {
      onUpdate([group, dir], undefined)
      return
    }
    onUpdate([group, dir, 'base'], val)
  }

  return (
    <div className="bounding-box">
      <div className="margin-box">
        <span className="box-label">Margin</span>

        <div className="spacing-row">
          <SpacingSelect
            value={getSpacing('margin', 'top')}
            onChange={(v) => handleChange('margin', 'top', v)}
          />
        </div>

        <div className="spacing-row horizontal">
          <SpacingSelect
            value={getSpacing('margin', 'left')}
            onChange={(v) => handleChange('margin', 'left', v)}
          />

          <div className="padding-box">
            <span className="box-label">Padding</span>

            <div className="spacing-row">
              <SpacingSelect
                value={getSpacing('padding', 'top')}
                onChange={(v) => handleChange('padding', 'top', v)}
              />
            </div>

            <div className="spacing-row horizontal">
              <SpacingSelect
                value={getSpacing('padding', 'left')}
                onChange={(v) => handleChange('padding', 'left', v)}
              />
              <div className="content-box">Content</div>
              <SpacingSelect
                value={getSpacing('padding', 'right')}
                onChange={(v) => handleChange('padding', 'right', v)}
              />
            </div>

            <div className="spacing-row">
              <SpacingSelect
                value={getSpacing('padding', 'bottom')}
                onChange={(v) => handleChange('padding', 'bottom', v)}
              />
            </div>
          </div>

          <SpacingSelect
            value={getSpacing('margin', 'right')}
            onChange={(v) => handleChange('margin', 'right', v)}
          />
        </div>

        <div className="spacing-row">
          <SpacingSelect
            value={getSpacing('margin', 'bottom')}
            onChange={(v) => handleChange('margin', 'bottom', v)}
          />
        </div>
      </div>
    </div>
  )
}

type PresetGroupProps = {
  label: string
  options: { label: string; value: string }[]
  basePath: string[]
  baseKey: string
  styles: StylesData
  onUpdate: (path: string[], value: unknown) => void
  customType?: 'number' | 'text'
}

function PresetGroup({
  label,
  options,
  basePath,
  baseKey,
  styles,
  onUpdate,
  customType = 'number',
}: PresetGroupProps) {
  const getVal = (): string => {
    let current: unknown = styles
    for (const seg of basePath) {
      if (!current || typeof current !== 'object') return ''
      current = (current as Record<string, unknown>)[seg]
    }
    if (!current || typeof current !== 'object') return ''
    return ((current as Record<string, unknown>)[baseKey] as string) ?? ''
  }

  const getCustom = (): string => {
    let current: unknown = styles
    for (const seg of basePath) {
      if (!current || typeof current !== 'object') return ''
      current = (current as Record<string, unknown>)[seg]
    }
    if (!current || typeof current !== 'object') return ''
    const v = (current as Record<string, unknown>).custom
    return v != null ? String(v) : ''
  }

  const baseVal = getVal()

  return (
    <div className="field-row">
      <label>{label}</label>
      <select
        value={baseVal}
        onChange={(e) => {
          const v = e.target.value
          if (v === '' || v === 'none') {
            onUpdate(basePath, undefined)
          } else {
            onUpdate([...basePath, baseKey], v)
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {baseVal === 'custom' && (
        <input
          type={customType}
          placeholder="Custom"
          value={getCustom()}
          onChange={(e) => {
            const raw = e.target.value
            const val = customType === 'number' ? (raw === '' ? undefined : Number(raw)) : raw
            onUpdate([...basePath, 'custom'], val)
          }}
          style={{ maxWidth: 80 }}
        />
      )}
    </div>
  )
}

type ColorGroupProps = {
  label: string
  basePath: string[]
  styles: StylesData
  onUpdate: (path: string[], value: unknown) => void
}

function ColorGroup({ label, basePath, styles, onUpdate }: ColorGroupProps) {
  const getPreset = (): string => {
    let current: unknown = styles
    for (const seg of basePath) {
      if (!current || typeof current !== 'object') return ''
      current = (current as Record<string, unknown>)[seg]
    }
    if (!current || typeof current !== 'object') return ''
    return ((current as Record<string, unknown>).preset as string) ?? ''
  }

  const getCustom = (): string => {
    let current: unknown = styles
    for (const seg of basePath) {
      if (!current || typeof current !== 'object') return ''
      current = (current as Record<string, unknown>)[seg]
    }
    if (!current || typeof current !== 'object') return ''
    return ((current as Record<string, unknown>).custom as string) ?? ''
  }

  const preset = getPreset()

  return (
    <div className="field-row">
      <label>{label}</label>
      <select
        value={preset}
        onChange={(e) => {
          const v = e.target.value
          if (v === '' || v === 'none') {
            onUpdate(basePath, undefined)
          } else {
            onUpdate([...basePath, 'preset'], v)
          }
        }}
      >
        {colorOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {preset === 'custom' && (
        <>
          <input
            type="text"
            placeholder="#000000"
            value={getCustom()}
            onChange={(e) => onUpdate([...basePath, 'custom'], e.target.value)}
            style={{ maxWidth: 90 }}
          />
          <input
            type="color"
            value={getCustom() || '#000000'}
            onChange={(e) => onUpdate([...basePath, 'custom'], e.target.value)}
          />
        </>
      )}
    </div>
  )
}

// ── Class Token Input ──

type ClassTokenInputProps = {
  value: string
  onChange: (value: string | undefined) => void
}

function ClassTokenInput({ value, onChange }: ClassTokenInputProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const chips = value ? value.split(/\s+/).filter(Boolean) : []

  const addChip = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || chips.includes(trimmed)) return
      const updated = [...chips, trimmed].join(' ')
      onChange(updated)
      setInputValue('')
    },
    [chips, onChange],
  )

  const removeChip = useCallback(
    (index: number) => {
      const updated = chips.filter((_, i) => i !== index).join(' ')
      onChange(updated || undefined)
    },
    [chips, onChange],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && inputValue.trim()) {
      e.preventDefault()
      addChip(inputValue)
      return
    }
    if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      removeChip(chips.length - 1)
    }
  }

  return (
    <div
      className="chip-input-wrapper"
      onClick={() => inputRef.current?.focus()}
    >
      {chips.map((chip, i) => (
        <span key={`${chip}-${i}`} className="chip">
          {chip}
          <button
            type="button"
            className="chip-remove"
            onClick={(e) => {
              e.stopPropagation()
              removeChip(i)
            }}
            aria-label={`Remove ${chip}`}
          >
            x
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        className="chip-text-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (inputValue.trim()) addChip(inputValue)
        }}
        placeholder={chips.length === 0 ? 'Type class and press Enter' : ''}
      />
    </div>
  )
}

// ── Main component ──

export function StylesPanel({ path }: TextFieldClientProps) {
  const { value, setValue } = useField<StylesData>({ path: path ?? '' })

  const styles: StylesData = (value && typeof value === 'object' ? value : {}) as StylesData

  const handleUpdate = (pathSegments: string[], newValue: unknown) => {
    const updated = updateNestedValue(
      styles as unknown as Record<string, unknown>,
      pathSegments,
      newValue,
    )
    setValue(updated as unknown as StylesData)
  }

  return (
    <div className="styles-panel">
      <label className="styles-panel-title">
        Styles
      </label>

      {/* Bounding Box -- always visible */}
      <BoundingBox styles={styles} onUpdate={handleUpdate} />

      {/* Border */}
      <details className="styles-group">
        <summary>Border</summary>
        <div className="group-content">
          <PresetGroup
            label="Border Radius"
            options={borderRadiusOptions}
            basePath={['borderRadius']}
            baseKey="base"
            styles={styles}
            onUpdate={handleUpdate}
          />
          <PresetGroup
            label="Border Width"
            options={borderWidthOptions}
            basePath={['borderWidth']}
            baseKey="base"
            styles={styles}
            onUpdate={handleUpdate}
          />
        </div>
      </details>

      {/* Typography */}
      <details className="styles-group">
        <summary>Typography</summary>
        <div className="group-content">
          <PresetGroup
            label="Text Size"
            options={textSizeOptions}
            basePath={['textSize']}
            baseKey="base"
            styles={styles}
            onUpdate={handleUpdate}
            customType="text"
          />
        </div>
      </details>

      {/* Colors */}
      <details className="styles-group">
        <summary>Colors</summary>
        <div className="group-content">
          <ColorGroup
            label="Background"
            basePath={['backgroundColor']}
            styles={styles}
            onUpdate={handleUpdate}
          />
          <ColorGroup
            label="Text Color"
            basePath={['textColor']}
            styles={styles}
            onUpdate={handleUpdate}
          />
        </div>
      </details>

      {/* Custom CSS */}
      <details className="styles-group">
        <summary>Custom CSS</summary>
        <div className="group-content">
          <div className="custom-css-field">
            <label>Custom CSS</label>
            <div className="code-editor-wrapper">
              <CodeEditor
                language="css"
                minHeight={80}
                maxHeight={200}
                value={styles.customCSS?.inlineCSS ?? ''}
                onChange={(value: string | undefined) =>
                  handleUpdate(['customCSS', 'inlineCSS'], value || undefined)
                }
              />
            </div>
            <span className="code-editor-description">
              Add custom CSS properties (e.g. max-width: 600px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);)
            </span>
          </div>
          <div className="custom-css-field">
            <label>Tailwind Classes</label>
            <ClassTokenInput
              value={styles.customCSS?.classes ?? ''}
              onChange={(val) => handleUpdate(['customCSS', 'classes'], val)}
            />
          </div>
        </div>
      </details>
    </div>
  )
}

'use client'

import { useCallback, useRef, useState } from 'react'
import { CodeEditor, useField } from '@payloadcms/ui'
import { Collapsible } from '@base-ui/react/collapsible'
import { Select } from '@base-ui/react/select'
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

// ── Icons ──

function PlusIcon() {
  return (
    <svg className="section-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Styled Select ──

function SelectChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type StyledSelectProps = {
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
}

function StyledSelect({ value, onChange, options }: StyledSelectProps) {
  return (
    <Select.Root value={value} onValueChange={(val) => onChange(val ?? '')} items={options} modal={false}>
      <Select.Trigger className="styled-select-trigger">
        <Select.Value placeholder="-" />
        <Select.Icon className="styled-select-icon">
          <SelectChevron />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="styled-select-positioner" sideOffset={4}>
          <Select.Popup className="styled-select-popup">
            {options.map((o) => (
              <Select.Item key={o.value} value={o.value} className="styled-select-item">
                <Select.ItemText>{o.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

// ── Sub-components ──

function SpacingBoxControl({ styles, onUpdate }: { styles: StylesData; onUpdate: (path: string[], value: unknown) => void }) {
  const getVal = (group: 'margin' | 'padding', dir: string): string => {
    const g = styles[group] as SpacingGroup | undefined
    if (!g) return ''
    const d = g[dir as keyof SpacingGroup]
    return d?.base ?? ''
  }

  const handleChange = (group: 'margin' | 'padding', dir: string, val: string) => {
    if (val === '' || val === 'none') {
      onUpdate([group, dir], undefined)
      return
    }
    onUpdate([group, dir, 'base'], val)
  }

  return (
    <div className="spacing-box">
      <div className="spacing-box-margin">
        <span className="spacing-box-label">MARGIN</span>
        <input className="spacing-box-input spacing-box-input--top" type="text" value={getVal('margin', 'top')} onChange={(e) => handleChange('margin', 'top', e.target.value)} placeholder="0" />
        <input className="spacing-box-input spacing-box-input--right" type="text" value={getVal('margin', 'right')} onChange={(e) => handleChange('margin', 'right', e.target.value)} placeholder="0" />
        <input className="spacing-box-input spacing-box-input--bottom" type="text" value={getVal('margin', 'bottom')} onChange={(e) => handleChange('margin', 'bottom', e.target.value)} placeholder="0" />
        <input className="spacing-box-input spacing-box-input--left" type="text" value={getVal('margin', 'left')} onChange={(e) => handleChange('margin', 'left', e.target.value)} placeholder="0" />

        <div className="spacing-box-padding">
          <span className="spacing-box-label">PADDING</span>
          <input className="spacing-box-input spacing-box-input--top" type="text" value={getVal('padding', 'top')} onChange={(e) => handleChange('padding', 'top', e.target.value)} placeholder="0" />
          <input className="spacing-box-input spacing-box-input--right" type="text" value={getVal('padding', 'right')} onChange={(e) => handleChange('padding', 'right', e.target.value)} placeholder="0" />
          <input className="spacing-box-input spacing-box-input--bottom" type="text" value={getVal('padding', 'bottom')} onChange={(e) => handleChange('padding', 'bottom', e.target.value)} placeholder="0" />
          <input className="spacing-box-input spacing-box-input--left" type="text" value={getVal('padding', 'left')} onChange={(e) => handleChange('padding', 'left', e.target.value)} placeholder="0" />
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
      <div className="field-row-controls">
        <StyledSelect
          value={baseVal}
          onChange={(v) => {
            if (v === '' || v === 'none') {
              onUpdate(basePath, undefined)
            } else {
              onUpdate([...basePath, baseKey], v)
            }
          }}
          options={options}
        />
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
            className="custom-value-input"
          />
        )}
      </div>
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
      <div className="field-row-controls">
        <StyledSelect
          value={preset}
          onChange={(v) => {
            if (v === '' || v === 'none') {
              onUpdate(basePath, undefined)
            } else {
              onUpdate([...basePath, 'preset'], v)
            }
          }}
          options={colorOptions}
        />
        {preset === 'custom' && (
          <>
            <input
              type="text"
              placeholder="#000000"
              value={getCustom()}
              onChange={(e) => onUpdate([...basePath, 'custom'], e.target.value)}
              className="custom-value-input"
            />
            <span
              className="color-swatch"
              style={{ backgroundColor: getCustom() || '#000000' }}
            />
          </>
        )}
      </div>
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

// ── Collapsible Section ──

type SectionProps = {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function Section({ title, defaultOpen = false, children }: SectionProps) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="section">
      <Collapsible.Trigger className="section-trigger">
        <span>{title}</span>
        <PlusIcon />
      </Collapsible.Trigger>
      <Collapsible.Panel className="section-panel">
        <div className="section-content">
          {children}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
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

      {/* Spacing -- always visible, not collapsible */}
      <div className="spacing-section">
        <SpacingBoxControl styles={styles} onUpdate={handleUpdate} />
      </div>

      {/* Border */}
      <Section title="Border">
        <PresetGroup
          label="Radius"
          options={borderRadiusOptions}
          basePath={['borderRadius']}
          baseKey="base"
          styles={styles}
          onUpdate={handleUpdate}
        />
        <PresetGroup
          label="Width"
          options={borderWidthOptions}
          basePath={['borderWidth']}
          baseKey="base"
          styles={styles}
          onUpdate={handleUpdate}
        />
      </Section>

      {/* Typography */}
      <Section title="Typography">
        <PresetGroup
          label="Text Size"
          options={textSizeOptions}
          basePath={['textSize']}
          baseKey="base"
          styles={styles}
          onUpdate={handleUpdate}
          customType="text"
        />
      </Section>

      {/* Colors */}
      <Section title="Colors">
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
      </Section>

      {/* Custom CSS */}
      <Section title="Custom CSS">
        <div className="custom-css-field">
          <label>Inline CSS</label>
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
      </Section>
    </div>
  )
}

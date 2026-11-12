'use client'

// Properties in a saved section's inspector: the ◆ button next to a content field that makes it a
// property, the chip of a field that is one, and the "Visible" property row.

import { useState, type FormEvent, type ReactNode } from 'react'

import { SECTION_REF_BLOCK } from '../../../blocks/builtins/sectionRef'
import { propertyLabel, propertyOf, VISIBLE_BINDING } from '../../../core/components'
import type { Block } from '../../../core/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { Popover, stopEditorKeys, usePopover } from '../styles/popover'
import { addProperty, editsSection, removeProperty } from './components'
import './components.css'

/** The form in the property popover: a name, then Enter. */
function PropertyForm({ initial, onSubmit }: { initial: string; onSubmit: (label: string) => string | null }) {
  const [label, setLabel] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(onSubmit(label))
  }
  return (
    <form className="builder-prop__form" onSubmit={submit}>
      <label className="builder-prop__form-label" htmlFor="builder-prop-name">
        Property name
      </label>
      <input
        id="builder-prop-name"
        className="builder-prop__input"
        type="text"
        value={label}
        onKeyDown={stopEditorKeys}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opens to type a name
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setLabel(e.target.value)
          setError(null)
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'builder-prop-error' : undefined}
      />
      {error && (
        <p id="builder-prop-error" className="builder-prop__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="builder-prop__submit">
        Create property
      </button>
    </form>
  )
}

/** The ◆ button that makes a field a property. `offset`: a bind button sits at the edge already. */
function PropertyButton({ block, propPath, label, offset = false }: { block: Block; propPath: string; label: string; offset?: boolean }) {
  const runtime = useRuntime()
  const popover = usePopover('auto')
  return (
    <>
      <button
        type="button"
        className={`builder-bind__button builder-prop__button${offset ? ' builder-prop__button--offset' : ''}`}
        aria-label={`Make ${label} a property`}
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        data-tooltip="Make it a property"
        onClick={(e) => popover.toggle(e.currentTarget)}
      >
        <Icon name="component" size={13} />
      </button>
      <Popover {...popover.props} className="builder-prop__popover" label={`Make ${label} a property`}>
        {popover.open && (
          <PropertyForm
            initial={label}
            onSubmit={(name) => {
              const problem = addProperty(runtime, block.id, propPath, name)
              if (!problem) popover.hide()
              return problem
            }}
          />
        )}
      </Popover>
    </>
  )
}

/** The chip of a prop that is a property, with a button that makes it a normal prop again. */
function PropertyChip({ block, propPath, name }: { block: Block; propPath: string; name: string }) {
  const runtime = useRuntime()
  const label = propertyLabel(name)
  return (
    <div className="builder-prop__chip">
      <Icon name="component" size={12} />
      <span className="builder-prop__chip-label">{label}</span>
      <span className="builder-prop__chip-kind">Property</span>
      <button
        type="button"
        className="builder-bind__chip-x"
        aria-label={`Remove the property ${label}`}
        data-tooltip="Remove property"
        onClick={() => removeProperty(runtime, block.id, propPath)}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}

/**
 * One content field of a block in a saved section: its input (the component's own value, the
 * default every copy starts with) and the property button or chip. `bind`: the field's bind
 * button, when it has one.
 */
export function PropertySlot({ block, propPath, label, children }: { block: Block; propPath: string; label: string; children: ReactNode }) {
  const name = propertyOf(block.bindings?.[propPath] ?? '')
  if (name) {
    return (
      <div className="builder-prop builder-prop--bound">
        {children}
        <PropertyChip block={block} propPath={propPath} name={name} />
      </div>
    )
  }
  return (
    <div className="builder-bind">
      {children}
      <PropertyButton block={block} propPath={propPath} label={label} />
    </div>
  )
}

/** "Visible": a property that shows or hides the block in each copy. Saved sections only. */
export function VisibleProperty({ block }: { block: Block }) {
  const runtime = useRuntime()
  if (!editsSection(runtime) || block.type === SECTION_REF_BLOCK) return null
  const name = propertyOf(block.bindings?.[VISIBLE_BINDING] ?? '')
  const typeLabel = runtime.blockLabel(block.type)
  return (
    <div className="builder-prop builder-prop--visible">
      <div className="builder-bind">
        <span className="builder-prop__row-label">Visible</span>
        {!name && <PropertyButton block={block} propPath={VISIBLE_BINDING} label={`Show ${(block.label ?? typeLabel).toLowerCase()}`} />}
      </div>
      {name && <PropertyChip block={block} propPath={VISIBLE_BINDING} name={name} />}
    </div>
  )
}

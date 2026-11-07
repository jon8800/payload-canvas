'use client'

// Section variants in the editor: the ‹ 2 / 3 › arrows of a library card and the variant switch
// on the canvas action bar of an inserted section (docs: core/sections.ts).

import { findBlock, hasVariants, sectionVersions, switchSectionVariant, versionIndex } from '../../../core'
import type { SectionDefinition } from '../../../core/types'
import { storesBuilderData } from '../actions'
import { Icon } from '../icons'
import { useRuntime, type Runtime } from '../runtime'
import { useEditor } from '../store'
import './variants.scss'

/** The app section a block was inserted from, when it has variants to switch between. */
export function switchableSection(runtime: Runtime, id: string): SectionDefinition | null {
  const block = findBlock(runtime.store.getState().layout, id)
  const origin = block?.section
  if (!origin || !storesBuilderData(runtime)) return null
  const section = (runtime.config.sections ?? []).find((s) => s.id === origin.id && s.savedId === undefined)
  return section && hasVariants(section) ? section : null
}

/**
 * Replaces the section at `id` with another version of it, as one undo step, and keeps the
 * content the user changed. Selects the new root block. False when it cannot.
 */
export function switchVariant(runtime: Runtime, id: string, variant: string | undefined): boolean {
  const { layout } = runtime.store.getState()
  const result = switchSectionVariant(layout, id, runtime.config.sections ?? [], variant)
  if (typeof result === 'string') {
    runtime.notify(result)
    return false
  }
  // The operations carry every locale's data already (stored form): no locale stamping.
  if (!runtime.store.apply(result.ops, { select: result.block.id, stampLocale: false })) {
    runtime.notify('This version of the section cannot go here.')
    return false
  }
  runtime.notify(`Switched to ${result.label}. Undo goes back.`)
  return true
}

type ArrowsProps = {
  /** Versions in order; the shown one is `index`. */
  count: number
  index: number
  /** Text between the arrows, e.g. "Split · 2 / 3". */
  text: string
  /** Names the control for screen readers, e.g. "Hero versions". */
  label: string
  onChange: (index: number) => void
  className?: string
  buttonClassName?: string
}

/** ‹ text › : flips through `count` versions, wrapping around at both ends. */
export function VariantArrows({ count, index, text, label, onChange, className, buttonClassName }: ArrowsProps) {
  const step = (delta: number) => onChange((index + delta + count) % count)
  return (
    <fieldset aria-label={label} className={`builder-variants${className ? ` ${className}` : ''}`}>
      <button type="button" className={buttonClassName ?? 'builder-variants__arrow'} aria-label="Previous version" data-tooltip="Previous version" onClick={() => step(-1)}>
        <Icon name="chevronLeft" size={12} />
      </button>
      <span className="builder-variants__text" aria-live="polite">
        {text}
      </span>
      <button type="button" className={buttonClassName ?? 'builder-variants__arrow'} aria-label="Next version" data-tooltip="Next version" onClick={() => step(1)}>
        <Icon name="chevronRight" size={12} />
      </button>
    </fieldset>
  )
}

/**
 * The variant switch on the action bar of a selected section root: ‹ Split › switches the
 * section to the previous or next version in place. Renders nothing for other blocks.
 */
export function SectionVariantSwitch({ id }: { id: string }) {
  const runtime = useRuntime()
  // Re-render when the block's origin changes (a switch, an undo).
  const origin = useEditor(runtime.store, (s) => findBlock(s.layout, id)?.section)
  const section = origin ? switchableSection(runtime, id) : null
  if (!section || !origin) return null
  const versions = sectionVersions(section)
  const index = Math.max(0, versionIndex(section, origin.variant))
  const current = versions[index]!
  return (
    <>
      <VariantArrows
        count={versions.length}
        index={index}
        text={current.label}
        label={`${section.label} versions`}
        className="builder-variants--bar"
        buttonClassName="builder-editor__action"
        onChange={(next) => switchVariant(runtime, id, versions[next]!.variant)}
      />
      <span className="builder-editor__actions-sep" aria-hidden="true" />
    </>
  )
}

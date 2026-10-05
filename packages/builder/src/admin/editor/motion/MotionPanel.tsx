'use client'

// The Motion tab: a block's animations (`block.motion`). One section per kind, in the Styles
// panel's look. Every edit is an `update` operation that sends the whole kind (it replaces the
// kind), so undo, multiplayer and the AI see the same data. A slider drag is one undo step.

import { CheckboxInput } from '@payloadcms/ui'
import { memo, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'

import {
  DEFAULT_STAGGER,
  describeMotion,
  findBlock,
  getBlockDefinition,
  MOTION_EASING_INFO,
  MOTION_PRESET_INFO,
  type BlockMotion,
  type MotionKind,
  type MotionPatch,
} from '../../../core'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { ChevronIcon, ResetIcon } from '../styles/icons'
import { stopEditorKeys } from '../styles/popover'
import { Select, type SelectOption } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { clamp, enterValues, fromPercent, hoverValue, loopValues, pressScale, scrollValue, toPercent, usesDistance, withPreset, withValue } from './model'
import { previewMotion } from './play'
import '../styles/styles.scss'
import './motion.scss'

const presetOptions = (kind: MotionKind): SelectOption[] => MOTION_PRESET_INFO[kind].map(({ value, label }) => ({ value, label }))
const OPTIONS = {
  enter: presetOptions('enter'),
  hover: presetOptions('hover'),
  scroll: presetOptions('scroll'),
  loop: presetOptions('loop'),
  easing: MOTION_EASING_INFO.map(({ value, label }) => ({ value, label })),
}

const describePreset = (kind: MotionKind, preset: string | undefined) => MOTION_PRESET_INFO[kind].find((p) => p.value === preset)?.description

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

type Edit = {
  /** Picks a preset (null removes the kind), then plays it on the canvas. */
  preset: (kind: MotionKind, preset: string | null) => void
  /** Changes one setting of a kind that is set. `undefined` goes back to the default. */
  value: (kind: MotionKind, key: string, value: unknown) => void
  remove: (kinds: MotionKind[]) => void
  preview: () => void
}

function useEdit(blockId: string): Edit {
  const runtime = useRuntime()
  return useMemo(() => {
    // Motion is not translated: read the stored layout, not the locale view.
    const current = () => findBlock(runtime.store.getState().layout, blockId)?.motion
    const apply = (motion: MotionPatch, mergeKey?: string) =>
      runtime.store.apply({ type: 'update', id: blockId, motion }, mergeKey ? { mergeKey } : undefined)
    const preview = () => previewMotion(runtime, blockId)
    return {
      preset(kind, preset) {
        if (preset === null) {
          apply({ [kind]: null })
          return
        }
        if (apply({ [kind]: withPreset(kind, current()?.[kind], preset) }) && kind !== 'press') preview()
      },
      value(kind, key, value) {
        const kindValue = current()?.[kind]
        if (!kindValue) return
        apply({ [kind]: withValue(kindValue, key, value) }, `motion:${blockId}:${kind}:${key}`)
      },
      remove(kinds) {
        apply(Object.fromEntries(kinds.map((kind) => [kind, null])))
      },
      preview,
    }
  }, [runtime, blockId])
}

// ---------------------------------------------------------------------------
// Layout pieces (the Styles panel's classes)
// ---------------------------------------------------------------------------

function Section({
  title,
  set,
  removeLabel,
  onRemove,
  startOpen = false,
  children,
}: {
  title: string
  set: boolean
  removeLabel: string
  onRemove: () => void
  startOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(set || startOpen)
  return (
    <section className="builder-styles__section" data-open={open}>
      <div className="builder-motion__head">
        <button type="button" className="builder-styles__section-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="builder-styles__chevron">
            <ChevronIcon />
          </span>
          {title}
          {set && <span className="builder-styles__dot" data-tooltip="Has an animation" />}
        </button>
        <button type="button" className="builder-styles__reset" hidden={!set} data-tooltip={set ? removeLabel : undefined} aria-label={removeLabel} onClick={onRemove}>
          <ResetIcon />
        </button>
      </div>
      {open && <div className="builder-styles__section-body">{children}</div>}
    </section>
  )
}

/** Label, control and a reset button (shown while the setting is not the default). */
function Row({ label, isSet = false, onReset, children }: { label: string; isSet?: boolean; onReset?: () => void; children: ReactNode }) {
  return (
    <div className="builder-styles__row">
      <span className="builder-styles__label-cell" data-source={isSet ? 'set' : 'none'}>
        <span className="builder-styles__label">{label}</span>
      </span>
      <div className="builder-styles__control">{children}</div>
      {onReset ? (
        <button
          type="button"
          className="builder-styles__reset"
          hidden={!isSet}
          data-tooltip={isSet ? 'Use the default' : undefined}
          aria-label={`Reset ${label}`}
          onClick={onReset}
        >
          <ResetIcon />
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

type NumberRowProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  isSet: boolean
  onChange: (value: number) => void
  onReset: () => void
}

function NumberRow({ label, value, min, max, step, unit, isSet, onChange, onReset }: NumberRowProps) {
  return (
    <Row label={label} isSet={isSet} onReset={onReset}>
      <div className="builder-styles__slider">
        <Slider value={clamp(value, min, max)} min={min} max={max} step={step} muted={!isSet} aria-label={label} onValueChange={onChange} />
        <span className="builder-styles__slider-value builder-motion__value" data-source={isSet ? 'set' : 'none'}>
          {value}
          {unit}
        </span>
      </div>
    </Row>
  )
}

type PresetRowProps = { label: string; name: string; preset: string | undefined; options: SelectOption[]; onChange: (preset: string | null) => void }

function PresetRow({ label, name, preset, options, onChange }: PresetRowProps) {
  return (
    <Row label={label} isSet={preset !== undefined}>
      <Select size="compact" value={preset ?? null} options={options} emptyLabel="None" onValueChange={onChange} aria-label={name} />
    </Row>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="builder-motion__note">{children}</p>
}

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="builder-motion__check">
      <CheckboxInput
        id={id}
        name={id}
        label={label}
        checked={checked}
        onToggle={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const TRIGGERS = [
  { value: 'view', label: 'On scroll' },
  { value: 'load', label: 'On page load' },
] as const

function EnterSection({ blockId, enter, hasSlots, edit }: { blockId: string; enter: BlockMotion['enter']; hasSlots: boolean; edit: Edit }) {
  const v = enter ? enterValues(enter) : null
  const set = (key: string) => (value: unknown) => edit.value('enter', key, value)
  const reset = (key: string) => () => edit.value('enter', key, undefined)
  return (
    <Section title="Entrance" set={Boolean(enter)} removeLabel="Remove the entrance" onRemove={() => edit.remove(['enter'])} startOpen>
      <PresetRow label="Effect" name="Entrance effect" preset={enter?.preset} options={OPTIONS.enter} onChange={(p) => edit.preset('enter', p)} />
      <Note>{enter ? describePreset('enter', enter.preset) : 'Plays when the block scrolls into view or the page loads.'}</Note>
      {enter && v && (
        <>
          <Row label="Starts" isSet={enter.trigger !== undefined} onReset={reset('trigger')}>
            <div className="builder-styles__segmented-wrap">
              <fieldset className="builder-styles__segmented" aria-label="Starts">
                {TRIGGERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className="builder-styles__segment"
                    aria-pressed={v.trigger === t.value}
                    onClick={() => set('trigger')(t.value === 'view' ? undefined : t.value)}
                  >
                    <span className="builder-styles__segment-text">{t.label}</span>
                  </button>
                ))}
              </fieldset>
            </div>
          </Row>
          <NumberRow label="Duration" value={v.duration} min={100} max={2000} step={50} unit="ms" isSet={enter.duration !== undefined} onChange={set('duration')} onReset={reset('duration')} />
          <NumberRow label="Delay" value={v.delay} min={0} max={2000} step={50} unit="ms" isSet={enter.delay !== undefined} onChange={set('delay')} onReset={reset('delay')} />
          <Row label="Easing" isSet={enter.easing !== undefined} onReset={reset('easing')}>
            <Select size="compact" value={v.easing} options={OPTIONS.easing} onValueChange={(value) => set('easing')(value ?? undefined)} aria-label="Easing" />
          </Row>
          {usesDistance(enter.preset) && (
            <NumberRow label="Distance" value={v.distance} min={0} max={120} step={2} unit="px" isSet={enter.distance !== undefined} onChange={set('distance')} onReset={reset('distance')} />
          )}
          {v.trigger === 'view' && (
            <>
              <NumberRow
                label="In view"
                value={toPercent(v.amount)}
                min={0}
                max={100}
                step={5}
                unit="%"
                isSet={enter.amount !== undefined}
                onChange={(n) => set('amount')(fromPercent(n))}
                onReset={reset('amount')}
              />
              <Check id={`builder-${blockId}-motion-repeat`} label="Every time" checked={v.repeat} onChange={(on) => set('repeat')(on || undefined)} />
            </>
          )}
          {hasSlots && (
            <>
              <Check
                id={`builder-${blockId}-motion-stagger`}
                label="Stagger children"
                checked={v.stagger > 0}
                onChange={(on) => set('stagger')(on ? DEFAULT_STAGGER : undefined)}
              />
              {v.stagger > 0 && (
                <>
                  <NumberRow label="Gap" value={v.stagger} min={20} max={300} step={10} unit="ms" isSet={v.stagger !== DEFAULT_STAGGER} onChange={set('stagger')} onReset={() => set('stagger')(DEFAULT_STAGGER)} />
                  <Note>Child blocks play one after another. This block stays still.</Note>
                </>
              )}
            </>
          )}
        </>
      )}
    </Section>
  )
}

function HoverSection({ blockId, hover, press, edit }: { blockId: string; hover: BlockMotion['hover']; press: BlockMotion['press']; edit: Edit }) {
  const hoverNumber = hover ? hoverValue(hover) : 0
  const hoverKey = hover?.preset === 'lift' ? 'distance' : hover?.preset === 'grow' ? 'scale' : 'angle'
  const hoverSet = hover !== undefined && hover[hoverKey] !== undefined
  return (
    <Section
      title="Hover and press"
      set={Boolean(hover || press)}
      removeLabel="Remove hover and press"
      onRemove={() => edit.remove(['hover', 'press'])}
    >
      <PresetRow label="Hover" name="Hover effect" preset={hover?.preset} options={OPTIONS.hover} onChange={(p) => edit.preset('hover', p)} />
      <Note>{hover ? describePreset('hover', hover.preset) : 'Plays while the pointer is over the block. Not on touch screens.'}</Note>
      {hover?.preset === 'lift' && (
        <NumberRow label="Distance" value={hoverNumber} min={0} max={20} step={1} unit="px" isSet={hoverSet} onChange={(n) => edit.value('hover', 'distance', n)} onReset={() => edit.value('hover', 'distance', undefined)} />
      )}
      {hover?.preset === 'grow' && (
        <NumberRow
          label="Scale"
          value={toPercent(hoverNumber)}
          min={100}
          max={120}
          step={1}
          unit="%"
          isSet={hoverSet}
          onChange={(n) => edit.value('hover', 'scale', fromPercent(n))}
          onReset={() => edit.value('hover', 'scale', undefined)}
        />
      )}
      {hover?.preset === 'tilt' && (
        <NumberRow label="Angle" value={hoverNumber} min={0} max={20} step={1} unit="°" isSet={hoverSet} onChange={(n) => edit.value('hover', 'angle', n)} onReset={() => edit.value('hover', 'angle', undefined)} />
      )}
      <Check id={`builder-${blockId}-motion-press`} label="Shrink on press" checked={Boolean(press)} onChange={(on) => edit.preset('press', on ? 'shrink' : null)} />
      {press && (
        <NumberRow
          label="Scale"
          value={toPercent(pressScale(press.scale))}
          min={85}
          max={100}
          step={1}
          unit="%"
          isSet={press.scale !== undefined}
          onChange={(n) => edit.value('press', 'scale', fromPercent(n))}
          onReset={() => edit.value('press', 'scale', undefined)}
        />
      )}
    </Section>
  )
}

function ScrollSection({ scroll, edit }: { scroll: BlockMotion['scroll']; edit: Edit }) {
  const n = scroll ? scrollValue(scroll) : 0
  return (
    <Section title="Scroll" set={Boolean(scroll)} removeLabel="Remove the scroll effect" onRemove={() => edit.remove(['scroll'])}>
      <PresetRow label="Effect" name="Scroll effect" preset={scroll?.preset} options={OPTIONS.scroll} onChange={(p) => edit.preset('scroll', p)} />
      <Note>{scroll ? describePreset('scroll', scroll.preset) : 'Follows the scroll while the block passes through the window.'}</Note>
      {scroll?.preset === 'parallax' && (
        <NumberRow
          label="Distance"
          value={n}
          min={-300}
          max={300}
          step={10}
          unit="px"
          isSet={scroll.distance !== undefined}
          onChange={(value) => edit.value('scroll', 'distance', value)}
          onReset={() => edit.value('scroll', 'distance', undefined)}
        />
      )}
      {scroll?.preset === 'zoom' && (
        <NumberRow
          label="Start size"
          value={toPercent(n)}
          min={50}
          max={150}
          step={5}
          unit="%"
          isSet={scroll.scale !== undefined}
          onChange={(value) => edit.value('scroll', 'scale', fromPercent(value))}
          onReset={() => edit.value('scroll', 'scale', undefined)}
        />
      )}
    </Section>
  )
}

function LoopSection({ loop, edit }: { loop: BlockMotion['loop']; edit: Edit }) {
  const v = loop ? loopValues(loop) : null
  return (
    <Section title="Loop" set={Boolean(loop)} removeLabel="Remove the loop" onRemove={() => edit.remove(['loop'])}>
      <PresetRow label="Effect" name="Loop effect" preset={loop?.preset} options={OPTIONS.loop} onChange={(p) => edit.preset('loop', p)} />
      <Note>{loop ? describePreset('loop', loop.preset) : 'Plays again and again while the block is in view. Use it on small blocks only.'}</Note>
      {loop && v && (
        <>
          <NumberRow
            label="Duration"
            value={v.duration}
            min={500}
            max={8000}
            step={100}
            unit="ms"
            isSet={loop.duration !== undefined}
            onChange={(n) => edit.value('loop', 'duration', n)}
            onReset={() => edit.value('loop', 'duration', undefined)}
          />
          {loop.preset === 'float' ? (
            <NumberRow
              label="Distance"
              value={v.distance}
              min={0}
              max={40}
              step={1}
              unit="px"
              isSet={loop.distance !== undefined}
              onChange={(n) => edit.value('loop', 'distance', n)}
              onReset={() => edit.value('loop', 'distance', undefined)}
            />
          ) : (
            <NumberRow
              label="Scale"
              value={toPercent(v.scale)}
              min={100}
              max={120}
              step={1}
              unit="%"
              isSet={loop.scale !== undefined}
              onChange={(n) => edit.value('loop', 'scale', fromPercent(n))}
              onReset={() => edit.value('loop', 'scale', undefined)}
            />
          )}
        </>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

type MotionPanelProps = { blockId: string; blockType: string; motion: BlockMotion | undefined }

/** Renders only when the block's motion changes, not on content or style edits. */
export const MotionPanel = memo(function MotionPanel({ blockId, blockType, motion }: MotionPanelProps) {
  const runtime = useRuntime()
  const edit = useEdit(blockId)
  const def = getBlockDefinition(runtime.config.blocks, blockType)
  const hasSlots = Object.keys(def?.slots ?? {}).length > 0
  const summary = describeMotion(motion)
  // The canvas previews an entrance, or else a hover and press effect.
  const canPreview = Boolean(motion?.enter || motion?.hover || motion?.press)

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only stops editor shortcuts from bubbling
    <div className="builder-styles builder-motion" onKeyDown={stopEditorKeys}>
      <div className="builder-motion__bar">
        <p className="builder-motion__summary" data-empty={!summary || undefined}>
          {summary || 'No animation'}
        </p>
        <button
          type="button"
          className="builder-styles__button builder-motion__preview"
          disabled={!canPreview}
          data-tooltip={canPreview ? 'Preview the animation' : undefined}
          onClick={edit.preview}
        >
          <Icon name="play" size={12} />
          Preview
        </button>
      </div>
      <EnterSection blockId={blockId} enter={motion?.enter} hasSlots={hasSlots} edit={edit} />
      <HoverSection blockId={blockId} hover={motion?.hover} press={motion?.press} edit={edit} />
      <ScrollSection scroll={motion?.scroll} edit={edit} />
      <LoopSection loop={motion?.loop} edit={edit} />
      <p className="builder-motion__foot">The canvas shows blocks at rest. Use Preview, or turn on Play animations under the canvas.</p>
    </div>
  )
})

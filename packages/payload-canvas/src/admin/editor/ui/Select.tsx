'use client'

// The builder's one select, on Base UI `Select`. Use it instead of a native <select>, so every
// select looks like Payload's inputs in light and dark and behaves the same:
//
// - Enter, Space and the arrow keys open it; arrows, Home and End move; typing a letter jumps
//   to the matching option (also while closed);
// - the list renders in a portal with fixed positioning, so no scroll container clips it;
// - a press in the canvas iframe or a selection change closes it (the editor's dismiss signal).
//
// `value` is a string, or null for "no value". `emptyLabel` adds a first option with the value
// null, and its label shows in the trigger while nothing is chosen.

import { Select as BaseSelect } from '@base-ui/react/select'
import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from 'react'

import { onDismissMenus } from '../menu/dismiss'
import './controls.scss'

export type SelectOption = {
  value: string
  label: string
  /** Shown after the label in the list and in the trigger, e.g. a dot for "has values". */
  suffix?: ReactNode
  disabled?: boolean
}

export type SelectGroup = { group: string; options: SelectOption[] }

export type SelectEntry = SelectOption | SelectGroup | 'separator'

type TriggerProps = Omit<ComponentPropsWithoutRef<'button'>, 'value' | 'defaultValue' | 'onChange' | 'children' | 'disabled'>

export type SelectProps = TriggerProps & {
  value: string | null
  onValueChange: (value: string | null) => void
  options: SelectEntry[]
  /** Adds a first option with the value null. Its label shows in the trigger while the value is null. */
  emptyLabel?: string
  /** Shown while the value is null and there is no `emptyLabel`. */
  placeholder?: string
  /** `compact`: the Styles panel size (26 px). `default`: Payload's field size. */
  size?: 'default' | 'compact'
  disabled?: boolean
  /** Replaces the trigger's content, e.g. an icon. The trigger then shows no value and no chevron. */
  trigger?: ReactNode
  /** Tooltip of the trigger (`data-tooltip`). Hidden while the list is open. */
  tooltip?: string
}

const isGroup = (entry: SelectEntry): entry is SelectGroup => typeof entry === 'object' && 'group' in entry

function flatten(entries: SelectEntry[]): SelectOption[] {
  return entries.flatMap((entry) => (entry === 'separator' ? [] : isGroup(entry) ? entry.options : [entry]))
}

/**
 * Where the list renders. Inside an open popover or dialog: in it, so the list stays in the same
 * top layer. In the editor: in its root, for its fonts and CSS variables. Else `document.body`.
 */
function portalTarget(trigger: HTMLElement | null): HTMLElement | null {
  if (!trigger) return null
  try {
    const layer = trigger.closest<HTMLElement>(':popover-open, dialog[open]')
    if (layer) return layer
  } catch {
    // A browser without `:popover-open`: no popovers to look for.
  }
  return trigger.closest<HTMLElement>('.builder-editor')
}

function ChevronDown() {
  return (
    <svg aria-hidden="true" width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  )
}

function Check() {
  return (
    <svg aria-hidden="true" width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="m2.5 6.25 2.25 2.25 4.75-5" />
    </svg>
  )
}

function Item({ value, label, suffix, disabled }: { value: string | null; label: string; suffix?: ReactNode; disabled?: boolean }) {
  return (
    <BaseSelect.Item className="builder-select__item" value={value} label={label} disabled={disabled}>
      <span className="builder-select__check">
        <BaseSelect.ItemIndicator>
          <Check />
        </BaseSelect.ItemIndicator>
      </span>
      <BaseSelect.ItemText className="builder-select__item-text">{label}</BaseSelect.ItemText>
      {suffix}
    </BaseSelect.Item>
  )
}

export function Select({
  value,
  onValueChange,
  options,
  emptyLabel,
  placeholder = '–',
  size = 'default',
  disabled,
  trigger,
  tooltip,
  className,
  ...triggerProps
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const container = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return portalTarget(triggerRef.current)
      },
    }),
    [],
  )
  const flat = useMemo(() => flatten(options), [options])
  // A value with no option (a class typed by hand) still shows, as itself.
  const missing = value !== null && !flat.some((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    return onDismissMenus(() => setOpen(false))
  }, [open])

  const renderValue = (current: string | null) => {
    if (current === null) return emptyLabel ?? placeholder
    const option = flat.find((o) => o.value === current)
    if (!option) return current
    return (
      <>
        {option.label}
        {option.suffix}
      </>
    )
  }

  return (
    <BaseSelect.Root<string | null>
      value={value}
      onValueChange={(next) => onValueChange(next ?? null)}
      open={open}
      onOpenChange={setOpen}
      modal={false}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        ref={triggerRef}
        className={`builder-select builder-select--${size}${trigger ? ' builder-select--custom' : ''}${className ? ` ${className}` : ''}`}
        data-tooltip={open ? undefined : tooltip}
        {...triggerProps}
      >
        {trigger ?? (
          <>
            <BaseSelect.Value className="builder-select__value">{renderValue}</BaseSelect.Value>
            <BaseSelect.Icon className="builder-select__icon">
              <ChevronDown />
            </BaseSelect.Icon>
          </>
        )}
      </BaseSelect.Trigger>
      <BaseSelect.Portal container={container}>
        <BaseSelect.Positioner
          className="builder-select__positioner"
          alignItemWithTrigger={false}
          positionMethod="fixed"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          <BaseSelect.Popup className={`builder-select__popup builder-select__popup--${size}`}>
            <BaseSelect.List className="builder-select__list">
              {emptyLabel !== undefined && <Item value={null} label={emptyLabel} />}
              {options.map((entry, i) => {
                if (entry === 'separator') {
                  // oxlint-disable-next-line react/no-array-index-key -- separators have no identity
                  return <BaseSelect.Separator key={`sep-${i}`} className="builder-select__separator" />
                }
                if (isGroup(entry)) {
                  return (
                    <BaseSelect.Group key={`group-${entry.group}`} className="builder-select__group">
                      <BaseSelect.GroupLabel className="builder-select__group-label">{entry.group}</BaseSelect.GroupLabel>
                      {entry.options.map((o) => (
                        <Item key={o.value} {...o} />
                      ))}
                    </BaseSelect.Group>
                  )
                }
                return <Item key={entry.value} {...entry} />
              })}
              {missing && <Item value={value} label={value} />}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

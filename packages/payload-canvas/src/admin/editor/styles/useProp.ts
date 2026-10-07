'use client'

import { BREAKPOINTS, type StylePropertyDef, type StyleValue } from '../../../core'
import { useStyles } from './context'
import { propertyDef } from './model'

export type PropState = {
  def: StylePropertyDef | undefined
  value: StyleValue | null
  /** True when a class sets this property at exactly this variant. */
  isSet: boolean
  /**
   * The value the canvas shows instead, from a larger breakpoint than the one being edited
   * (`md:text-6xl` while editing base). Null when the edited value is what the canvas shows.
   */
  override: StyleValue | null
  set: (value: string | null, options?: { negative?: boolean }) => void
}

export function useProp(prop: string): PropState {
  const { read, canvasRead, variant, set } = useStyles()
  const value = read.get(prop)
  const shown = canvasRead?.get(prop) ?? null
  const override = shown && BREAKPOINTS.indexOf(shown.variant.breakpoint) > BREAKPOINTS.indexOf(variant.breakpoint) ? shown : null
  return {
    def: propertyDef(prop),
    value,
    isSet: value?.source === 'set',
    override,
    set: (v, options) => set(prop, v, options),
  }
}

/** "Overridden at md by md:text-6xl." */
export function overrideHint(override: StyleValue): string {
  return `Overridden at ${override.variant.breakpoint} and wider by ${override.className}.`
}

/** Tooltip that says where a value comes from. */
export function sourceHint(value: StyleValue | null): string | undefined {
  if (!value) return undefined
  if (value.source === 'set') return `Set by ${value.className}`
  if (value.source === 'shorthand') return `From the shorthand ${value.className}`
  return `Inherited from ${value.className}`
}

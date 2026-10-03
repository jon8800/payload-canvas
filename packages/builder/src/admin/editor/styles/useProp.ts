'use client'

import type { StylePropertyDef, StyleValue } from '../../../core'
import { useStyles } from './context'
import { propertyDef } from './model'

export type PropState = {
  def: StylePropertyDef | undefined
  value: StyleValue | null
  /** True when a class sets this property at exactly this variant. */
  isSet: boolean
  set: (value: string | null, options?: { negative?: boolean }) => void
}

export function useProp(prop: string): PropState {
  const { read, set } = useStyles()
  const value = read.get(prop)
  return {
    def: propertyDef(prop),
    value,
    isSet: value?.source === 'set',
    set: (v, options) => set(prop, v, options),
  }
}

/** Tooltip that says where a value comes from. */
export function sourceHint(value: StyleValue | null): string | undefined {
  if (!value) return undefined
  if (value.source === 'set') return `Set by ${value.className}`
  if (value.source === 'shorthand') return `From the shorthand ${value.className}`
  return `Inherited from ${value.className}`
}

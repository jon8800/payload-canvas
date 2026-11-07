// Where the theme's design variables are used: blocks in every builder layout (pages, posts,
// templates, saved sections; open live sessions first) and the editable classes. The Theme form
// warns before a rename or delete of a variable in use. Server-only.

import type { Endpoint, PayloadRequest } from 'payload'

import { loadClasses } from '../classes/actions'
import { classesConfigOf } from '../classes/config'
import type { ClassUsageDocument } from '../classes/shared'
import { scanLayouts } from '../classes/usage'
import { walkBlocks } from '../core/tree'
import type { Layout } from '../core/types'
import { THEME_PATH } from './config'
import { themeVariablesOf } from './server'
import { textUsesVariable, type ThemeVariable, type ThemeVariableType } from './variables'

/** Where one variable is used. */
export type VariableUsage = {
  /** Blocks (and inner parts) that use it. */
  blocks: number
  documents: ClassUsageDocument[]
  /** Editable classes whose styles or custom CSS use it. */
  classes: string[]
}

/** Path below the API route: `GET` where each variable is used. `?variables=color:brand,size:gutter` limits it. */
export const VARIABLE_USAGE_PATH = `${THEME_PATH}/variables/usage`

type Wanted = Pick<ThemeVariable, 'name' | 'type'>

/** Blocks of a layout that use the variable (their classes or their parts' classes). */
export function countVariableUses(layout: Layout, variable: Wanted): number {
  let count = 0
  walkBlocks(layout, (block) => {
    const texts = [block.className, ...Object.values(block.partClassName ?? {})]
    if (texts.some((text) => typeof text === 'string' && textUsesVariable(text, variable))) count++
  })
  return count
}

/** Where each variable is used, in the documents and classes the request's user may read. Keyed by name. */
export async function variableUsage(req: PayloadRequest, variables: readonly Wanted[]): Promise<Record<string, VariableUsage>> {
  const usage: Record<string, VariableUsage> = Object.fromEntries(variables.map((v) => [v.name, { blocks: 0, documents: [], classes: [] }]))
  if (variables.length === 0) return usage
  const [layouts, classes] = await Promise.all([
    scanLayouts(req, true),
    classesConfigOf(req.payload) ? loadClasses(req).catch(() => []) : Promise.resolve([]),
  ])
  for (const variable of variables) {
    const entry = usage[variable.name]!
    for (const { collection, id, title, layout } of layouts) {
      const blocks = countVariableUses(layout, variable)
      if (blocks === 0) continue
      entry.blocks += blocks
      entry.documents.push({ collection, id, title, blocks })
    }
    for (const item of classes) {
      if (textUsesVariable(item.styles, variable) || textUsesVariable(item.css, variable)) entry.classes.push(item.name)
    }
  }
  return usage
}

const TYPES = new Set<ThemeVariableType>(['color', 'size', 'font'])

/** `color:brand,size:gutter` → the variables. Unknown types are left out. */
export function parseVariablesParam(value: string): Wanted[] {
  return value
    .split(',')
    .map((part) => part.trim().split(':'))
    .flatMap(([type, name]) => (type && name && TYPES.has(type as ThemeVariableType) ? [{ type: type as ThemeVariableType, name }] : []))
}

export function variableUsageEndpoint(): Endpoint {
  return {
    path: VARIABLE_USAGE_PATH,
    method: 'get',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Sign in to see where variables are used.' }, { status: 401 })
      const asked = typeof req.searchParams?.get === 'function' ? req.searchParams.get('variables') : null
      const variables = asked ? parseVariablesParam(asked) : await themeVariablesOf(req.payload)
      return Response.json({ usage: await variableUsage(req, variables) }, { headers: { 'Cache-Control': 'no-store' } })
    },
  }
}

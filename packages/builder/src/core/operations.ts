import type { ApplyResult, Layout, Operation } from './types'

/** Applies one operation. Never mutates the input. Returns the inverse operations for undo. */
export function applyOperation(layout: Layout, op: Operation): ApplyResult {
  throw new Error('not implemented')
}

/** Applies operations in order. Fails as a whole if any fails. `inverse` undoes all of them. */
export function applyOperations(layout: Layout, ops: Operation[]): ApplyResult {
  throw new Error('not implemented')
}

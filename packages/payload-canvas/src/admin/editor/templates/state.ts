'use client'

// Template mode state and the `context` message to the canvas.

import type { BuilderClientConfig, TemplateContext } from '../../../core/types'
import { post, type AdminToCanvas } from '../../../protocol'

export type Id = string | number

export type SampleDoc = { id: Id; title: string; doc: Record<string, unknown> }

export type TemplateState = {
  /** The document is a template: its collection is the templates collection. */
  isTemplate: boolean
  /** Slug of the collection the template is for. Null until the designer chooses one. */
  target: string | null
  /** Document the designer picked in the toolbar. Null: the template's preview document, else the newest. */
  choice: Id | null
  /** The document the canvas previews, loaded with depth 1 and drafts. */
  sample: SampleDoc | null
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  error: string | null
}

export function isTemplateDoc(config: BuilderClientConfig): boolean {
  return Boolean(config.templates && config.collection === config.templates.collection)
}

export function initialTemplateState(config: BuilderClientConfig): TemplateState {
  return { isTemplate: isTemplateDoc(config), target: null, choice: null, sample: null, status: 'idle', error: null }
}

/** The canvas context for a template state: the sample document, or null. */
export function templateContext(state: TemplateState): TemplateContext | null {
  if (!state.isTemplate || !state.target || !state.sample) return null
  return { collection: state.target, doc: state.sample.doc }
}

/** Admin -> canvas: the document a template renders. Mirrors the protocol's `context` message. */
export type ContextMessage = { type: 'context'; context: TemplateContext | null }

/** Sends the template context to the canvas iframe. */
export function postContext(iframe: HTMLIFrameElement | null, context: TemplateContext | null) {
  const message: ContextMessage = { type: 'context', context }
  // The cast is a no-op once the protocol's AdminToCanvas union includes the context message.
  post(iframe?.contentWindow, message as unknown as AdminToCanvas)
}

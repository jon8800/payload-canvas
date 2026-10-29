'use client'

// The Styles tab: the classes field (the block's classes; a click on an editable class makes the
// controls edit it), the variant bar, the visual controls per style group, and while a class is
// edited, its other classes and custom CSS.

import { useEffect, useMemo, useRef, useState } from 'react'

import { bareClass, classTokens, mergeSiteClasses, type BuilderClass } from '../../../classes/shared'
import { STYLE_PROPERTIES } from '../../../core'
import type { Block, StyleTokens } from '../../../core/types'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { createValueStore, useValue } from '../valueStore'
import { ClassBar, ClassExtras } from './ClassBar'
import { ClassCss } from './ClassCss'
import { ClassDialog } from './ClassDialog'
import { StylesContext, writeClassStyle, writeStyle, type StylesContextValue } from './context'
import { createReader } from './model'
import { stopEditorKeys } from './popover'
import { StyleSections } from './sections'
import { BREAKPOINTS, breakpointAt, breakpointWidths, reloadStyleTokens, useStyleTokens, withFallback } from './tokens'
import { VariantBar } from './VariantBar'
import './styles.scss'

const NO_CLASSES = createValueStore<BuilderClass[]>([])
const NO_TARGET = createValueStore<string | number | null>(null)

/** The editable classes a class string uses (also by a former name), in its order, once each. */
function classesOn(className: string, list: readonly BuilderClass[]): BuilderClass[] {
  const out: BuilderClass[] = []
  for (const token of classTokens(className)) {
    const name = bareClass(token)
    const item = list.find((c) => c.name === name) ?? list.find((c) => c.previousNames?.includes(name))
    if (item && !out.includes(item)) out.push(item)
  }
  return out
}

/** The theme's tokens with the editable classes as site classes (suggestions, labels, known names). */
const withClasses = (tokens: StyleTokens, list: readonly BuilderClass[]): StyleTokens =>
  list.length > 0 ? { ...tokens, siteClasses: mergeSiteClasses(list, tokens.siteClasses) } : tokens

/** `part`: edit the classes of that inner element (`partClassName`, see `blockParts`) instead of the block's. */
export function StylesPanel({ block, part = null }: { block: Block; part?: string | null }) {
  const runtime = useRuntime()
  const { tokensEndpoint } = runtime.config
  const entry = useStyleTokens(tokensEndpoint)
  const classes = runtime.classes
  const classList = useValue(classes?.list ?? NO_CLASSES)
  const targetId = useValue(classes?.target ?? NO_TARGET)
  const tokens = useMemo(() => withClasses(withFallback(entry.tokens), classList), [entry.tokens, classList])
  const variant = useEditor(runtime.store, (s) => s.variant)
  const frame = useValue(runtime.frame)
  const widths = useMemo(() => breakpointWidths(tokens), [tokens])
  const canvasBreakpoint = frame.width > 0 ? breakpointAt(widths, frame.width) : 'base'
  const blockClassName = (part ? block.partClassName?.[part] : block.className) ?? ''
  const own = useMemo(() => classesOn(blockClassName, classList), [blockClassName, classList])
  // The class the controls edit: only one this block (or part) uses.
  const editing = targetId === null ? null : (own.find((c) => String(c.id) === String(targetId)) ?? null)
  const className = editing ? (editing.styles ?? '') : blockClassName
  const blockId = block.id
  const [error] = useState(() => createValueStore<string | null>(null))
  const message = useValue(error)
  // Another block without the class: back to "This block". (The same block may miss the class for
  // a moment, while a rename reaches its layout.)
  const shownBlock = useRef(blockId)
  useEffect(() => {
    if (shownBlock.current === blockId) return
    shownBlock.current = blockId
    if (targetId !== null && !editing) classes?.target.set(null)
  }, [blockId, targetId, editing, classes])

  const value = useMemo<StylesContextValue>(
    () => ({
      blockId,
      part,
      blockType: block.type,
      editingClass: editing,
      className,
      variant,
      tokens,
      read: createReader(className, variant, tokens),
      canvasRead:
        BREAKPOINTS.indexOf(canvasBreakpoint) > BREAKPOINTS.indexOf(variant.breakpoint)
          ? createReader(className, { ...variant, breakpoint: canvasBreakpoint }, tokens)
          : null,
      canvasBreakpoint,
      set: (property, v, options) =>
        error.set(
          editing && classes
            ? writeClassStyle(classes, editing.id, variant, tokens, property, v, options)
            : writeStyle(runtime, { blockId, part }, variant, tokens, property, v, options),
        ),
      error,
    }),
    [runtime, classes, editing, blockId, part, block.type, className, variant, tokens, error, canvasBreakpoint],
  )

  return (
    <StylesContext value={value}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only stops editor shortcuts from bubbling */}
      <div className="builder-styles" onKeyDown={stopEditorKeys}>
        <ClassBar className={blockClassName} own={own} />
        <VariantBar />
        {message && (
          <p className="builder-styles__hint builder-styles__hint--error" role="alert">
            {message}{' '}
            <button type="button" className="builder-styles__link" onClick={() => error.set(null)}>
              Dismiss
            </button>
          </p>
        )}
        {entry.error && (
          <p className="builder-styles__hint builder-styles__hint--error">
            Theme tokens did not load ({entry.error}).{' '}
            <button type="button" className="builder-styles__link" onClick={() => reloadStyleTokens(tokensEndpoint)}>
              Retry
            </button>
          </p>
        )}
        {STYLE_PROPERTIES.length > 0 ? (
          <StyleSections />
        ) : (
          <p className="builder-styles__hint">Visual style controls are not available yet. Edit the classes above.</p>
        )}
        {editing && <ClassExtras item={editing} />}
        {editing && <ClassCss item={editing} />}
      </div>
      {classes && <ClassDialog />}
    </StylesContext>
  )
}

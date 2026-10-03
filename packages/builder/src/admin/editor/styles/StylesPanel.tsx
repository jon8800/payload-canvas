'use client'

// The Styles tab: variant bar, visual controls per style group, and the raw classes field.

import { useMemo, useState } from 'react'

import { STYLE_PROPERTIES } from '../../../core'
import type { Block } from '../../../core/types'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { createValueStore, useValue } from '../valueStore'
import { StylesContext, writeClassName, writeStyle, type StylesContextValue } from './context'
import { createReader } from './model'
import { stopEditorKeys } from './popover'
import { RawClasses } from './RawClasses'
import { StyleSections } from './sections'
import { reloadStyleTokens, useStyleTokens, withFallback } from './tokens'
import { VariantBar } from './VariantBar'
import './styles.scss'

export function StylesPanel({ block }: { block: Block }) {
  const runtime = useRuntime()
  const { tokensEndpoint } = runtime.config
  const entry = useStyleTokens(tokensEndpoint)
  const tokens = useMemo(() => withFallback(entry.tokens), [entry.tokens])
  const variant = useEditor(runtime.store, (s) => s.variant)
  const className = block.className ?? ''
  const blockId = block.id
  const [error] = useState(() => createValueStore<string | null>(null))
  const message = useValue(error)

  const value = useMemo<StylesContextValue>(
    () => ({
      blockId,
      className,
      variant,
      tokens,
      read: createReader(className, variant, tokens),
      set: (property, v, options) => error.set(writeStyle(runtime, blockId, variant, tokens, property, v, options)),
      setClassName: (next, mergeKey) => writeClassName(runtime, blockId, next, mergeKey),
      error,
    }),
    [runtime, blockId, className, variant, tokens, error],
  )

  return (
    <StylesContext value={value}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only stops editor shortcuts from bubbling */}
      <div className="builder-styles" onKeyDown={stopEditorKeys}>
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
          <p className="builder-styles__hint">Visual style controls are not available yet. Edit the classes below.</p>
        )}
        <RawClasses />
      </div>
    </StylesContext>
  )
}

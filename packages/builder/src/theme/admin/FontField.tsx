'use client'

import { Combobox } from '@base-ui/react/combobox'
import { useField } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import { useEffect, useMemo, useRef, useState } from 'react'

import { googleFontsHref } from '../css'
import { FieldShell, labelText } from './FieldShell'
import { GOOGLE_FONTS } from './googleFonts'
import './fields.scss'

const MAX_VISIBLE = 50

/** Fonts already added to the admin page for previews. Shared by every font field. */
const loaded = new Set<string>()

function loadPreview(family: string) {
  if (loaded.has(family)) return
  loaded.add(family)
  const href = googleFontsHref([family])
  if (!href) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

/** A Google Font family: a searchable list that previews each font in its own typeface. */
export const ThemeFontField: TextFieldClientComponent = function ThemeFontField({ path, field, readOnly }) {
  const { value, setValue, disabled } = useField<string>({ path })
  const locked = Boolean(readOnly || disabled)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const fonts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q ? GOOGLE_FONTS.filter((font) => font.toLowerCase().includes(q)) : GOOGLE_FONTS
    return matches.slice(0, MAX_VISIBLE)
  }, [query])

  useEffect(() => {
    if (value) loadPreview(value)
  }, [value])

  // Load each font's preview only when its option scrolls into view.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const family = (entry.target as HTMLElement).dataset.font
          if (entry.isIntersecting && family) loadPreview(family)
        }
      },
      { root: list },
    )
    list.querySelectorAll('[data-font]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- observe the options again whenever the list changes
  }, [fonts])

  return (
    <FieldShell field={field} path={path} className="theme-font">
      <Combobox.Root
        value={value || null}
        disabled={locked}
        onValueChange={(next) => {
          setValue(next ?? '')
          setQuery('')
        }}
        onInputValueChange={setQuery}
      >
        <div className="theme-font__row">
          <Combobox.Input className="theme-font__input" placeholder="Search Google Fonts…" aria-label={`${labelText(field, path)} font`} />
          {value && !locked ? (
            <button type="button" className="theme-font__clear" onClick={() => setValue('')}>
              Clear
            </button>
          ) : null}
        </div>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="theme-popover">
            <Combobox.Popup className="theme-font__popup">
              <Combobox.List ref={listRef} className="theme-font__list">
                {fonts.map((font, index) => (
                  <Combobox.Item
                    key={font}
                    value={font}
                    index={index}
                    className="theme-font__option"
                    data-font={font}
                    style={{ fontFamily: `"${font}", sans-serif` }}
                  >
                    {font}
                  </Combobox.Item>
                ))}
              </Combobox.List>
              <Combobox.Empty className="theme-font__empty">No fonts found</Combobox.Empty>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      <div className="theme-font__preview" style={value ? { fontFamily: `"${value}", sans-serif` } : undefined}>
        {value ? `${value}: The quick brown fox jumps over the lazy dog` : 'Not set: the font from your CSS.'}
      </div>
    </FieldShell>
  )
}

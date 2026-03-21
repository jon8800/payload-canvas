'use client'

import type { TextFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'
import { Combobox } from '@base-ui/react/combobox'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GOOGLE_FONTS from '@/data/google-fonts.json'
import './FontSelector.scss'

const MAX_VISIBLE = 50

export const FontSelectorField: TextFieldClientComponent = function FontSelectorField({
  path,
  field,
}) {
  const { value, setValue } = useField<string>({ path })

  const label = typeof field.label === 'string' ? field.label : path
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

  const [inputValue, setInputValue] = useState('')
  const loadedFontsRef = useRef<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const filteredFonts = useMemo(() => {
    if (!inputValue) return GOOGLE_FONTS.slice(0, MAX_VISIBLE)
    const query = inputValue.toLowerCase()
    return GOOGLE_FONTS.filter((font) => font.toLowerCase().includes(query)).slice(0, MAX_VISIBLE)
  }, [inputValue])

  const loadFont = useCallback((fontName: string) => {
    if (loadedFontsRef.current.has(fontName)) return
    loadedFontsRef.current.add(fontName)
    const link = document.createElement('link')
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400&display=swap`
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }, [])

  // Load the currently selected font for preview in trigger
  useEffect(() => {
    if (value) loadFont(value)
  }, [value, loadFont])

  // IntersectionObserver for lazy font loading in dropdown
  useEffect(() => {
    const listEl = listRef.current
    if (!listEl) return

    observerRef.current?.disconnect()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const fontName = (entry.target as HTMLElement).dataset.font
            if (fontName) loadFont(fontName)
          }
        }
      },
      { root: listEl, threshold: 0 },
    )

    observerRef.current = observer
    listEl.querySelectorAll('[data-font]').forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [filteredFonts, loadFont])

  function handleClear() {
    setValue('')
    setInputValue('')
  }

  return (
    <div className="font-selector">
      <label className="font-selector__label">{label}</label>

      <Combobox.Root
        value={value || null}
        onValueChange={(newValue) => {
          setValue(newValue ?? '')
          setInputValue('')
        }}
        onInputValueChange={(newInputValue) => {
          setInputValue(newInputValue)
        }}
      >
        <div className="font-selector__input-row">
          <Combobox.Input
            className="font-selector__input"
            placeholder="Search Google Fonts..."
          />
          {value && (
            <button
              type="button"
              className="font-selector__clear"
              onClick={handleClear}
            >
              Clear
            </button>
          )}
        </div>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} trackAnchorWidth>
            <Combobox.Popup className="font-selector__popup">
              <Combobox.List ref={listRef} className="font-selector__list">
                {filteredFonts.map((font, index) => (
                  <Combobox.Item
                    key={font}
                    value={font}
                    index={index}
                    className="font-selector__option"
                    data-font={font}
                    style={{ fontFamily: `"${font}", sans-serif` }}
                  >
                    {font}
                  </Combobox.Item>
                ))}
              </Combobox.List>
              <Combobox.Empty className="font-selector__empty">
                No fonts found
              </Combobox.Empty>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {value && (
        <div
          className="font-selector__preview"
          style={{ fontFamily: `"${value}", sans-serif` }}
        >
          {value}
        </div>
      )}

      {description && <p className="font-selector__description">{description}</p>}
    </div>
  )
}

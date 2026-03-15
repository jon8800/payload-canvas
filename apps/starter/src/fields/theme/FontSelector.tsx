'use client'

import type { TextFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Static list of popular Google Fonts — google-font-metadata is a CLI tool,
// not a static data export. This curated list covers the most-used families.
// Extend as needed or integrate the full Google Fonts API for a complete list.
const GOOGLE_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Noto Sans',
  'Raleway',
  'Ubuntu',
  'Nunito',
  'Playfair Display',
  'Merriweather',
  'PT Sans',
  'Source Sans 3',
  'Oswald',
  'Rubik',
  'Work Sans',
  'Outfit',
  'DM Sans',
  'Manrope',
  'Geist',
  'Plus Jakarta Sans',
  'Space Grotesk',
  'Lexend',
  'Figtree',
  'Sora',
  'Albert Sans',
  'Onest',
  'Gabarito',
  'Instrument Sans',
  'Libre Baskerville',
  'Lora',
  'Source Serif 4',
  'IBM Plex Sans',
  'IBM Plex Mono',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Roboto Mono',
  'Space Mono',
  'DM Mono',
  'Inconsolata',
  'Ubuntu Mono',
  'Red Hat Mono',
  'Geist Mono',
  'Noto Sans Mono',
  'Overpass Mono',
  'Anonymous Pro',
  'Courier Prime',
  'Martian Mono',
] as const

export const FontSelectorField: TextFieldClientComponent = function FontSelectorField({
  path,
  field,
}) {
  const { value, setValue } = useField<string>({ path })

  const label = typeof field.label === 'string' ? field.label : path
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredFonts = useMemo(() => {
    if (!searchQuery) return GOOGLE_FONTS.slice(0, 20)
    const query = searchQuery.toLowerCase()
    return GOOGLE_FONTS.filter((font) => font.toLowerCase().includes(query)).slice(0, 20)
  }, [searchQuery])

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    },
    [],
  )

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  function handleSelect(font: string) {
    setValue(font)
    setIsOpen(false)
    setSearchQuery('')
  }

  function handleClear() {
    setValue('')
    setSearchQuery('')
  }

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }} ref={containerRef}>
      <label
        style={{
          display: 'block',
          marginBottom: 'calc(var(--base) * 0.5)',
          fontSize: 'var(--font-body-size-s)',
          fontWeight: 500,
          color: 'var(--theme-text)',
        }}
      >
        {label}
      </label>

      {value && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'calc(var(--base) * 0.5)',
            marginBottom: 'calc(var(--base) * 0.5)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--font-body-size-s)',
              fontWeight: 500,
              color: 'var(--theme-text)',
            }}
          >
            {value}
          </span>
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--theme-elevation-500)',
              fontSize: 'var(--font-body-size-s)',
              padding: '2px 6px',
              borderRadius: 'var(--border-radius-m)',
              opacity: 0.8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.color = 'var(--theme-text)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.8'
              e.currentTarget.style.color = 'var(--theme-elevation-500)'
            }}
          >
            Clear
          </button>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search Google Fonts..."
          style={{
            width: '100%',
            borderRadius: 'var(--border-radius-m)',
            border: '1px solid var(--theme-elevation-200)',
            padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.5)',
            fontSize: 'var(--font-body-size-s)',
            background: 'var(--theme-input-bg)',
            color: 'var(--theme-text)',
            boxSizing: 'border-box',
          }}
        />

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 50,
              marginTop: 4,
              maxHeight: 240,
              width: '100%',
              overflowY: 'auto',
              borderRadius: 'var(--border-radius-m)',
              border: '1px solid var(--theme-elevation-200)',
              background: 'var(--theme-elevation-0)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
          >
            {filteredFonts.length > 0 ? (
              filteredFonts.map((font, index) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => handleSelect(font)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    display: 'block',
                    width: '100%',
                    cursor: 'pointer',
                    padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.5)',
                    textAlign: 'left',
                    fontSize: 'var(--font-body-size-s)',
                    color: 'var(--theme-text)',
                    background:
                      hoveredIndex === index ? 'var(--theme-elevation-50)' : 'transparent',
                    border: 'none',
                  }}
                >
                  {font}
                </button>
              ))
            ) : (
              <div
                style={{
                  padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.5)',
                  fontSize: 'var(--font-body-size-s)',
                  color: 'var(--theme-elevation-400)',
                }}
              >
                No fonts found
              </div>
            )}
          </div>
        )}
      </div>

      {description && (
        <p
          style={{
            marginTop: 'calc(var(--base) * 0.25)',
            fontSize: 'var(--font-body-size-s)',
            color: 'var(--theme-elevation-500)',
          }}
        >
          {description}
        </p>
      )}
    </div>
  )
}

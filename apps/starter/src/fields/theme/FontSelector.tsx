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
    <div className="mb-6" ref={containerRef}>
      <label className="mb-2 block text-sm font-medium">{label}</label>

      {value && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium">{value}</span>
          <button
            type="button"
            onClick={handleClear}
            className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            Clear
          </button>
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search Google Fonts..."
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />

        {isOpen && (
          <div className="absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border border-zinc-200 bg-white shadow-lg">
            {filteredFonts.length > 0 ? (
              filteredFonts.map((font) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => handleSelect(font)}
                  className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-zinc-100"
                >
                  {font}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-zinc-400">No fonts found</div>
            )}
          </div>
        )}
      </div>

      {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
    </div>
  )
}

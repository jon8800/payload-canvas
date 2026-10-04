'use client'

import { useEffect, useMemo, useState, type RefObject } from 'react'

import type { SectionDefinition } from '../../../core/types'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'

/** Cards this far outside the visible list already get their thumbnail. */
const ROOT_MARGIN = '240px'

/**
 * The real thumbnail of a section, made once its card (`ref`) comes into view. Null while it
 * loads or when it failed (the card then shows its wireframe). After a theme change the old
 * picture stays until the new one is ready.
 */
export function useSectionThumbnail(section: SectionDefinition, ref: RefObject<Element | null>): string | null {
  const { thumbnails } = useRuntime()
  const theme = useValue(thumbnails.theme)
  // `theme` is in the dependencies on purpose: keyFor reads the theme the store holds.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const key = useMemo(() => thumbnails.keyFor(section.blocks), [thumbnails, section.blocks, theme])
  const [picture, setPicture] = useState<{ key: string; url: string | null } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!key || !el) return
    let cancelled = false
    const show = (url: string | null) => {
      if (!cancelled) setPicture((current) => (url === null && current?.url ? { key, url: current.url } : { key, url }))
    }
    const known = thumbnails.peek(key)
    if (known) {
      show(known)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void thumbnails.get(key, section.blocks).then(show)
      },
      { rootMargin: ROOT_MARGIN },
    )
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [key, ref, section.blocks, thumbnails])

  if (!key) return picture?.url ?? null
  return picture?.key === key ? picture.url : (thumbnails.peek(key) ?? picture?.url ?? null)
}

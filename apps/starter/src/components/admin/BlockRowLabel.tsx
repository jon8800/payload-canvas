'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRowLabel, useAllFormFields } from '@payloadcms/ui'

type BlockData = Record<string, unknown>

// ── Media thumbnail fetching ──

const mediaCache = new Map<number | string, string>()

function useMediaThumbnail(mediaId: number | string | null): string | null {
  const [url, setUrl] = useState<string | null>(
    mediaId ? (mediaCache.get(mediaId) ?? null) : null,
  )

  useEffect(() => {
    if (!mediaId) return
    if (mediaCache.has(mediaId)) {
      setUrl(mediaCache.get(mediaId)!)
      return
    }
    let cancelled = false
    fetch(`/api/media/${mediaId}?depth=0`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const thumb = data?.thumbnailURL || data?.url || null
        if (thumb) {
          mediaCache.set(mediaId, thumb)
          setUrl(thumb)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [mediaId])

  return url
}

// ── Block type icons (16x16 SVG paths) ──

const s = 'none' // fill
const c = 'currentColor' // stroke

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill={s}
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: 0.55 }}
    >
      {children}
    </svg>
  )
}

const blockIcons: Record<string, ReactNode> = {
  heading: (
    <Icon>
      <path d="M3 3v10M13 3v10M3 8h10" />
    </Icon>
  ),
  paragraph: (
    <Icon>
      <path d="M3 4h10M3 7h8M3 10h10M3 13h5" />
    </Icon>
  ),
  list: (
    <Icon>
      <circle cx="4" cy="4.5" r="1" fill={c} stroke={s} />
      <circle cx="4" cy="8" r="1" fill={c} stroke={s} />
      <circle cx="4" cy="11.5" r="1" fill={c} stroke={s} />
      <path d="M7 4.5h6M7 8h6M7 11.5h6" />
    </Icon>
  ),
  blockquote: (
    <Icon>
      <path d="M3 4h4v4H3zM3 8l2 4M9 4h4v4H9zM9 8l2 4" />
    </Icon>
  ),
  image: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <circle cx="5.5" cy="6" r="1.2" />
      <path d="M2 11l3-3 2 2 3-3 4 4" />
    </Icon>
  ),
  video: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M6.5 6v4l4-2z" fill={c} stroke={s} />
    </Icon>
  ),
  icon: (
    <Icon>
      <path d="M8 2l1.8 3.6L14 6.2l-3 2.9.7 4.1L8 11.2 4.3 13.2l.7-4.1-3-2.9 4.2-.6z" />
    </Icon>
  ),
  button: (
    <Icon>
      <rect x="3" y="5" width="10" height="6" rx="3" />
      <path d="M6 8h4" />
    </Icon>
  ),
  link: (
    <Icon>
      <path d="M6.5 9.5l3-3M5 10a2.8 2.8 0 010-4l2-2a2.8 2.8 0 014 4M11 6a2.8 2.8 0 010 4l-2 2a2.8 2.8 0 01-4-4" />
    </Icon>
  ),
  formEmbed: (
    <Icon>
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <path d="M5.5 5h5M5.5 8h5M5.5 11h3" />
    </Icon>
  ),
  container: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1" />
    </Icon>
  ),
  grid: (
    <Icon>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </Icon>
  ),
  spacer: (
    <Icon>
      <path d="M8 2v4M6 4l2-2 2 2M8 14v-4M6 12l2 2 2-2M3 8h10" />
    </Icon>
  ),
  divider: (
    <Icon>
      <path d="M2 8h12" strokeWidth="1.8" />
    </Icon>
  ),
}

// ── Helpers ──

function getNumericValue(
  field: { value?: unknown } | undefined,
): number | string | null {
  if (!field?.value) return null
  if (typeof field.value === 'number') return field.value
  if (typeof field.value === 'string' && field.value) return field.value
  return null
}

function findFirstImageId(
  fields: Record<string, { value?: unknown }>,
  pathPrefix: string,
): number | string | null {
  for (let i = 0; i < 50; i++) {
    const blockTypeField = fields[`${pathPrefix}.${i}.blockType`]
    if (!blockTypeField) break
    if (blockTypeField.value === 'image') {
      const imgField = fields[`${pathPrefix}.${i}.image`]
      const val = getNumericValue(imgField)
      if (val !== null) return val
    }
  }
  return null
}

function extractPlainText(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null
  const root = (content as BlockData).root as BlockData | undefined
  if (!root?.children || !Array.isArray(root.children)) return null

  for (const node of root.children) {
    if (!node || typeof node !== 'object') continue
    const n = node as BlockData
    if (!Array.isArray(n.children)) continue
    const text = (n.children as BlockData[])
      .filter((child) => typeof child.text === 'string')
      .map((child) => child.text as string)
      .join('')
      .trim()
    if (text) return text
  }
  return null
}

function truncate(text: string, max = 50): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

// ── Block type labels ──

const blockTypeLabels: Record<string, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  list: 'List',
  blockquote: 'Blockquote',
  image: 'Image',
  video: 'Video',
  icon: 'Icon',
  button: 'Button',
  link: 'Link',
  formEmbed: 'Form Embed',
  container: 'Container',
  grid: 'Grid',
  spacer: 'Spacer',
  divider: 'Divider',
}

// ── Component ──

export function BlockRowLabel() {
  const { data, path } = useRowLabel<BlockData>()
  const [fields] = useAllFormFields()

  const blockType = (data?.blockType as string) ?? ''
  const typeLabel = blockTypeLabels[blockType] ?? blockType
  const icon = blockIcons[blockType] ?? null

  let summary: string | null = null
  let mediaId: number | string | null = null

  switch (blockType) {
    // ── Text blocks ──
    case 'heading':
      if (typeof data?.text === 'string' && data.text) summary = data.text
      break

    case 'paragraph': {
      const text = data?.content ? extractPlainText(data.content) : null
      if (text) summary = text
      break
    }

    case 'list': {
      const items = data?.items
      const count = Array.isArray(items) ? items.length : 0
      if (count > 0) summary = `${count} item${count !== 1 ? 's' : ''}`
      break
    }

    case 'blockquote': {
      const text = data?.content ? extractPlainText(data.content) : null
      if (text) summary = text
      break
    }

    // ── Media blocks ──
    case 'image': {
      mediaId = getNumericValue(fields[`${path}.image`])
      const caption =
        typeof data?.caption === 'string' && data.caption ? data.caption : null
      summary = caption
      break
    }

    case 'video': {
      mediaId =
        getNumericValue(fields[`${path}.video`]) ??
        getNumericValue(fields[`${path}.poster`])
      if (typeof data?.url === 'string' && data.url) summary = data.url
      break
    }

    case 'icon': {
      mediaId = getNumericValue(fields[`${path}.icon`])
      if (typeof data?.name === 'string' && data.name) summary = data.name
      break
    }

    // ── Action blocks ──
    case 'button': {
      if (typeof data?.label === 'string' && data.label) summary = data.label
      break
    }

    case 'link': {
      if (typeof data?.label === 'string' && data.label) summary = data.label
      break
    }

    case 'formEmbed': {
      if (typeof data?.formTitle === 'string' && data.formTitle)
        summary = data.formTitle
      break
    }

    // ── Layout blocks ──
    case 'container': {
      const children = data?.children
      const count = Array.isArray(children) ? children.length : 0
      if (count > 0) summary = `${count} child${count !== 1 ? 'ren' : ''}`
      mediaId = findFirstImageId(fields, `${path}.children`)
      break
    }

    case 'grid': {
      const children = data?.children
      const count = Array.isArray(children) ? children.length : 0
      const columns = data?.columns
      const parts: string[] = []
      if (count > 0) parts.push(`${count} item${count !== 1 ? 's' : ''}`)
      if (typeof columns === 'number' && columns > 0)
        parts.push(`${columns} cols`)
      if (parts.length > 0) summary = parts.join(', ')
      mediaId = findFirstImageId(fields, `${path}.children`)
      break
    }

    case 'spacer': {
      const height = data?.height
      if (typeof height === 'string' && height)
        summary = height.toUpperCase()
      break
    }

    case 'divider':
      break
  }

  if (summary) summary = truncate(summary)

  const thumbnail = useMediaThumbnail(mediaId)

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          style={{
            width: 24,
            height: 24,
            objectFit: 'cover',
            borderRadius: 4,
            flexShrink: 0,
          }}
        />
      ) : (
        icon
      )}
      {typeLabel}
      {summary && (
        <span style={{ color: 'var(--theme-elevation-500)', fontWeight: 400 }}>
          {summary}
        </span>
      )}
    </span>
  )
}

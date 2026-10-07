'use client'

// "Generate image" under an upload field of the inspector: a prompt, an aspect ratio and alt text.
// The server generates the image with the site's image adapter, saves it in the media collection
// as the signed-in user, and the field gets the new media id. Hidden when no image adapter is ready.

import { useEffect, useId, useRef, useState } from 'react'

import type { AiImageAspectRatio, AiImagesClientConfig } from '../../../ai/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'

import './generate.scss'

type Media = { id: string | number; collection: string; alt: string | null; url: string | null; thumbnailUrl: string | null; width: number | null; height: number | null }
type Success = { media: Media; model: string; seconds: number; cost?: number }

type Props = {
  /** The upload field's `relationTo`. */
  relationTo: string | string[]
  hasMany: boolean
  value: unknown
  onChange: (value: unknown) => void
}

const RATIO_LABELS: Record<AiImageAspectRatio, string> = {
  '1:1': 'Square',
  '16:9': 'Wide',
  '9:16': 'Tall',
  '4:3': 'Landscape 4:3',
  '3:4': 'Portrait 3:4',
  '3:2': 'Landscape 3:2',
  '2:3': 'Portrait 2:3',
  '21:9': 'Banner',
}

/** The value the field stores for a new upload: an id, a list with it added, or { relationTo, value }. */
function nextValue(props: Props, media: Media): unknown {
  const item = Array.isArray(props.relationTo) ? { relationTo: media.collection, value: media.id } : media.id
  if (!props.hasMany) return item
  return [...(Array.isArray(props.value) ? props.value : []), item]
}

/** The Generate action, or nothing when image generation is off or the field takes no images from it. */
export function GenerateImage(props: Props) {
  const images = useRuntime().config.ai?.images ?? null
  if (!images) return null
  const targets = Array.isArray(props.relationTo) ? props.relationTo : [props.relationTo]
  const collection = targets.includes(images.collection) ? images.collection : targets[0]
  if (!collection) return null
  return <GenerateImagePanel {...props} images={images} collection={collection} />
}

function GenerateImagePanel({ images, collection, ...field }: Props & { images: AiImagesClientConfig; collection: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [alt, setAlt] = useState('')
  const [ratio, setRatio] = useState<AiImageAspectRatio>('16:9')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Success | null>(null)
  const abort = useRef<AbortController | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)

  // Cancel a running request when the field goes away (another block selected).
  useEffect(() => () => abort.current?.abort(), [])

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(timer)
  }, [busy])

  useEffect(() => {
    if (open) promptRef.current?.focus()
  }, [open])

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (busy || prompt.trim().length < 3) return
    const controller = new AbortController()
    abort.current = controller
    setBusy(true)
    setElapsed(0)
    setError(null)
    setResult(null)
    try {
      const response = await fetch(images.endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), aspectRatio: ratio, alt: alt.trim() || undefined, collection }),
        signal: controller.signal,
      })
      const body = (await response.json().catch(() => null)) as (Success & { ok?: boolean; error?: string }) | null
      if (!response.ok || !body?.media) {
        setError(body?.error ?? `The image could not be generated (HTTP ${response.status}).`)
        return
      }
      setResult(body)
      field.onChange(nextValue(field, body.media))
    } catch (err) {
      if (controller.signal.aborted) setError('Cancelled. Nothing was saved.')
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      abort.current = null
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="builder-generate__open" onClick={() => setOpen(true)}>
        <Icon name="sparkle" size={12} />
        Generate image
      </button>
    )
  }

  const preview = result ? (result.media.thumbnailUrl ?? result.media.url) : null
  return (
    <form className="builder-generate" aria-label="Generate an image" onSubmit={submit}>
      <div className="builder-generate__head">
        <span className="builder-generate__title">
          <Icon name="sparkle" size={12} />
          Generate image
        </span>
        <button type="button" className="builder-generate__icon-button" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>
          <Icon name="close" size={12} />
        </button>
      </div>

      <label className="builder-generate__label" htmlFor={`${id}-prompt`}>
        Describe the image
      </label>
      <textarea
        ref={promptRef}
        id={`${id}-prompt`}
        className="builder-generate__input builder-generate__prompt"
        disabled={busy}
        maxLength={4000}
        placeholder="Fresh coffee beans on a wooden table, soft morning light, close-up photo"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e)
        }}
      />

      <fieldset className="builder-generate__ratios" disabled={busy}>
        <legend className="builder-generate__label">Aspect ratio</legend>
        {images.aspectRatios.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={ratio === value}
            className="builder-generate__ratio"
            title={RATIO_LABELS[value]}
            onClick={() => setRatio(value)}
          >
            <span className="builder-generate__ratio-box" style={{ aspectRatio: value.replace(':', ' / ') }} aria-hidden="true" />
            {value}
          </button>
        ))}
      </fieldset>

      <label className="builder-generate__label" htmlFor={`${id}-alt`}>
        Alt text <span className="builder-generate__optional">(optional, default: from the description)</span>
      </label>
      <input
        id={`${id}-alt`}
        className="builder-generate__input"
        disabled={busy}
        maxLength={300}
        type="text"
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
      />

      <div className="builder-generate__actions">
        {busy ? (
          <>
            <output className="builder-generate__progress">
              <span className="builder-generate__spinner" aria-hidden="true" />
              Generating… {elapsed} s
            </output>
            <button type="button" className="builder-generate__button" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="builder-generate__model" title={`${images.label}: ${images.model}`}>
              {images.model}
            </span>
            <button type="submit" className="builder-generate__button builder-generate__button--primary" disabled={prompt.trim().length < 3}>
              {result ? 'Generate again' : 'Generate'}
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="builder-generate__error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="builder-generate__result">
          {preview && <img className="builder-generate__thumb" src={preview} alt={result.media.alt ?? ''} />}
          <output className="builder-generate__note">
            Added to {collection} and set on this field. {result.seconds} s{typeof result.cost === 'number' ? ` · $${result.cost.toFixed(4)}` : ''}
          </output>
        </div>
      )}
    </form>
  )
}

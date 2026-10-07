import type { CSSProperties } from 'react'
import type { BlockComponentProps } from '../render/types'
import { isDoc } from './Image'
import { PlaceholderBox } from './placeholder'
import { isPlayableVideoUrl, parseVideoUrl } from './videoUrl'

/** Classes that already give the element a height. Without one, an embed gets a 16:9 ratio. */
const SIZE_CLASS = /(^|\s|:)(aspect-|h-|size-|min-h-)/

/** Canvas only, inline styles only (like `placeholder.tsx`): the site's CSS never sees it. */
const INVALID_BOX: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  aspectRatio: '16 / 9',
  minHeight: 96,
  padding: 12,
  border: '1px dashed rgb(217 119 6 / 0.7)',
  borderRadius: 4,
  background: 'rgb(217 119 6 / 0.08)',
  color: 'rgb(128 128 128)',
  font: '12px/1.4 system-ui, sans-serif',
  textAlign: 'center',
}

function InvalidUrl({ attributes, className }: { attributes: Record<string, string>; className?: string }) {
  return (
    <div {...attributes} data-builder-placeholder="" className={className} style={INVALID_BOX}>
      Video
      <span style={{ color: 'rgb(180 83 9)' }}>This link cannot play. Check the URL in the Content tab.</span>
    </div>
  )
}

/**
 * An uploaded video or a URL. YouTube and Vimeo URLs become an `<iframe>`; other URLs play in
 * `<video>`. In the canvas the iframe ignores the pointer, so clicks select the block.
 */
export function Video({ props, className, attributes, mode }: BlockComponentProps) {
  const options = {
    autoplay: props.autoplay === true,
    loop: props.loop === true,
    muted: props.muted === true,
    controls: props.controls !== false,
  }
  const poster = isDoc(props.poster) ? (props.poster.url as string) : undefined

  // A missing source means the default ("upload"), unless only a URL is set.
  const fromUrl = props.source === 'url' || (props.source == null && props.video == null && typeof props.url === 'string')
  let src: string | null = null
  if (fromUrl) {
    const url = typeof props.url === 'string' ? props.url : ''
    // A URL that cannot play: nothing on the site, a message on the canvas.
    if (url.trim() && !isPlayableVideoUrl(url)) {
      return mode === 'canvas' ? <InvalidUrl attributes={attributes} className={className} /> : null
    }
    const embed = parseVideoUrl(url, options)
    if (embed && embed.kind !== 'file') {
      const style: CSSProperties = { border: 0 }
      if (!className || !SIZE_CLASS.test(className)) Object.assign(style, { aspectRatio: '16 / 9', height: 'auto' })
      if (mode === 'canvas') style.pointerEvents = 'none'
      return (
        // oxlint-disable-next-line react/iframe-missing-sandbox -- cross-origin players need scripts and their own origin, so a sandbox adds nothing.
        <iframe
          {...attributes}
          className={className}
          src={embed.embedUrl}
          title={embed.kind === 'youtube' ? 'YouTube video' : 'Vimeo video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          style={style}
        />
      )
    }
    src = embed?.src ?? null
  } else if (isDoc(props.video)) {
    src = props.video.url as string
  }

  if (!src) {
    if (mode !== 'canvas') return null
    return <PlaceholderBox attributes={attributes} className={className} label="Video" style={{ aspectRatio: '16 / 9' }} />
  }
  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- the block has no caption track field yet.
    <video
      {...attributes}
      className={className}
      src={src}
      poster={poster}
      autoPlay={options.autoplay}
      loop={options.loop}
      muted={options.muted}
      controls={options.controls}
      playsInline
      preload="metadata"
    />
  )
}

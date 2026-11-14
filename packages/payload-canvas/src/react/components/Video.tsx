import type { CSSProperties } from 'react'
import { preload } from 'react-dom'
import type { BlockComponentProps } from '../render/types'
import { focalStyle, isDoc } from './Image'
// The script that starts an autoplaying video loads only on pages that render one.
import { AutoplayVideo } from './lazy'
import { PlaceholderBox } from './placeholder'
import { decorativeAttributes, videoPreload, videoSettingsOf, videoSources } from './videoPlayback'
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
 *
 * - Autoplay: a `<video>` never gets the `autoplay` attribute. On the site a small client
 *   component (`AutoplayVideo`) starts it after mount, unless the visitor asks for less motion.
 *   On the canvas (and in section thumbnails) an autoplay video stays paused on its poster, and an
 *   embed gets no autoplay.
 * - `priority` (Load first): `preload="auto"`, and the poster preloads with high fetch priority.
 * - The poster's focal point sets `object-position`, with the image block's rule (`focalStyle`).
 * - `decorative`: `aria-hidden="true"`, no controls, no tab stop. For a background video.
 * - A phone video (`phoneVideo` or `phoneUrl`, a file): screens up to 767 px wide load it instead.
 */
export function Video({ props, className, attributes, mode, canvasMode }: BlockComponentProps) {
  const canvas = mode === 'canvas' || canvasMode !== undefined
  const settings = videoSettingsOf(props)
  // The canvas never autoplays: editing stays calm.
  const options = { autoplay: settings.autoplay && !canvas, loop: settings.loop, muted: settings.muted, controls: settings.controls }
  const hidden = decorativeAttributes(settings.decorative)
  const posterDoc = isDoc(props.poster) ? props.poster : undefined
  const poster = posterDoc ? (posterDoc.url as string) : undefined

  // A missing source means the default ("upload"), unless only a URL is set.
  const fromUrl = props.source === 'url' || (props.source == null && props.video == null && typeof props.url === 'string')
  let src: string | null = null
  // A smaller copy for phones: a video file link, or an upload. A YouTube or Vimeo link does not count.
  let phoneSrc: string | undefined
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
          {...hidden}
          className={className}
          src={embed.embedUrl}
          title={embed.kind === 'youtube' ? 'YouTube video' : 'Vimeo video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading={settings.priority ? 'eager' : 'lazy'}
          referrerPolicy="strict-origin-when-cross-origin"
          style={style}
        />
      )
    }
    src = embed?.src ?? null
    const phoneUrl = typeof props.phoneUrl === 'string' ? props.phoneUrl.trim() : ''
    const phone = phoneUrl && isPlayableVideoUrl(phoneUrl) ? parseVideoUrl(phoneUrl, options) : null
    if (phone?.kind === 'file') phoneSrc = phone.src
  } else if (isDoc(props.video)) {
    src = props.video.url as string
    if (isDoc(props.phoneVideo) && typeof props.phoneVideo.url === 'string') phoneSrc = props.phoneVideo.url
  }

  if (!src) {
    if (mode !== 'canvas') return null
    return <PlaceholderBox attributes={attributes} className={className} label="Video" style={{ aspectRatio: '16 / 9' }} />
  }
  // The poster is what a visitor sees first, so it loads like a priority image.
  if (settings.priority && poster && !canvas) preload(poster, { as: 'image', fetchPriority: 'high' })
  const video = {
    attributes: { ...attributes, ...hidden },
    className,
    src,
    phoneSrc,
    poster,
    loop: options.loop,
    muted: options.muted,
    controls: options.controls,
    preload: videoPreload(settings.priority),
    style: focalStyle(posterDoc),
  }
  if (options.autoplay) return <AutoplayVideo {...video} />
  const sources = videoSources(src, phoneSrc)
  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- the block has no caption track field yet.
    <video
      {...video.attributes}
      className={className}
      src={sources.length ? undefined : src}
      poster={poster}
      loop={video.loop}
      muted={video.muted}
      controls={video.controls}
      playsInline
      preload={video.preload}
      style={video.style}
    >
      {sources.map((source) => (
        <source key={source.src} media={source.media} src={source.src} />
      ))}
    </video>
  )
}

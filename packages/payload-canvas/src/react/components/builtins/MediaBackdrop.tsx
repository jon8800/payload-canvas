import type { CSSProperties } from 'react'
import { preload } from 'react-dom'
import { MEDIA_BACKDROP_CLASS_MAP as C } from '../../../blocks/builtins/mediaBackdrop'
import { textOr } from '../../../blocks/builtins/shared'
import { editableImage } from '../../render/editable'
import type { BlockComponentProps } from '../../render/types'
import { isDoc, srcSetOf } from '../Image'
import { BackdropVideo } from './BackdropVideo'

type Doc = Record<string, unknown> & { url: string }

/** The media focal point (Payload's focalX/focalY, percent) as object-position. */
function focalStyle(doc: Doc | null): CSSProperties | undefined {
  const x = doc?.focalX
  const y = doc?.focalY
  return typeof x === 'number' && typeof y === 'number' ? { objectPosition: `${x}% ${y}%` } : undefined
}

const docOf = (value: unknown): Doc | null => (isDoc(value) ? (value as Doc) : null)

/**
 * A photo or a muted looping video behind the block's content. The media and the optional
 * overlay are absolute children (`data-backdrop-media`, `data-backdrop-overlay`); the slot's
 * blocks follow them, so the block's className lays out the content.
 */
export function MediaBackdrop({ props, className, attributes, slotAttributes, slots, mode }: BlockComponentProps) {
  const image = docOf(props.image)
  const videoSrc = docOf(props.video)?.url ?? textOr(props.videoUrl, '')
  const priority = props.priority === true

  let media = null
  if (videoSrc) {
    const poster = docOf(props.poster) ?? image
    if (poster && priority) preload(poster.url, { as: 'image', fetchPriority: 'high' })
    media = (
      <BackdropVideo
        key={videoSrc}
        src={videoSrc}
        poster={poster?.url}
        className={C.media}
        style={focalStyle(poster)}
        priority={priority}
        play={mode !== 'canvas'}
      />
    )
  } else if (image) {
    const srcSet = srcSetOf(image)
    media = (
      <img
        {...editableImage(mode, 'image')}
        data-backdrop-media=""
        className={C.media}
        src={image.url}
        {...(srcSet ? { srcSet, sizes: textOr(props.sizes, '100vw') } : {})}
        // A background is decoration unless the block names it.
        alt={textOr(props.alt, '')}
        width={typeof image.width === 'number' ? image.width : undefined}
        height={typeof image.height === 'number' ? image.height : undefined}
        style={focalStyle(image)}
        loading={priority ? 'eager' : 'lazy'}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
    )
  }

  return (
    <div {...attributes} {...slotAttributes.children} className={className}>
      {media}
      {props.overlay === true ? <div data-backdrop-overlay="" aria-hidden="true" className={C.overlay} /> : null}
      {slots.children}
    </div>
  )
}

import { preload } from 'react-dom'
import { MEDIA_BACKDROP_CLASS_MAP as C } from '../../../blocks/client/mediaBackdrop'
import { textOr } from '../../../blocks/client/helpers'
import { editableImage } from '../../render/editable'
import type { BlockComponentProps } from '../../render/types'
import { focalStyle, isDoc, srcSetOf } from '../Image'
import { BackdropVideo } from './BackdropVideo'

type Doc = Record<string, unknown> & { url: string }

/** Maps a stored media URL to the one the site serves, e.g. an absolute URL to its path. */
export type MediaUrl = (url: string) => string

/** The media document with `mediaUrl` applied to its file and to each image size. */
function docOf(value: unknown, mediaUrl: MediaUrl | undefined): Doc | null {
  if (!isDoc(value)) return null
  const doc = value as Doc
  if (!mediaUrl) return doc
  const sizes = doc.sizes && typeof doc.sizes === 'object' ? (doc.sizes as Record<string, unknown>) : null
  return {
    ...doc,
    url: mediaUrl(doc.url),
    ...(sizes
      ? {
          sizes: Object.fromEntries(
            Object.entries(sizes).map(([name, size]) => [name, isDoc(size) ? { ...size, url: mediaUrl(size.url as string) } : size]),
          ),
        }
      : {}),
  }
}

/**
 * The media backdrop component, with `mediaUrl` applied to the URLs of its uploads (the photo and
 * its sizes, the video, the poster). `builtinComponents({ mediaUrl })` uses it.
 */
export function mediaBackdropComponent(mediaUrl?: MediaUrl) {
  return function MediaBackdrop(block: BlockComponentProps) {
    return backdrop(block, mediaUrl)
  }
}

/**
 * A photo or a muted looping video behind the block's content. The media and the optional
 * overlay are absolute children (`data-backdrop-media`, `data-backdrop-overlay`); the slot's
 * blocks follow them, so the block's className lays out the content.
 */
export const MediaBackdrop = mediaBackdropComponent()

function backdrop(block: BlockComponentProps, mediaUrl: MediaUrl | undefined) {
  const { props, className, attributes, slotAttributes, slots, mode } = block
  const image = docOf(props.image, mediaUrl)
  // `videoUrl` is a link an editor typed, not a stored upload, so it stays as it is.
  const videoSrc = docOf(props.video, mediaUrl)?.url ?? textOr(props.videoUrl, '')
  const priority = props.priority === true

  let media = null
  if (videoSrc) {
    const poster = docOf(props.poster, mediaUrl) ?? image
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
    <div {...attributes} {...slotAttributes?.children} className={className}>
      {media}
      {props.overlay === true ? <div data-backdrop-overlay="" aria-hidden="true" className={C.overlay} /> : null}
      {slots.children}
    </div>
  )
}

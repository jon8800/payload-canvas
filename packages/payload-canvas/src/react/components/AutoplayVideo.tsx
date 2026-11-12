'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { useCanvasMode } from '../render/canvasMode'
import { REDUCED_MOTION, startsPlaying } from './videoPlayback'

/** Plain data only: the server component `Video` renders this one. */
export type AutoplayVideoProps = {
  attributes: Record<string, string | number>
  className?: string
  src: string
  poster?: string
  loop: boolean
  muted: boolean
  controls: boolean
  preload: 'auto' | 'metadata'
  style?: CSSProperties
}

/**
 * An autoplaying `<video>` that starts from script after mount, not with the `autoplay` attribute,
 * so it can ask first: it plays only when the visitor does not ask for less motion. Otherwise it
 * shows the poster and stays paused. A change of that setting plays or pauses it. A browser that
 * refuses to play (an unmuted video) keeps the poster too.
 */
export function AutoplayVideo({ attributes, className, src, poster, loop, muted, controls, preload, style }: AutoplayVideoProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const canvas = useCanvasMode() !== 'site'

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const query = window.matchMedia(REDUCED_MOTION)
    const sync = () => {
      if (!startsPlaying({ autoplay: true, canvas, reducedMotion: query.matches })) {
        video.pause()
        return
      }
      // Hydration does not set the property; browsers allow autoplay only for muted videos.
      video.muted = muted
      video.play().catch(() => {})
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [canvas, muted])

  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- the block has no caption track field yet.
    <video
      ref={ref}
      {...attributes}
      className={className}
      src={src}
      poster={poster}
      loop={loop}
      muted={muted}
      controls={controls}
      playsInline
      preload={preload}
      style={style}
    />
  )
}

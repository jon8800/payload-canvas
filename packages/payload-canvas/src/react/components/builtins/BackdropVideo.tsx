'use client'

import { useEffect, useRef, type CSSProperties } from 'react'

/**
 * A muted, looping background video. It starts from script, so with reduced motion it never
 * plays and the poster stays. `play` is false on the canvas. A new `src` remounts it (key).
 */
export function BackdropVideo({
  src,
  poster,
  className,
  style,
  priority,
  play,
}: {
  src: string
  poster?: string
  className: string
  style?: CSSProperties
  priority: boolean
  play: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!play || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    ref.current?.play().catch(() => {})
  }, [play])
  return (
    <video
      ref={ref}
      data-backdrop-media=""
      aria-hidden="true"
      className={className}
      style={style}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload={priority ? 'auto' : 'metadata'}
    />
  )
}

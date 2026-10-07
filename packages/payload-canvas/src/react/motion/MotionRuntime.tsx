'use client'

import { useEffect } from 'react'

/**
 * Starts the motion runtime on the page (block animations). `RenderLayout` renders it once per
 * layout that has motion; every copy shares one runtime. Renders nothing.
 *
 * The runtime (with Motion) is a separate chunk, loaded only when this mounts: bundlers put the
 * client components of a route in shared chunks, so a static import would ship Motion to every
 * page of the route, with or without motion.
 */
export function MotionRuntime(): null {
  useEffect(() => {
    let stop: (() => void) | null = null
    let unmounted = false
    void import('./runtime').then(({ startMotion }) => {
      if (!unmounted) stop = startMotion()
    })
    return () => {
      unmounted = true
      stop?.()
    }
  }, [])
  return null
}

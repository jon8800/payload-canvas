'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * A page's generated CSS, switched off while its page is hidden.
 *
 * With Cache Components, Next.js keeps recent pages mounted after a navigation, hidden inside React
 * `<Activity>`, so Back is instant. Their `<style>` tags stay in the document and still apply: the
 * plain utilities of the hidden page (`flex-col`) then undo the breakpoint utilities of the shown
 * page (`sm:flex-row`), and the page looks broken until a reload. React runs effect cleanups when
 * it hides an `<Activity>` and runs the effects again when it shows it, so the tag turns itself off
 * with `media="not all"` and back on.
 *
 * The server HTML has no `media`, so the CSS applies before hydration.
 */
export function ActiveStyle({ html }: { html: string }) {
  const ref = useRef<HTMLStyleElement>(null)
  useLayoutEffect(() => {
    const style = ref.current
    if (!style) return
    style.removeAttribute('media')
    return () => {
      style.media = 'not all'
    }
  }, [])
  return <style data-builder-css="" dangerouslySetInnerHTML={{ __html: html }} ref={ref} />
}

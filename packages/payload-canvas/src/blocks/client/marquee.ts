// Read by the marquee component. A leaf module: no block definitions. The block definition
// re-exports these values.

/** The seconds one round takes, by `speed`. */
export const MARQUEE_SECONDS = { slow: 60, normal: 35, fast: 20 } as const

export type MarqueeSpeed = keyof typeof MARQUEE_SECONDS

/**
 * The marquee's own CSS, in one `<style>` that React puts once in the page's head. Plain CSS on
 * data attributes, so it needs no classes in the generated CSS. The track holds the items twice
 * and moves by half its width, so the second copy takes the place of the first. Still on the
 * canvas and with reduced motion: the items wrap and the copy is not shown.
 */
export const MARQUEE_CSS = `
@keyframes builder-marquee { from { transform: translate3d(0, 0, 0) } to { transform: translate3d(-50%, 0, 0) } }
[data-marquee] { overflow: hidden }
[data-marquee-track] { display: flex; width: max-content; animation: builder-marquee var(--marquee-duration, 35s) linear infinite }
[data-marquee-track] > * { flex-shrink: 0 }
[data-marquee="right"] [data-marquee-track] { animation-direction: reverse }
[data-marquee-pause]:hover [data-marquee-track], [data-marquee-pause]:focus-within [data-marquee-track] { animation-play-state: paused }
[data-marquee-still] [data-marquee-track] { width: auto; animation: none }
[data-marquee-still] [data-marquee-track] > * { flex-shrink: 1; flex-wrap: wrap }
@media (prefers-reduced-motion: reduce) {
  [data-marquee-track] { width: auto; animation: none }
  [data-marquee-track] > * { flex-shrink: 1; flex-wrap: wrap }
  [data-marquee-copy] { display: none }
}
`

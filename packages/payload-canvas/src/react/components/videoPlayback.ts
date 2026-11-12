// Pure rules of the video block, shared by the server component (`./Video`) and the small client
// component that starts an autoplaying video (`./AutoplayVideo`). No imports: a client module
// reaches this file.

/** The media query of a visitor who asks for less motion. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export type VideoSettings = {
  autoplay: boolean
  loop: boolean
  muted: boolean
  controls: boolean
  /** Decoration only (a background): hidden from screen readers, no controls, no tab stop. */
  decorative: boolean
  /** Load first: `preload="auto"` and the poster preloaded with high fetch priority. */
  priority: boolean
}

/** The block's props as settings. Defaults: everything off but `controls`. */
export function videoSettingsOf(props: Record<string, unknown>): VideoSettings {
  const decorative = props.decorative === true
  return {
    autoplay: props.autoplay === true,
    loop: props.loop === true,
    muted: props.muted === true,
    // A decorative video has no controls, whatever "Show controls" says.
    controls: props.controls !== false && !decorative,
    decorative,
    priority: props.priority === true,
  }
}

/**
 * True when an autoplaying video may play now: never on the editor's canvas (editing stays calm),
 * and never for a visitor who asks for less motion (the video shows its poster and stays paused).
 */
export function startsPlaying(args: { autoplay: boolean; canvas: boolean; reducedMotion: boolean }): boolean {
  return args.autoplay && !args.canvas && !args.reducedMotion
}

/** The `preload` attribute: the whole video for a video that loads first, else only its metadata. */
export function videoPreload(priority: boolean): 'auto' | 'metadata' {
  return priority ? 'auto' : 'metadata'
}

/** The attributes that take a decorative video out of the accessibility tree and the tab order. */
export function decorativeAttributes(decorative: boolean): { 'aria-hidden'?: 'true'; tabIndex?: -1 } {
  return decorative ? { 'aria-hidden': 'true', tabIndex: -1 } : {}
}

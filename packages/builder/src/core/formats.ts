// Named value formats for text props. A field names one in `admin.custom.builderFormat`.
// The inspector shows the message while the editor types, `validateLayout` reports it (it blocks
// only publishing), and the renderer uses the same parser. Pure: no React, no Payload.

/** Returns a sentence that says what is wrong, or null when the value is fine (or empty). */
export type FormatCheck = (value: unknown) => string | null

// ---------------------------------------------------------------------------
// Video URLs: YouTube and Vimeo get an iframe, anything else plays in <video>.
// ---------------------------------------------------------------------------

export type VideoOptions = { autoplay?: boolean; loop?: boolean; muted?: boolean; controls?: boolean }

export type VideoEmbed =
  | { kind: 'youtube'; id: string; embedUrl: string }
  | { kind: 'vimeo'; id: string; embedUrl: string }
  | { kind: 'file'; src: string }

const YOUTUBE_ID = /^[\w-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtu.be', 'youtube.com', 'youtube-nocookie.com'])
const VIMEO_HOSTS = new Set(['vimeo.com', 'player.vimeo.com'])

const flag = (on: boolean | undefined) => (on ? 1 : null)

function parseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

const hostOf = (url: URL) => url.hostname.replace(/^(www\.|m\.|music\.)/, '')

/** "90", "90s", "1m30s" or "1h2m3s" as seconds. */
function seconds(value: string | null): number | null {
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!match || !match[0]) return null
  const [, h = '0', m = '0', s = '0'] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

function youtubeId(url: URL): string | null {
  const host = hostOf(url)
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | null = null
  if (host === 'youtu.be') id = parts[0] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') id = url.searchParams.get('v')
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null
  }
  return id && YOUTUBE_ID.test(id) ? id : null
}

function vimeoId(url: URL): { id: string; hash: string | null } | null {
  if (!VIMEO_HOSTS.has(hostOf(url))) return null
  const parts = url.pathname.split('/').filter(Boolean)
  // vimeo.com/123, vimeo.com/123/abcdef (unlisted), vimeo.com/channels/x/123, player.vimeo.com/video/123
  const index = parts.findIndex((part) => /^\d+$/.test(part))
  if (index === -1) return null
  const next = parts[index + 1]
  const hash = url.searchParams.get('h') ?? (next && /^[\da-f]+$/i.test(next) ? next : null)
  return { id: parts[index]!, hash }
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Parses a video URL. Returns `null` for an empty or unsafe URL. */
export function parseVideoUrl(raw: string, options: VideoOptions = {}): VideoEmbed | null {
  const url = raw.trim()
  if (!url) return null
  const parsed = parseUrl(url)
  // Relative URLs ("/media/clip.mp4") play as files. Absolute URLs must be http(s).
  if (!parsed) return url.startsWith('/') ? { kind: 'file', src: url } : null
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  const controls = options.controls ?? true

  const yt = youtubeId(parsed)
  if (yt) {
    const embedUrl =
      `https://www.youtube-nocookie.com/embed/${yt}` +
      query({
        start: seconds(parsed.searchParams.get('t') ?? parsed.searchParams.get('start')),
        autoplay: flag(options.autoplay),
        mute: flag(options.muted),
        // YouTube loops a single video only when it is also its own playlist.
        loop: flag(options.loop),
        playlist: options.loop ? yt : null,
        controls: controls ? null : 0,
        playsinline: 1,
      })
    return { kind: 'youtube', id: yt, embedUrl }
  }

  const vimeo = vimeoId(parsed)
  if (vimeo) {
    const embedUrl =
      `https://player.vimeo.com/video/${vimeo.id}` +
      query({
        h: vimeo.hash,
        autoplay: flag(options.autoplay),
        muted: flag(options.muted),
        loop: flag(options.loop),
        controls: controls ? null : 0,
      })
    return { kind: 'vimeo', id: vimeo.id, embedUrl }
  }

  return { kind: 'file', src: url }
}

/**
 * Why a video URL cannot play, as one sentence for the editor, or null when it can (or is
 * empty). Absolute URLs must be http(s). YouTube and Vimeo links must name a video. Any other URL
 * plays as a file.
 */
export function videoUrlProblem(value: unknown): string | null {
  const url = typeof value === 'string' ? value.trim() : ''
  if (!url || url.startsWith('/')) return null
  const parsed = parseUrl(url)
  if (!parsed) return 'Enter a full link that starts with https://, for example https://www.youtube.com/watch?v=…'
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'Enter a link that starts with https://.'
  const host = hostOf(parsed)
  if (YOUTUBE_HOSTS.has(host) && !youtubeId(parsed)) {
    return 'This YouTube link does not point to a video. Use the link from Share under the video.'
  }
  if (VIMEO_HOSTS.has(host) && !vimeoId(parsed)) {
    return 'This Vimeo link does not point to a video. Use the link from Share under the video.'
  }
  return null
}

/** True when a non-empty URL can play: it parses, and a YouTube or Vimeo address names a video. */
export function isPlayableVideoUrl(raw: string): boolean {
  return parseVideoUrl(raw) !== null && videoUrlProblem(raw) === null
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** Formats by name, for `admin.custom.builderFormat`. */
export const FORMATS: Readonly<Record<string, FormatCheck>> = {
  videoUrl: videoUrlProblem,
}

/**
 * The message for a value that does not match the named format, else null. An unknown or missing
 * format name checks nothing.
 */
export function formatProblem(format: unknown, value: unknown): string | null {
  const check = typeof format === 'string' && Object.hasOwn(FORMATS, format) ? FORMATS[format] : undefined
  return check ? check(value) : null
}

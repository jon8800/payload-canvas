// Turns a video URL into an embed: YouTube and Vimeo get an iframe, anything else plays in <video>.

export type VideoOptions = { autoplay?: boolean; loop?: boolean; muted?: boolean; controls?: boolean }

export type VideoEmbed =
  | { kind: 'youtube'; id: string; embedUrl: string }
  | { kind: 'vimeo'; id: string; embedUrl: string }
  | { kind: 'file'; src: string }

const YOUTUBE_ID = /^[\w-]{11}$/

const flag = (on: boolean | undefined) => (on ? 1 : null)

function parseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

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
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
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
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
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

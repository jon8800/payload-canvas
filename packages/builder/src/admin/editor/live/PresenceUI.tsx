'use client'

// Presence UI: avatars in the toolbar, other editors' cursors and selections on the canvas,
// colored dots in the outline, the "is editing this block" banner and the follow frame.
// Admin code: Payload CSS variables and SCSS only (editor.scss, "Multiplayer" section).

import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { Rect } from '../../../core/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { breakpointAt } from '../styles/tokens'
import { useEditor } from '../store'
import { useValue } from '../valueStore'
import { cursorPoint, initials, shortName } from './presence'
import type { Peer } from './useMultiplayer'

/** Cursors that have not moved for this long fade out. */
const CURSOR_IDLE_MS = 10_000
const MAX_AVATARS = 5

const peerStyle = (color: string, extra?: CSSProperties): CSSProperties => ({ '--be-peer': color, ...extra }) as CSSProperties
const box = (rect: Rect): CSSProperties => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Collaborators (other than this editor) with `blockId` selected. */
function usePeersOn(blockId: string): Peer[] {
  const runtime = useRuntime()
  const peers = useValue(runtime.peers)
  return useMemo(() => [...peers.values()].filter((p) => p.selectedId === blockId), [peers, blockId])
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

/** Who else is here (click to follow), the last remote change, and the connection state. */
export function Presence({ widths }: { widths: Parameters<typeof breakpointAt>[0] }) {
  const runtime = useRuntime()
  const live = useValue(runtime.live)
  const peers = useValue(runtime.peers)
  const follow = useValue(runtime.follow)
  if (!live) return null

  const others = live.collaborators
  const status =
    live.status === 'open'
      ? live.pending
        ? 'Syncing your changes…'
        : 'Live · changes sync instantly'
      : live.status === 'connecting'
        ? 'Connecting…'
        : 'Reconnecting… your changes are kept and sent when back'
  const recent = live.lastChange && live.changes.size > 0 ? live.lastChange : null

  const tooltip = (peer: Peer | undefined, name: string, ai: boolean) => {
    const who = `${shortName(name)}${ai ? ' (AI)' : ''}`
    const width = peer?.canvasWidth
    const where = width ? ` · editing on ${breakpointAt(widths, width)} (${width}px)` : ''
    return `${who}${where} · ${follow === peer?.clientId ? 'click to stop following' : 'click to follow'}`
  }

  return (
    <div className="builder-editor__live" data-status={live.status} data-pending={live.pending || undefined}>
      {recent && (
        <span className="builder-editor__live-activity" style={peerStyle(recent.color)}>
          <Icon name={recent.actor.type === 'ai' ? 'sparkle' : 'user'} size={12} />
          {shortName(recent.actor.label)} is editing
        </span>
      )}
      {live.lastError && (
        <span className="builder-editor__live-error" title={live.lastError}>
          {live.lastError}
        </span>
      )}
      {others.length > 0 && (
        <fieldset className="builder-presence" aria-label="People on this page">
          {others.slice(0, MAX_AVATARS).map((c) => (
            <button
              key={c.clientId}
              type="button"
              className={`builder-presence__avatar${c.type === 'ai' ? ' builder-presence__avatar--ai' : ''}`}
              style={peerStyle(c.color)}
              aria-pressed={follow === c.clientId}
              aria-label={`${shortName(c.name)}: ${follow === c.clientId ? 'stop following' : 'follow'}`}
              data-tooltip={tooltip(peers.get(c.clientId), c.name, c.type === 'ai')}
              onClick={() => runtime.follow.set(follow === c.clientId ? null : c.clientId)}
            >
              {c.type === 'ai' ? <Icon name="sparkle" size={12} /> : initials(c.name)}
            </button>
          ))}
          {others.length > MAX_AVATARS && (
            <span
              className="builder-presence__avatar builder-presence__avatar--more"
              data-tooltip={others
                .slice(MAX_AVATARS)
                .map((c) => shortName(c.name))
                .join(', ')}
            >
              +{others.length - MAX_AVATARS}
            </span>
          )}
        </fieldset>
      )}
      <span className="builder-editor__live-dot" data-tooltip={status} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canvas overlay (iframe coordinates; `--be-inv` keeps chips at screen size)
// ---------------------------------------------------------------------------

/** Other editors' selections: an outline in their color with their names. Hover is not shown. */
export function PeerSelections() {
  const runtime = useRuntime()
  const peers = useValue(runtime.peers)
  const measurement = useValue(runtime.measurement)
  const drag = useValue(runtime.drag)
  const groups = useMemo(() => {
    const byBlock = new Map<string, Peer[]>()
    for (const peer of peers.values()) {
      if (!peer.selectedId) continue
      byBlock.set(peer.selectedId, [...(byBlock.get(peer.selectedId) ?? []), peer])
    }
    return [...byBlock]
  }, [peers])
  if (!measurement || drag) return null
  return (
    <>
      {groups.map(([blockId, list]) => {
        const rect = measurement.blocks.find((b) => b.id === blockId)?.rect
        if (!rect) return null
        return (
          <div key={blockId} className="builder-peer-selection" style={{ ...box(rect), ...peerStyle(list[0].color) }}>
            <span className="builder-peer-selection__tags">
              {list.map((peer) => (
                <span key={peer.clientId} className="builder-peer-selection__tag" style={peerStyle(peer.color)}>
                  {peer.type === 'ai' && <Icon name="sparkle" size={10} />}
                  {shortName(peer.name)}
                </span>
              ))}
            </span>
          </div>
        )
      })}
    </>
  )
}

/** Other editors' pointers: a colored arrow with a name tag. Moves are eased by CSS. */
export function PeerCursors() {
  const runtime = useRuntime()
  const cursors = useValue(runtime.cursors)
  const measurement = useValue(runtime.measurement)
  const [now, setNow] = useState(() => Date.now())
  const any = cursors.size > 0
  // Re-check idle cursors once a second.
  useEffect(() => {
    if (!any) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [any])

  if (!measurement) return null
  return (
    <>
      {[...cursors.values()].map(({ info, cursor, at }) => {
        if (!cursor || now - at > CURSOR_IDLE_MS) return null
        const point = cursorPoint(measurement, cursor)
        if (!point) return null
        return (
          <div
            key={info.clientId}
            className="builder-cursor"
            style={peerStyle(info.color, { transform: `translate(${point.x}px, ${point.y}px)` })}
            aria-hidden
          >
            <span className="builder-cursor__inner">
              <svg className="builder-cursor__arrow" width="16" height="18" viewBox="0 0 16 18">
                <path d="M1.5 1.5v13.2l3.6-3.4 2.4 5.3 2.3-1-2.4-5.2h5L1.5 1.5Z" />
              </svg>
              <span className="builder-cursor__name">
                {info.type === 'ai' && <Icon name="sparkle" size={10} />}
                {shortName(info.name)}
              </span>
            </span>
          </div>
        )
      })}
    </>
  )
}

/** A colored frame and a chip while this editor follows someone. */
export function FollowFrame() {
  const runtime = useRuntime()
  const follow = useValue(runtime.follow)
  const live = useValue(runtime.live)
  const peer = follow ? live?.collaborators.find((c) => c.clientId === follow) : undefined
  if (!peer) return null
  return (
    <div className="builder-follow" style={peerStyle(peer.color)}>
      <span className="builder-follow__chip">
        Following {shortName(peer.name)}
        <span className="builder-follow__hint">Esc to stop</span>
        <button type="button" className="builder-follow__stop" aria-label="Stop following" onClick={() => runtime.follow.set(null)}>
          <Icon name="close" size={12} />
        </button>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Outline and inspector
// ---------------------------------------------------------------------------

/** Small dots on an outline row for each collaborator who has the block selected. */
export function PeerDots({ blockId }: { blockId: string }) {
  const on = usePeersOn(blockId)
  if (on.length === 0) return null
  return (
    <span className="builder-peer-dots" title={`Selected by ${listNames(on.map((p) => shortName(p.name)))}`}>
      {on.slice(0, 3).map((peer) => (
        <span key={peer.clientId} className="builder-peer-dots__dot" style={peerStyle(peer.color)} />
      ))}
    </span>
  )
}

/** "Ana is editing this block", when someone else has the selected block selected too. */
export function EditingBanner({ blockId }: { blockId: string }) {
  const on = usePeersOn(blockId)
  const runtime = useRuntime()
  const selected = useEditor(runtime.store, (s) => s.selectedId)
  if (on.length === 0 || selected !== blockId) return null
  const names = listNames(on.map((p) => shortName(p.name)))
  return (
    <output className="builder-editing-banner" style={peerStyle(on[0].color)}>
      <span className="builder-editing-banner__avatars">
        {on.slice(0, 3).map((peer) => (
          <span key={peer.clientId} className="builder-editing-banner__avatar" style={peerStyle(peer.color)}>
            {peer.type === 'ai' ? <Icon name="sparkle" size={10} /> : initials(peer.name)}
          </span>
        ))}
      </span>
      <span>
        <strong>{names}</strong> {on.length === 1 ? 'is' : 'are'} editing this block. Changes merge live.
      </span>
    </output>
  )
}

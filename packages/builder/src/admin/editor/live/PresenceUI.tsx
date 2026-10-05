'use client'

// Presence UI: avatars in the toolbar, other editors' cursors and selections on the canvas,
// colored dots in the outline, the "is editing this block" banner and the follow frame.
// Admin code: Payload CSS variables and SCSS only (editor.scss, "Multiplayer" section).

import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { localeLabel } from '../../../core'
import type { Rect } from '../../../core/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { breakpointAt } from '../styles/tokens'
import { useEditor } from '../store'
import { sameItems, useValue, useValueSelector } from '../valueStore'
import { cursorPoint, distinctInitials, shortName } from './presence'
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

/** Initials for the collaborators on this page. They differ between people, even for similar names. */
function useInitialsOf(): (name: string) => string {
  const runtime = useRuntime()
  const collaborators = useValueSelector(runtime.live, (live) => live?.collaborators)
  const map = useMemo(() => distinctInitials((collaborators ?? []).map((c) => c.name)), [collaborators])
  return (name) => map.get(name) ?? distinctInitials([name]).get(name) ?? '?'
}

/**
 * Display names: "You (another tab)" for this user's own other tabs, else the short name.
 * Two tabs of one person share the user id.
 */
function useNameOf(): (info: { userId?: string; name: string }) => string {
  const runtime = useRuntime()
  const selfId = useValueSelector(runtime.live, (live) => live?.self?.userId)
  return (info) => (selfId && info.userId === selfId ? 'You (another tab)' : shortName(info.name))
}

/** Collaborators (other than this editor) with `blockId` selected. */
function usePeersOn(blockId: string): Peer[] {
  const runtime = useRuntime()
  // Narrow: an outline row renders only when the peers on its own block change.
  return useValueSelector(runtime.peers, (peers) => [...peers.values()].filter((p) => p.selectedId === blockId), sameItems)
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

/** Who else is here (click to follow) and the last remote change. The save state shows the connection. */
export function Presence({ widths }: { widths: Parameters<typeof breakpointAt>[0] }) {
  const nameOf = useNameOf()
  const runtime = useRuntime()
  const live = useValue(runtime.live)
  const peers = useValue(runtime.peers)
  const follow = useValue(runtime.follow)
  const initialsOf = useInitialsOf()
  const localization = runtime.store.localization
  if (!live) return null

  const others = live.collaborators
  const recent = live.lastChange && live.changes.size > 0 ? live.lastChange : null

  const tooltip = (peer: Peer | undefined, info: { userId?: string; name: string }, ai: boolean) => {
    // While following, the pill at the top of the canvas already says so, and a tooltip would cover it.
    if (follow !== null && follow === peer?.clientId) return undefined
    const who = `${nameOf(info)}${ai ? ' (AI)' : ''}`
    const width = peer?.canvasWidth
    const where = width ? ` · editing on ${breakpointAt(widths, width)} (${width}px)` : ''
    const language = peer?.locale && localization ? ` · in ${localeLabel(localization, peer.locale)}` : ''
    return `${who}${language}${where} · ${follow === peer?.clientId ? 'click to stop following' : 'click to follow'}`
  }

  return (
    <div className="builder-editor__live">
      {recent && (
        <span className="builder-editor__live-activity" style={peerStyle(recent.color)}>
          <Icon name={recent.actor.type === 'ai' ? 'sparkle' : 'user'} size={12} />
          {shortName(recent.actor.label)} is editing
        </span>
      )}
      {live.lastError && (
        <span className="builder-editor__live-error" data-tooltip={live.lastError}>
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
              aria-label={`${nameOf(c)}${c.type === 'ai' ? ' (AI)' : ''}: ${follow === c.clientId ? 'stop following' : 'follow'}`}
              data-tooltip={tooltip(peers.get(c.clientId), c, c.type === 'ai')}
              onClick={() => runtime.follow.set(follow === c.clientId ? null : c.clientId)}
            >
              {c.type === 'ai' ? <Icon name="sparkle" size={12} /> : initialsOf(c.name)}
              {/* The collaborator's language, when it is not the default one. */}
              {localization && peers.get(c.clientId)?.locale && peers.get(c.clientId)?.locale !== localization.defaultLocale && (
                <span className="builder-presence__locale">{peers.get(c.clientId)?.locale?.toUpperCase()}</span>
              )}
            </button>
          ))}
          {others.length > MAX_AVATARS && (
            <span
              className="builder-presence__avatar builder-presence__avatar--more"
              data-tooltip={others
                .slice(MAX_AVATARS)
                .map((c) => nameOf(c))
                .join(', ')}
            >
              +{others.length - MAX_AVATARS}
            </span>
          )}
        </fieldset>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canvas overlay (iframe coordinates; `--be-inv` keeps chips at screen size)
// ---------------------------------------------------------------------------

/** Other editors' selections: an outline in their color with their names. Hover is not shown. */
export function PeerSelections() {
  const nameOf = useNameOf()
  const runtime = useRuntime()
  const peers = useValue(runtime.peers)
  const measurement = useValue(runtime.measurement)
  const drag = useValue(runtime.drag)
  const live = useValue(runtime.live)
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
        // A block that someone just changed already shows that person's name (the change flash). One name row only.
        const flashed = live?.changes.get(blockId)?.actor.label
        const tags = list.filter((peer) => peer.name !== flashed)
        return (
          <div key={blockId} className="builder-peer-selection" style={{ ...box(rect), ...peerStyle(list[0].color) }}>
            {tags.length > 0 && (
              <span className="builder-peer-selection__tags">
                {tags.map((peer) => (
                  <span key={peer.clientId} className="builder-peer-selection__tag" style={peerStyle(peer.color)}>
                    {peer.type === 'ai' && <Icon name="sparkle" size={10} />}
                    {nameOf(peer)}
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}

/** Other editors' pointers: a small colored arrowhead (no tail) with a name tag. Moves are eased by CSS. */
export function PeerCursors() {
  const nameOf = useNameOf()
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
              <svg className="builder-cursor__arrow" width="18" height="18" viewBox="0 0 18 18">
                <path d="M2 2 17 8.4 10 10 8.4 17Z" />
              </svg>
              <span className="builder-cursor__name">
                {info.type === 'ai' && <Icon name="sparkle" size={10} />}
                {nameOf(info)}
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
  const nameOf = useNameOf()
  const runtime = useRuntime()
  const follow = useValue(runtime.follow)
  const live = useValue(runtime.live)
  const peer = follow ? live?.collaborators.find((c) => c.clientId === follow) : undefined
  if (!peer) return null
  return (
    <div className="builder-follow" style={peerStyle(peer.color)}>
      <span className="builder-follow__chip">
        Following {nameOf(peer)}
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
  const nameOf = useNameOf()
  const on = usePeersOn(blockId)
  if (on.length === 0) return null
  return (
    <span className="builder-peer-dots" data-tooltip-side="right" data-tooltip={`Selected by ${listNames(on.map((p) => nameOf(p)))}`}>
      {on.slice(0, 3).map((peer) => (
        <span key={peer.clientId} className="builder-peer-dots__dot" style={peerStyle(peer.color)} />
      ))}
    </span>
  )
}

/** "Ana is editing this block", when someone else has the selected block selected too. */
export function EditingBanner({ blockId }: { blockId: string }) {
  const nameOf = useNameOf()
  const on = usePeersOn(blockId)
  const runtime = useRuntime()
  const selected = useEditor(runtime.store, (s) => s.selectedId)
  const initialsOf = useInitialsOf()
  if (on.length === 0 || selected !== blockId) return null
  const names = listNames(on.map((p) => nameOf(p)))
  return (
    <output className="builder-editing-banner" style={peerStyle(on[0].color)}>
      <span className="builder-editing-banner__avatars">
        {on.slice(0, 3).map((peer) => (
          <span key={peer.clientId} className="builder-editing-banner__avatar" style={peerStyle(peer.color)}>
            {peer.type === 'ai' ? <Icon name="sparkle" size={10} /> : initialsOf(peer.name)}
          </span>
        ))}
      </span>
      <span>
        {names === 'You (another tab)' ? (
          <>You are editing this block in another tab. Changes merge live.</>
        ) : (
          <>
            <strong>{names}</strong> {on.length === 1 ? 'is' : 'are'} editing this block. Changes merge live.
          </>
        )}
      </span>
    </output>
  )
}

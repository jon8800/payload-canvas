// The live event bus: delivers operations and presence to every open editor of a document.
//
// One channel per document, keyed "collection:id". v1 ships an in-process bus (memory). It works
// with one app server. With more than one server, implement `LiveBus` on Postgres LISTEN/NOTIFY:
//   - publish: NOTIFY builder_live, '<channel> <json>' (payloads over 8000 bytes: store the event in
//     a table and NOTIFY its id), and keep a short event table for `replay`.
//   - subscribe: one LISTEN connection per server, fanned out to local listeners by channel.
//   - presence: NOTIFY join and leave messages, and expire members that stop sending heartbeats.
// Pass the bus to `websiteBuilder({ live: { bus } })`. The per-document write lock (mutex.ts) also
// becomes cross-server then: use `pg_advisory_xact_lock(hashtext(channel))`.

import type { LiveOperationsEvent } from './types'

/** One open editor connection. Internal: the endpoint sends only names to clients. */
export type LiveMember = { connectionId: string; userId: string; name: string; type: 'user' | 'ai' }

export type BusMessage = LiveOperationsEvent | { type: 'presence'; members: LiveMember[] }

export type ReplayQuery = {
  /** Last event id the client received (SSE Last-Event-ID). */
  afterEventId?: string
  /** ISO time of the draft the client loaded. Used on the first connection. */
  afterTime?: string
}

export interface LiveBus {
  /** Stores the event for replay, gives it an id and delivers it to the channel's subscribers. */
  publish(channel: string, event: Omit<LiveOperationsEvent, 'eventId'>): Promise<LiveOperationsEvent>
  /** Delivers every later message of the channel. Returns the unsubscribe function. */
  subscribe(channel: string, listener: (message: BusMessage) => void): () => void
  /**
   * Events after the given point, oldest first. `null` when the bus cannot fill the gap (events
   * expired, or the id comes from an earlier server process). The client must then reload.
   */
  replay(channel: string, query: ReplayQuery): Promise<LiveOperationsEvent[] | null>
  /** Id of the newest stored event of the channel, or null. */
  head(channel: string): Promise<string | null>
  /** Adds a connection to the channel's presence list. Returns the function that removes it. */
  join(channel: string, member: LiveMember): Promise<() => void>
  members(channel: string): Promise<LiveMember[]>
}

export type MemoryBusOptions = {
  /** Events kept per channel for replay. Default 200. */
  bufferSize?: number
  /** How long events stay replayable, in ms. Default 10 minutes. */
  bufferTtlMs?: number
  /** Clock, for tests. */
  now?: () => number
}

type Stored = { seq: number; event: LiveOperationsEvent; storedAt: number }

type Channel = {
  events: Stored[]
  /** Newest event that left the buffer. Replays from before it cannot be filled. */
  evicted: { seq: number; at: string } | null
  listeners: Set<(message: BusMessage) => void>
  members: Map<string, LiveMember>
}

/** The in-process bus. Works for one app server. */
export function createMemoryBus(options: MemoryBusOptions = {}): LiveBus {
  const bufferSize = options.bufferSize ?? 200
  const bufferTtlMs = options.bufferTtlMs ?? 10 * 60 * 1000
  const now = options.now ?? Date.now
  // A new epoch per process: ids from an earlier process never match, so they trigger a resync.
  const epoch = globalThis.crypto.randomUUID().slice(0, 8)
  const channels = new Map<string, Channel>()
  let seq = 0

  const channelOf = (key: string): Channel => {
    let channel = channels.get(key)
    if (!channel) {
      channel = { events: [], evicted: null, listeners: new Set(), members: new Map() }
      channels.set(key, channel)
    }
    return channel
  }

  const prune = (channel: Channel) => {
    const cutoff = now() - bufferTtlMs
    while (channel.events.length > 0 && (channel.events.length > bufferSize || channel.events[0].storedAt < cutoff)) {
      const old = channel.events.shift()
      if (old) channel.evicted = { seq: old.seq, at: old.event.at }
    }
  }

  const dropIfIdle = (key: string) => {
    const channel = channels.get(key)
    if (!channel) return
    prune(channel)
    if (channel.listeners.size === 0 && channel.members.size === 0 && channel.events.length === 0) channels.delete(key)
  }

  const deliver = (channel: Channel, message: BusMessage) => {
    for (const listener of channel.listeners) {
      try {
        listener(message)
      } catch {
        // One broken listener (a closed stream) must not stop the others.
      }
    }
  }

  const presence = (channel: Channel) => deliver(channel, { type: 'presence', members: [...channel.members.values()] })

  return {
    async publish(key, input) {
      const channel = channelOf(key)
      seq += 1
      const event: LiveOperationsEvent = { ...input, eventId: `${epoch}:${seq}` }
      channel.events.push({ seq, event, storedAt: now() })
      prune(channel)
      deliver(channel, event)
      return event
    },

    subscribe(key, listener) {
      channelOf(key).listeners.add(listener)
      return () => {
        channels.get(key)?.listeners.delete(listener)
        dropIfIdle(key)
      }
    },

    async replay(key, query) {
      const channel = channels.get(key)
      if (channel) prune(channel)
      const events = channel?.events ?? []
      const evicted = channel?.evicted ?? null

      if (query.afterEventId !== undefined) {
        const [idEpoch, raw] = query.afterEventId.split(':')
        const after = Number(raw)
        if (idEpoch !== epoch || !Number.isInteger(after)) return null
        if (evicted && after < evicted.seq) return null
        return events.filter((e) => e.seq > after).map((e) => e.event)
      }
      if (query.afterTime !== undefined) {
        const after = Date.parse(query.afterTime)
        if (Number.isNaN(after)) return null
        if (evicted && Date.parse(evicted.at) > after) return null
        return events.filter((e) => Date.parse(e.event.at) > after).map((e) => e.event)
      }
      return []
    },

    async head(key) {
      return channels.get(key)?.events.at(-1)?.event.eventId ?? null
    },

    async join(key, member) {
      const channel = channelOf(key)
      channel.members.set(member.connectionId, member)
      presence(channel)
      return () => {
        const current = channels.get(key)
        if (!current?.members.delete(member.connectionId)) return
        presence(current)
        dropIfIdle(key)
      }
    },

    async members(key) {
      return [...(channels.get(key)?.members.values() ?? [])]
    },
  }
}

/** Channel name of a document. */
export function channelKey(collection: string, id: string | number): string {
  return `${collection}:${id}`
}

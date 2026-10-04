'use client'
// Multiplayer in the open editor. Mounted by the Editor. See useMultiplayer.ts and sync.ts.
export { useMultiplayer, type LiveChange, type LiveState, type LiveStatus, type Peer, type PeerCursor } from './useMultiplayer'
export { changedIds, cursorAt, cursorPoint, initials, shortName, FALLBACK_COLOR } from './presence'
export { createSyncEngine, type SyncEngine, type SyncUpdate } from './sync'
export type { LiveActor, CollaboratorInfo, CollaboratorCursor, Awareness } from '../../../live/types'

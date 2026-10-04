// Live editing (server side): multiplayer document sessions, the shared operation helpers, the
// SSE, commit, awareness and operations endpoints, and the document meta and publish endpoints.
// See docs/architecture.md section 12.
export * from './types'
export { createKeyedMutex, type KeyedMutex } from './mutex'
export {
  createSessionManager,
  channelKey,
  collaboratorColor,
  collaboratorName,
  sanitizeAwareness,
  COLLABORATOR_COLORS,
  type SessionManager,
  type SessionManagerOptions,
  type SessionTarget,
  type SessionTimers,
  type SessionSnapshot,
  type SavedInfo,
  type SessionSend,
  type CommitArgs,
  type CommitResult,
  type ConnectArgs,
  type Connection,
} from './session'
export {
  createUpdateAccessCheck,
  defaultLiveRuntime,
  installShutdownFlush,
  liveRuntimeOf,
  LIVE_RUNTIME_KEY,
  type LiveRuntime,
  type UpdateAccessCheck,
} from './runtime'
export { resolveOperations, splitLayoutErrors, actorFromUser, userLabel, payloadFieldErrors, type LiveDocStore, type PayloadFieldError } from './apply'
export { liveEndpoints, sessionStream, sseFrame, requestActor, sessionTargetOf, targetOf, LIVE_PATH, SSE_HEADERS, type LiveEndpointOptions } from './endpoints'
export {
  builderConfigOf,
  documentEndpoints,
  documentErrorsOf,
  loadDocMeta,
  payloadErrorMessage,
  runPublishAction,
  BUILDER_CONFIG_KEY,
  type BuilderCollectionServer,
  type BuilderServerConfig,
  type DocMetaArgs,
  type DocumentEndpointOptions,
  type PublishCheck,
} from './document'
export {
  changedFields,
  createFieldClock,
  defaultFieldClock,
  KEEP_LOCK_CONTEXT,
  LOCKED_DOCUMENTS_SLUG,
  staleSaveMessage,
  type FieldClock,
  type FieldConflict,
} from './fieldsGuard'

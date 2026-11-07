// Names and types of the AI settings global that the admin field component also needs. Client-safe.

/** The virtual field with each key's status. Read only, never stored. */
export const KEY_STATUS_FIELD = 'keyStatus'

/** What a key is for. */
export type AiKeyUse = 'chat' | 'images'

/** The two key fields. Both always exist, so the DB schema does not change with the adapters. */
export type AiKeyFieldName = 'chatApiKey' | 'imageApiKey'

/** A key's status, as reads return it in `keyStatus`. `unreadable`: stored, but it does not decrypt (another secret). */
export type AiKeyStatus = { state: 'set'; last4: string | null } | { state: 'unset' } | { state: 'unreadable' }

/** The `admin.custom.aiKey` of a key field, for the field component. */
export type AiKeyFieldCustom = { keyEnv: string | null; keyUrl: string | null; missingKey: boolean; uses: AiKeyUse[] }

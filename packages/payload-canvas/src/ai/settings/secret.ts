// Encryption of the API keys in the AI settings global. Server only.
//
// AES-256-GCM. The 32-byte key comes from Payload's secret through HKDF-SHA256 with a fixed label,
// so the stored keys stay readable as long as the secret does not change. Every value gets a
// random 12-byte IV. The stored string is "v1:" plus base64url(iv + auth tag + ciphertext).

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/** Version prefix of a stored value. A new format gets a new prefix. */
export const SECRET_PREFIX = 'v1:'

const IV_BYTES = 12
const TAG_BYTES = 16
const LABEL = 'payload-canvas ai-settings api-key v1'

function keyOf(secret: string): Buffer {
  if (!secret) throw new Error('Payload has no secret, so the AI settings cannot encrypt API keys. Set `secret` in the Payload config.')
  return Buffer.from(hkdfSync('sha256', secret, 'payload-canvas', LABEL, 32))
}

/** True when the value has the stored format (it may still fail to decrypt). */
export function isSealed(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(SECRET_PREFIX)
}

/** Encrypts a key for storage. Throws when the secret is empty. */
export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return SECRET_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

/**
 * Decrypts a stored key. Null when the value is not in the stored format, was changed, or was
 * encrypted with another secret. Never throws.
 */
export function openSecret(value: unknown, secret: string): string | null {
  if (!isSealed(value) || !secret) return null
  try {
    const bytes = Buffer.from(value.slice(SECRET_PREFIX.length), 'base64url')
    if (bytes.length <= IV_BYTES + TAG_BYTES) return null
    const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), bytes.subarray(0, IV_BYTES))
    decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

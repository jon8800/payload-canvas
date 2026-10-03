const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const LENGTH = 6

/** Short random block id, e.g. "b_8f2k9x". */
export function createId(): string {
  // 6 base-36 characters: about 2.2 billion values. Callers check for collisions where it matters.
  const bytes = new Uint8Array(LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  let id = 'b_'
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length]
  return id
}

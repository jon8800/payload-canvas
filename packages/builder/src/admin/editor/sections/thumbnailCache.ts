'use client'

// Section thumbnails kept in IndexedDB, so the library shows them at once on the next visit.
// Keys change with the content and the theme (thumbnailKey.ts), so old entries simply go unused;
// the oldest are pruned. Every failure (private mode, quota, no IndexedDB) acts like a miss.

const DB_NAME = 'payload-builder'
const STORE = 'thumbnails'
const VERSION = 1
/** Entries kept. About 30 kB each. */
const MAX_ENTRIES = 300

type Entry = { key: string; url: string; at: number }

let db: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, VERSION)
      request.addEventListener('upgradeneeded', () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('at', 'at')
      })
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () => resolve(null))
      request.addEventListener('blocked', () => resolve(null))
    } catch {
      resolve(null)
    }
  })
  return db
}

function done<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => resolve(null))
  })
}

export async function readThumbnail(key: string): Promise<string | null> {
  const database = await open()
  if (!database) return null
  try {
    const entry = (await done(database.transaction(STORE, 'readonly').objectStore(STORE).get(key))) as Entry | undefined | null
    return entry?.url ?? null
  } catch {
    return null
  }
}

let writes = 0

export async function writeThumbnail(key: string, url: string): Promise<void> {
  const database = await open()
  if (!database) return
  try {
    const store = database.transaction(STORE, 'readwrite').objectStore(STORE)
    await done(store.put({ key, url, at: Date.now() } satisfies Entry))
    // Prune now and then, not on every write.
    if (++writes % 20 === 1) await prune(database)
  } catch {
    // Quota or a closed database: the memory cache still has it.
  }
}

async function prune(database: IDBDatabase): Promise<void> {
  const store = database.transaction(STORE, 'readwrite').objectStore(STORE)
  const count = (await done(store.count())) ?? 0
  let extra = count - MAX_ENTRIES
  if (extra <= 0) return
  await new Promise<void>((resolve) => {
    const cursor = store.index('at').openCursor()
    cursor.addEventListener('success', () => {
      const current = cursor.result
      if (!current || extra <= 0) return resolve()
      current.delete()
      extra--
      current.continue()
    })
    cursor.addEventListener('error', () => resolve())
  })
}

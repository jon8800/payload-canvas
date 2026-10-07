/**
 * Runs async tasks one at a time per key, in call order. Different keys run in parallel.
 * The document sessions use it per document, so loads and commits apply in arrival order.
 * In-process only, like the sessions themselves.
 */
export type KeyedMutex = {
  run<T>(key: string, task: () => Promise<T>): Promise<T>
  /** Number of keys with a running or queued task. For tests. */
  size(): number
}

export function createKeyedMutex(): KeyedMutex {
  const tails = new Map<string, Promise<void>>()
  return {
    run(key, task) {
      const previous = tails.get(key) ?? Promise.resolve()
      const result = previous.then(task)
      // The next task waits for this one, whether it succeeds or fails.
      const tail = result.then(
        () => undefined,
        () => undefined,
      )
      tails.set(key, tail)
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key)
      })
      return result
    },
    size: () => tails.size,
  }
}

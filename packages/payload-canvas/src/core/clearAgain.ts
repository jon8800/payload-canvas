import { after } from 'next/server'

/** Long enough for a page render that started before a save to finish. */
const SETTLE_MS = 5000

/**
 * Runs `clear` again a few seconds after the response. A page render that started before the save
 * stores what it read before the save, and Next keeps it as fresh until the next save. The second
 * run marks that page stale too. Outside a Next request `after` throws; callers catch and log it.
 */
export function clearAgainAfterResponse(clear: () => void) {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    clear()
  })
}

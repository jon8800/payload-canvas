'use client'

// Messages of the props' own `validate` functions under the inspector's inputs. The functions run
// on the server (they may need `req`, the database or the whole document), so the inspector asks
// the live endpoint `validate` about the selected block, 500 ms after the last change. Only block
// types with such a function ask (`config.validateTypes`). A message never stops a draft save; it
// says what will stop Publish.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import type { Block } from '../../../core/types'
import type { LiveValidateResponse } from '../../../live/types'
import { useRuntime } from '../runtime'
import { InputError } from './CheckedInputs'

const DEBOUNCE_MS = 500

/** Messages by inspector path (`builder.<blockId>.<propPath>`). */
type Problems = ReadonlyMap<string, string>

const EMPTY: Problems = new Map()
const FieldProblemsContext = createContext<Problems>(EMPTY)

/** The server's messages for one block, while it is selected. */
function useBlockProblems(block: Block): Problems {
  const runtime = useRuntime()
  const { config } = runtime
  const document = runtime.canvasInit.document
  const blockId = block.id
  const url =
    document && document.id !== ''
      ? `${config.liveEndpoint}/${encodeURIComponent(document.collection)}/${encodeURIComponent(String(document.id))}/validate`
      : ''
  const checked = Boolean(url && config.validateTypes?.includes(block.type))
  // What the functions read: the block's own data. A new value restarts the wait.
  const body = checked ? JSON.stringify({ block: { id: block.id, type: block.type, props: block.props, bindings: block.bindings } }) : ''
  const [problems, setProblems] = useState<{ body: string; blockId: string; map: Problems }>({ body: '', blockId: '', map: EMPTY })

  useEffect(() => {
    if (!body) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal })
        .then((res) => res.json() as Promise<LiveValidateResponse>)
        .then((data) => {
          if (!data.ok) return
          const map = new Map<string, string>()
          for (const p of data.problems) {
            const path = `builder.${blockId}.${p.propPath}`
            if (!map.has(path)) map.set(path, p.message)
          }
          setProblems({ body, blockId, map })
        })
        .catch(() => {
          // Aborted, or offline: the publish check still runs the functions.
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [body, url, blockId])

  // Messages of another block never show. Those of an older value of this block stay until the
  // new answer arrives, so they do not flicker while someone types.
  if (!body) return EMPTY
  return problems.blockId === blockId ? problems.map : EMPTY
}

/** Gives the inspector fields of one block their `validate` messages. */
export function FieldProblemsProvider({ block, children }: { block: Block; children: ReactNode }) {
  const problems = useBlockProblems(block)
  return <FieldProblemsContext.Provider value={problems}>{children}</FieldProblemsContext.Provider>
}

/** The `validate` message of the field at this inspector path, under its input. */
export function FieldProblem({ path }: { path: string }) {
  const message = useContext(FieldProblemsContext).get(path)
  return message ? <InputError>{message}</InputError> : null
}

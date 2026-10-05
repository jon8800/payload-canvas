'use client'

// The assistant's state and its one network call. It lives in the runtime (not in a component),
// so a reply keeps streaming while the user looks at another inspector tab.
//
// Operations from the server are applied as the user's own edits: they enter the undo history,
// grouped by turn, so one Ctrl+Z reverts a whole assistant turn. The layout field sync and
// Payload's autosave persist them. The assistant never calls a save endpoint.

import { clientIdentity } from '../../../ai/config'
import type { AiChatRequest, AiClientConfig, AiMessage, AiStreamEvent } from '../../../ai/types'
import { findBlock } from '../../../core'
import type { Operation } from '../../../core/types'
import { changedIds } from '../live'
import type { Runtime } from '../runtime'
import { templateContext } from '../templates/state'
import { createValueStore, type ValueStore } from '../valueStore'
import {
  capHistory,
  closeTurn,
  EMPTY_HISTORY,
  historyKey,
  historyMatches,
  loadHistory,
  saveHistory,
  settleTools,
  toolUseIds,
  type ChatHistory,
  type TranscriptPart,
} from './history'
import { readStream } from './sse'

export type AssistantNotice =
  /** No API key on the server: a setup card instead of an error. */
  | { kind: 'setup'; message: string }
  | { kind: 'error'; message: string }
  /** Quiet notes: the user stopped the reply, or the stream ended without `done`. */
  | { kind: 'info'; message: string; /** The user's message that got no reply: shown dimmed above the note. */ echo?: string }

/** The note after Stop. `finish` tells it from other info notes by this text. */
export const STOPPED_NOTE = 'Stopped.'

export type AssistantState = {
  /** Local storage key of this document's chat. Null until the document has an id. */
  key: string | null
  history: ChatHistory
  streaming: boolean
  /** The reply streaming in now, after the last confirmed `message`. Null when idle. */
  live: { parts: TranscriptPart[]; turnStart: number } | null
  notice: AssistantNotice | null
  /** A prompt that got no answer (error before any reply). Shown with a Retry button; not in the history. */
  failed: string | null
  /** The input text. Kept here so it survives tab switches and comes back after Stop. */
  draft: string
  /**
   * The messages came back from storage (a reload, or another document and back). The editor's
   * undo history did not, so Ctrl+Z cannot revert those replies. The panel says so.
   */
  restored: boolean
  /**
   * The server has no API key or config. Set at start from the client config (`ai.ready` /
   * `setupProblem`, read when the server started), or when a request answers `no_api_key`. The
   * panel shows the setup state until the user checks again: then the next send asks the server
   * (Anthropic `ant auth login` credentials cannot be seen at startup). Holds the adapter's
   * message, for the developer details.
   */
  setup: string | null
}

export type AssistantController = ReturnType<typeof createAssistant>

/** How long blocks changed by the assistant stay highlighted on the canvas. */
export const FLASH_MS = 2500
/** The canvas scrolls to the assistant's changes at most this often. */
export const REVEAL_EVERY_MS = 1000
/** Times for the canvas to render a new block before it scrolls to it (as when a block is inserted by hand). */
const REVEAL_DELAYS_MS = [120, 600]

const storage = () => (typeof window === 'undefined' ? null : window.localStorage)

export function createAssistant(runtime: Runtime, endpoint: string) {
  const ai = runtime.config.ai
  const state: ValueStore<AssistantState> = createValueStore<AssistantState>({
    key: null,
    history: EMPTY_HISTORY,
    streaming: false,
    live: null,
    notice: null,
    failed: null,
    draft: '',
    restored: false,
    setup: initialSetup(ai),
  })
  let collection = ''
  let docId: string | number | null = null
  let abort: AbortController | null = null
  /** `${adapter}:${model}` of the server. A chat written by another one starts over. */
  const identity = ai ? clientIdentity(ai) : 'none:'
  const emptyHistory = (): ChatHistory => ({ ...EMPTY_HISTORY, provider: identity })

  const patch = (next: Partial<AssistantState>) => state.set({ ...state.get(), ...next })
  const save = () => {
    const { key, history } = state.get()
    if (key) saveHistory(storage(), key, history)
  }

  /** Highlights blocks on the canvas, like live remote changes, labelled "Assistant". */
  const flash = (ids: string[]) => {
    if (ids.length === 0) return
    const at = Date.now()
    const next = new Map(runtime.assistantFlash.get())
    for (const id of ids) next.set(id, at)
    runtime.assistantFlash.set(next)
    window.setTimeout(() => {
      const current = new Map(runtime.assistantFlash.get())
      for (const id of ids) if (current.get(id) === at) current.delete(id)
      runtime.assistantFlash.set(current)
    }, FLASH_MS)
  }

  /** The first of these blocks that is in the layout. */
  const firstExisting = (ids: string[]): string | null => {
    const { layout } = runtime.store.getState()
    return ids.find((id) => findBlock(layout, id)) ?? null
  }

  let lastReveal = 0
  let revealTimers: number[] = []
  const stopReveal = () => {
    for (const timer of revealTimers) window.clearTimeout(timer)
    revealTimers = []
  }
  /** Scrolls the canvas to a block. Asks again once the canvas has rendered a block that is new. */
  const scrollTo = (id: string) => {
    stopReveal()
    revealTimers = REVEAL_DELAYS_MS.map((delay) => window.setTimeout(() => runtime.postToCanvas({ type: 'scrollIntoView', id }), delay))
  }
  /**
   * After a batch of operations: scrolls the canvas to the first changed block that still exists,
   * so the change does not happen off screen. At most once per REVEAL_EVERY_MS: a reply that sends
   * many batches does not make the canvas jump around.
   */
  const reveal = (ids: string[]) => {
    const now = Date.now()
    if (now - lastReveal < REVEAL_EVERY_MS) return
    const id = firstExisting(ids)
    if (!id) return
    lastReveal = now
    scrollTo(id)
  }

  /** Remembers the first changed block on the tool chip, for its "Show" button. */
  const markShow = (ids: string[], callId: string | null) => {
    const id = firstExisting(ids)
    const { history } = state.get()
    const tool = callId ? history.tools[callId] : undefined
    if (!id || !callId || !tool || tool.showId) return
    patch({ history: { ...history, tools: { ...history.tools, [callId]: { ...tool, showId: id } } } })
  }

  /** The tool call that operations belong to: the last one of this turn. */
  const lastCallId = (): string | null => {
    const { live, history } = state.get()
    const fromLive = live?.parts.findLast((p) => p.kind === 'tool')
    if (fromLive?.kind === 'tool') return fromLive.callId
    return toolUseIds(history.messages.slice(live?.turnStart ?? 0)).at(-1) ?? null
  }

  /** `callId`: the tool call that made the operations (older servers send none: then the last call). */
  const applyOperations = (turnId: string, ops: Operation[], toolCallId?: string) => {
    const { store } = runtime
    const callId = toolCallId ?? lastCallId()
    const group = `ai:${turnId}`
    const applied: Operation[] = []
    const errors: string[] = []
    // One by one: an operation that conflicts with a local edit fails alone, the rest still apply.
    for (const op of ops) {
      // The server already gave each prop update its locale.
      if (store.apply(op, { group, stampLocale: false })) applied.push(op)
      else errors.push((store.getState().lastError ?? 'it could not be applied').replace(/^Operation \d+ \([^)]*\):\s*/, ''))
    }
    if (errors.length > 0) {
      // Shown on the chip, not as a toolbar error.
      store.clearError()
      const what = ops.length === 1 ? 'The change' : `${errors.length} of ${ops.length} changes`
      const note = `${what} did not apply, because the page changed meanwhile (${errors[0]}).`
      const { history } = state.get()
      if (callId && history.tools[callId]) {
        patch({ history: { ...history, tools: { ...history.tools, [callId]: { ...history.tools[callId], note } } } })
      } else {
        patch({ notice: { kind: 'error', message: note } })
      }
    }
    const changed = changedIds(applied)
    flash(changed)
    reveal(changed)
    markShow(changed, callId)
  }

  const onEvent = (event: AiStreamEvent, turn: { ended: boolean }) => {
    const current = state.get()
    const live = current.live ?? { parts: [], turnStart: current.history.messages.length }
    switch (event.type) {
      case 'text': {
        const parts = [...live.parts]
        const last = parts.at(-1)
        if (last?.kind === 'text') parts[parts.length - 1] = { kind: 'text', text: last.text + event.text }
        else parts.push({ kind: 'text', text: event.text })
        patch({ live: { ...live, parts } })
        return
      }
      case 'tool': {
        const { history } = current
        const tools = {
          ...history.tools,
          [event.callId]: {
            name: event.name,
            status: event.status,
            summary: event.summary,
            note: history.tools[event.callId]?.note,
            ...(history.tools[event.callId]?.showId ? { showId: history.tools[event.callId].showId } : {}),
            ...(event.image ? { image: event.image } : {}),
          },
        }
        // A chip already in the confirmed history updates in place; a new one joins the live reply.
        const known =
          live.parts.some((p) => p.kind === 'tool' && p.callId === event.callId) ||
          toolUseIds(history.messages.slice(live.turnStart)).includes(event.callId)
        const parts: TranscriptPart[] = known ? live.parts : [...live.parts, { kind: 'tool', callId: event.callId, name: event.name }]
        patch({ history: { ...history, tools }, live: { ...live, parts } })
        return
      }
      case 'operations':
        applyOperations(event.turnId, event.ops, event.callId)
        return
      case 'message': {
        const { history } = current
        // The confirmed message now shows everything streamed so far. Keep only chips it does not hold.
        const ids = event.message.role === 'assistant' ? toolUseIds([event.message]) : []
        const parts =
          event.message.role === 'assistant'
            ? live.parts.filter((p) => p.kind === 'tool' && !ids.includes(p.callId))
            : live.parts
        patch({ history: { ...history, messages: [...history.messages, event.message] }, live: { ...live, parts } })
        save()
        return
      }
      case 'done':
        turn.ended = true
        finish(null)
        return
      case 'error':
        turn.ended = true
        if (event.code === 'aborted') finish({ kind: 'info', message: STOPPED_NOTE })
        else if (event.code === 'no_api_key') finish({ kind: 'setup', message: event.message })
        else finish({ kind: 'error', message: event.message || 'The assistant failed.' })
    }
  }

  /** Ends the turn: makes the history valid to send again and settles chips that were still running. */
  const finish = (notice: AssistantNotice | null) => {
    const { history, live } = state.get()
    if (!live) return
    abort = null
    const partial = live.parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('')
    const answered = history.messages.slice(live.turnStart).some((m) => m.role === 'assistant') || partial.trim() !== ''
    let messages = history.messages
    let failed: string | null = null
    let draft = state.get().draft
    let setup = state.get().setup
    if (notice?.kind === 'setup') {
      // No key: the setup state replaces the chat. With no reply, the branch below returns the
      // prompt to the input, as it does after Stop.
      setup = notice.message
      notice = answered ? null : { kind: 'info', message: '' }
    }
    if (answered) {
      messages = closeTurn(history.messages, partial)
    } else {
      // Nothing came back: take the prompt (and the server's context message) out of the history.
      const prompt = history.messages[live.turnStart]
      messages = history.messages.slice(0, live.turnStart)
      const text = typeof prompt?.content === 'string' ? prompt.content : ''
      if (notice?.kind === 'info') {
        // Stopped before any reply, or no key: give the prompt back to edit. The conversation keeps
        // a dimmed copy of it and a note, so Stop shows that it did something.
        const back = !draft.trim()
        if (back) draft = text
        const message = notice.message === STOPPED_NOTE && back ? `${STOPPED_NOTE} Your message is back in the box.` : notice.message
        notice = message && text ? { kind: 'info', message, echo: text } : null
      } else {
        failed = text
        notice ??= { kind: 'error', message: 'The assistant sent no reply.' }
      }
    }
    // Chips of this reply that still run (in the history, or live only) will never finish.
    const replyCalls = [...toolUseIds(history.messages.slice(live.turnStart)), ...live.parts.flatMap((p) => (p.kind === 'tool' ? [p.callId] : []))]
    const tools = settleTools(history.tools, replyCalls)
    // Keep `provider`: without it, a reload sees a chat from another adapter and starts over.
    state.set({ ...state.get(), history: { ...history, messages, tools }, live: null, streaming: false, notice, failed, draft, setup })
    save()
  }

  const send = async (input: string) => {
    const text = input.trim()
    const current = state.get()
    if (!text || current.streaming || !current.key || docId === null) return
    const history = { ...capHistory(current.history), provider: identity }
    const messages: AiMessage[] = [...history.messages, { role: 'user', content: text }]
    state.set({
      ...current,
      history: { ...history, messages },
      streaming: true,
      live: { parts: [], turnStart: history.messages.length },
      notice: null,
      failed: null,
      draft: current.draft.trim() === text ? '' : current.draft,
    })
    save()

    const { store } = runtime
    const editor = store.getState()
    const body: AiChatRequest = {
      collection,
      id: docId,
      messages,
      layout: editor.layout,
      selectedId: editor.selectedId,
      context: templateContext(runtime.template.get()),
      canvasWidth: editor.canvasWidth ?? (Math.round(runtime.frame.get().width) || null),
      // Localized layouts: the assistant reads and writes the locale the editor shows.
      ...(editor.locale ? { locale: editor.locale } : {}),
    }
    const controller = new AbortController()
    abort = controller
    const turn = { ended: false }
    try {
      const response = await fetch(`${endpoint}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const isStream = response.headers.get('content-type')?.includes('text/event-stream') ?? false
      if (response.body && (response.ok || isStream)) {
        // Failures before the stream starts also arrive as one `error` event, with the HTTP status.
        await readStream(response.body, (event) => {
          if (!turn.ended) onEvent(event, turn)
        })
        if (!turn.ended && !response.ok) {
          turn.ended = true
          finish({ kind: 'error', message: fallbackMessage(response.status) })
        }
        if (!turn.ended) finish({ kind: 'info', message: 'The reply ended early. Send a message to continue.' })
        return
      }
      turn.ended = true
      const error = await errorOf(response)
      finish(error.code === 'no_api_key' ? { kind: 'setup', message: error.message } : { kind: 'error', message: error.message })
    } catch (error) {
      if (turn.ended) return
      if (controller.signal.aborted) finish({ kind: 'info', message: STOPPED_NOTE })
      else finish({ kind: 'error', message: error instanceof Error ? `Network error: ${error.message}` : 'Network error.' })
    }
  }

  return {
    state,
    send,
    stop() {
      abort?.abort()
    },
    /** Loads the chat of the open document. Called by the editor when the document id is known. */
    setDocument(nextCollection: string, id: string | number | null | undefined) {
      const known = id !== null && id !== undefined && id !== ''
      const key = known ? historyKey(nextCollection, id) : null
      if (key === state.get().key) return
      abort?.abort()
      stopReveal()
      collection = nextCollection
      docId = known ? id : null
      const stored = key ? loadHistory(storage(), key) : EMPTY_HISTORY
      const matches = historyMatches(stored, identity)
      state.set({
        key,
        history: matches ? stored : emptyHistory(),
        streaming: false,
        live: null,
        notice: matches ? null : { kind: 'info', message: `New chat: the assistant now uses ${ai?.label ?? 'another adapter'} (${ai?.model || 'another model'}).` },
        failed: null,
        draft: '',
        restored: matches && stored.messages.length > 0,
        setup: state.get().setup,
      })
    },
    newChat() {
      abort?.abort()
      const { key, draft } = state.get()
      state.set({ key, history: emptyHistory(), streaming: false, live: null, notice: null, failed: null, draft, restored: false, setup: state.get().setup })
      save()
    },
    /** "Show" on a change: selects the block and scrolls the canvas to it. False when the block is gone. */
    show(id: string): boolean {
      if (!firstExisting([id])) return false
      runtime.store.select(id)
      flash([id])
      scrollTo(id)
      return true
    },
    retry() {
      const { failed } = state.get()
      if (failed) void send(failed)
    },
    setDraft(draft: string) {
      if (state.get().draft !== draft) patch({ draft })
    },
    /** "Try again" in the setup state: show the chat again. The next send checks the key. */
    clearSetup() {
      patch({ setup: null })
    },
    dismissNotice() {
      patch({ notice: null })
    },
  }
}

/** The setup message when the server found no credentials or config at startup, else null. */
export function initialSetup(ai: AiClientConfig | null | undefined): string | null {
  if (!ai || ai.ready !== false) return null
  return ai.setupProblem?.trim() || 'The AI assistant is not set up on the server.'
}

async function errorOf(response: Response): Promise<{ code: string | null; message: string }> {
  let code: string | null = null
  let message = ''
  try {
    const data = (await response.json()) as { code?: unknown; message?: unknown; error?: unknown; errors?: { message?: unknown }[] }
    if (typeof data.code === 'string') code = data.code
    const first = data.errors?.[0]?.message
    message =
      typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
          ? data.error
          : typeof first === 'string'
            ? first
            : ''
  } catch {
    // Not JSON: fall back to the status.
  }
  return { code, message: message || fallbackMessage(response.status) }
}

function fallbackMessage(status: number): string {
  if (status === 401 || status === 403) return 'You do not have access to use the assistant on this document.'
  if (status === 404) return 'The assistant endpoint was not found. Check the plugin `ai` option.'
  return `The assistant request failed (HTTP ${status}).`
}

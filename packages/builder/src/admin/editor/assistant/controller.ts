'use client'

// The assistant's state and its one network call. It lives in the runtime (not in a component),
// so a reply keeps streaming while the user looks at another inspector tab.
//
// Operations from the server are applied as the user's own edits: they enter the undo history,
// grouped by turn, so one Ctrl+Z reverts a whole assistant turn. The layout field sync and
// Payload's autosave persist them. The assistant never calls a save endpoint.

import { clientIdentity } from '../../../ai/config'
import type { AiChatRequest, AiClientConfig, AiMessage, AiStreamEvent } from '../../../ai/types'
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
  | { kind: 'info'; message: string }

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
   * The server has no API key or config. Set at start from the client config (`ai.ready` /
   * `setupProblem`, read when the server started), or when a request answers `no_api_key`. The
   * panel shows the setup state until the user checks again: then the next send asks the server
   * (Anthropic `ant auth login` credentials cannot be seen at startup). Holds the server's
   * message, for the developer details.
   */
  setup: string | null
}

export type AssistantController = ReturnType<typeof createAssistant>

/** How long blocks changed by the assistant stay highlighted on the canvas. */
export const FLASH_MS = 2500

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
    setup: initialSetup(ai),
  })
  let collection = ''
  let docId: string | number | null = null
  let abort: AbortController | null = null
  /** `${provider}:${model}` of the server. A chat written by another one starts over. */
  const identity = ai ? clientIdentity(ai) : 'anthropic:unknown'
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

  /** The tool call that operations belong to: the last one of this turn. */
  const lastCallId = (): string | null => {
    const { live, history } = state.get()
    const fromLive = live?.parts.findLast((p) => p.kind === 'tool')
    if (fromLive?.kind === 'tool') return fromLive.callId
    return toolUseIds(history.messages.slice(live?.turnStart ?? 0)).at(-1) ?? null
  }

  const applyOperations = (turnId: string, ops: Operation[]) => {
    const { store } = runtime
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
      const callId = lastCallId()
      const what = ops.length === 1 ? 'The change' : `${errors.length} of ${ops.length} changes`
      const note = `${what} did not apply, because the page changed meanwhile (${errors[0]}).`
      const { history } = state.get()
      if (callId && history.tools[callId]) {
        patch({ history: { ...history, tools: { ...history.tools, [callId]: { ...history.tools[callId], note } } } })
      } else {
        patch({ notice: { kind: 'error', message: note } })
      }
    }
    flash(changedIds(applied))
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
          [event.callId]: { name: event.name, status: event.status, summary: event.summary, note: history.tools[event.callId]?.note },
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
        applyOperations(event.turnId, event.ops)
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
        if (event.code === 'aborted') finish({ kind: 'info', message: 'Stopped.' })
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
        // Stopped before any reply, or no key: give the prompt back to edit.
        if (!draft.trim()) draft = text
        notice = null
      } else {
        failed = text
        notice ??= { kind: 'error', message: 'The assistant sent no reply.' }
      }
    }
    const tools = { ...history.tools }
    for (const id of toolUseIds(messages.slice(live.turnStart))) {
      const tool = tools[id]
      if (tool?.status === 'running') tools[id] = { ...tool, status: 'error', note: tool.note ?? 'Stopped before it finished.' }
    }
    // Chips of the live reply that never reached the history (stopped mid-call).
    for (const part of live.parts) {
      const tool = part.kind === 'tool' ? tools[part.callId] : undefined
      if (part.kind === 'tool' && tool?.status === 'running') tools[part.callId] = { ...tool, status: 'error' }
    }
    state.set({ ...state.get(), history: { messages, tools }, live: null, streaming: false, notice, failed, draft, setup })
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
      if (controller.signal.aborted) finish({ kind: 'info', message: 'Stopped.' })
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
      collection = nextCollection
      docId = known ? id : null
      const stored = key ? loadHistory(storage(), key) : EMPTY_HISTORY
      const matches = historyMatches(stored, identity)
      state.set({
        key,
        history: matches ? stored : emptyHistory(),
        streaming: false,
        live: null,
        notice: matches ? null : { kind: 'info', message: `New chat: the assistant now uses ${ai?.providerLabel ?? 'another provider'} (${ai?.model ?? 'another model'}).` },
        failed: null,
        draft: '',
        setup: state.get().setup,
      })
    },
    newChat() {
      abort?.abort()
      const { key, draft } = state.get()
      state.set({ key, history: emptyHistory(), streaming: false, live: null, notice: null, failed: null, draft, setup: state.get().setup })
      save()
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

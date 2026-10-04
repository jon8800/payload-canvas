// Assistant chat history: the exact Anthropic messages per document, kept in local storage and
// sent back on every request. Pure functions, so they are unit-tested.

import type { AiMessage } from '../../../ai/types'

export type ToolStatus = 'running' | 'done' | 'error'

/** What the panel shows for one tool call. `note` holds a local problem (an operation that did not apply). */
export type ToolInfo = { name: string; status: ToolStatus; summary: string; note?: string }

export type ChatHistory = {
  messages: AiMessage[]
  /** Tool chips by tool call id. The summaries come from `tool` events, not from the messages. */
  tools: Record<string, ToolInfo>
}

export type ContentBlock = { type: string; [key: string]: unknown }

export type TranscriptPart = { kind: 'text'; text: string } | { kind: 'tool'; callId: string; name: string }

export type TranscriptItem =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'assistant'; key: string; parts: TranscriptPart[] }

export const EMPTY_HISTORY: ChatHistory = { messages: [], tools: {} }

/** About 400 KB of UTF-16 per document. Local storage is about 5 MB for the whole admin. */
export const MAX_HISTORY_CHARS = 200_000
/** Documents with a stored chat. The least recently used ones are dropped. */
export const MAX_STORED_CHATS = 20

const PREFIX = 'payload-builder:ai:'
const INDEX_KEY = `${PREFIX}index`

export function historyKey(collection: string, id: string | number): string {
  return `${PREFIX}${collection}:${String(id)}`
}

/** Message content as blocks. A string is one text block. */
export function blocksOf(content: unknown): ContentBlock[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : []
  if (!Array.isArray(content)) return []
  return content.filter((b): b is ContentBlock => Boolean(b) && typeof b === 'object' && typeof b.type === 'string')
}

/**
 * A user message typed by the person. Not the hidden context message the server adds after it,
 * and not a message that carries tool results (both have `kind`).
 */
export function isUserTurn(message: AiMessage): boolean {
  if (message.role !== 'user' || message.kind) return false
  const blocks = blocksOf(message.content)
  return blocks.some((b) => b.type === 'text') && !blocks.some((b) => b.type === 'tool_result')
}

function textOf(blocks: ContentBlock[]): string {
  return blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n\n')
}

/**
 * Drops the oldest whole turns until the history fits `maxChars` of JSON. A turn starts at a
 * typed user message and holds everything after it (the hidden context message, assistant and
 * tool_result messages), so a tool_use never loses its tool_result. The last turn always stays. Tool chips of dropped turns go too.
 */
export function capHistory(history: ChatHistory, maxChars = MAX_HISTORY_CHARS): ChatHistory {
  const { messages } = history
  const starts = messages.flatMap((m, i) => (isUserTurn(m) ? [i] : []))
  let from = starts[0] ?? 0
  let size = JSON.stringify(messages.slice(from)).length
  for (let t = 1; t < starts.length && size > maxChars; t++) {
    from = starts[t]
    size = JSON.stringify(messages.slice(from)).length
  }
  if (from === 0) return history
  const kept = messages.slice(from)
  return { messages: kept, tools: pickTools(kept, history.tools) }
}

/** Ids of the tool_use blocks in assistant messages, in order. */
export function toolUseIds(messages: AiMessage[]): string[] {
  return messages.flatMap((m) =>
    m.role === 'assistant'
      ? blocksOf(m.content).flatMap((b) => (b.type === 'tool_use' && typeof b.id === 'string' ? [b.id] : []))
      : [],
  )
}

function pickTools(messages: AiMessage[], tools: Record<string, ToolInfo>): Record<string, ToolInfo> {
  const result: Record<string, ToolInfo> = {}
  for (const id of toolUseIds(messages)) if (tools[id]) result[id] = tools[id]
  return result
}

const STOPPED_RESULT = 'The user stopped the response before this tool finished.'

/**
 * Makes the history valid to send again after a turn ended early (stop, error, dropped stream):
 * - a tool_use without a tool_result gets an error tool_result;
 * - text the user saw stream in, but that no `message` event confirmed, is kept as assistant text;
 * - a history that ends with tool results gets a short assistant note, so roles keep alternating.
 * A typed user message with no answer at all is left as is: the caller decides (retry or remove).
 */
export function closeTurn(messages: AiMessage[], partialText: string): AiMessage[] {
  const out = [...messages]
  const last = out.at(-1)
  if (last?.role === 'assistant') {
    const open = blocksOf(last.content).filter((b) => b.type === 'tool_use' && typeof b.id === 'string')
    if (open.length > 0) {
      out.push({
        role: 'user',
        content: open.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: STOPPED_RESULT, is_error: true })),
      })
    }
  }
  const end = out.at(-1)
  const text = partialText.trim()
  if (end?.role === 'user' && (text || !isUserTurn(end))) {
    out.push({ role: 'assistant', content: [{ type: 'text', text: text || '(Stopped.)' }] })
  }
  return out
}

/** Turns the history into what the panel shows: user text, assistant text and tool chips. Thinking is hidden. */
export function transcript(messages: AiMessage[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  messages.forEach((message, index) => {
    const blocks = blocksOf(message.content)
    if (isUserTurn(message)) {
      items.push({ kind: 'user', key: `m${index}`, text: textOf(blocks) })
      return
    }
    // Tool results and the hidden editor context belong to the turn but are not shown.
    if (message.role !== 'assistant' || message.kind) return
    const parts: TranscriptPart[] = []
    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        parts.push({ kind: 'text', text: block.text })
      } else if (block.type === 'tool_use' && typeof block.id === 'string') {
        parts.push({ kind: 'tool', callId: block.id, name: typeof block.name === 'string' ? block.name : 'tool' })
      }
    }
    const prev = items.at(-1)
    if (prev?.kind === 'assistant') prev.parts.push(...parts)
    else items.push({ kind: 'assistant', key: `m${index}`, parts })
  })
  return items
}

/** "insert_section" -> "Insert section". Used when a chip has no summary. */
export function humanizeTool(name: string): string {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Tool'
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function isHistory(value: unknown): value is ChatHistory {
  if (!value || typeof value !== 'object') return false
  const v = value as ChatHistory
  return Array.isArray(v.messages) && Boolean(v.tools) && typeof v.tools === 'object'
}

export function loadHistory(storage: StorageLike | null, key: string): ChatHistory {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) ?? 'null')
    return isHistory(value) ? value : EMPTY_HISTORY
  } catch {
    return EMPTY_HISTORY
  }
}

/** Saves one document's chat (capped) and drops the least recently used chats past MAX_STORED_CHATS. */
export function saveHistory(storage: StorageLike | null, key: string, history: ChatHistory): void {
  if (!storage) return
  try {
    let index: string[] = []
    try {
      const value: unknown = JSON.parse(storage.getItem(INDEX_KEY) ?? '[]')
      if (Array.isArray(value)) index = value.filter((k): k is string => typeof k === 'string')
    } catch {
      // A broken index starts over.
    }
    index = index.filter((k) => k !== key)
    if (history.messages.length === 0) {
      storage.removeItem(key)
    } else {
      storage.setItem(key, JSON.stringify(capHistory(history)))
      index.push(key)
    }
    for (const old of index.splice(0, Math.max(0, index.length - MAX_STORED_CHATS))) storage.removeItem(old)
    storage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // Storage full or blocked: the chat lasts for this session only.
  }
}

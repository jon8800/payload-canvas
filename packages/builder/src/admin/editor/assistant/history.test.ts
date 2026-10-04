import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AiMessage } from '../../../ai/types'
import {
  capHistory,
  closeTurn,
  historyKey,
  historyMatches,
  humanizeTool,
  isUserTurn,
  loadHistory,
  MAX_STORED_CHATS,
  saveHistory,
  transcript,
  type ChatHistory,
} from './history'

const user = (text: string): AiMessage => ({ role: 'user', content: text })
const context = (): AiMessage => ({ role: 'user', kind: 'context', content: [{ type: 'text', text: '{"layout":{}}' }] })
const toolUse = (id: string, text = ''): AiMessage => ({
  role: 'assistant',
  content: [
    { type: 'thinking', thinking: 'hmm', signature: 's' },
    ...(text ? [{ type: 'text', text }] : []),
    { type: 'tool_use', id, name: 'insert_section', input: {} },
  ],
})
const toolResult = (id: string): AiMessage => ({
  role: 'user',
  kind: 'tool_results',
  content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }],
})
const reply = (text: string): AiMessage => ({ role: 'assistant', content: [{ type: 'text', text }] })

/** One full turn with a tool call, padded to a known size. */
function turn(n: number, pad = 0): AiMessage[] {
  return [user(`prompt ${n} ${'x'.repeat(pad)}`), context(), toolUse(`call${n}`), toolResult(`call${n}`), reply(`done ${n}`)]
}

test('isUserTurn: typed messages only, not the context or tool results', () => {
  assert.equal(isUserTurn(user('hi')), true)
  assert.equal(isUserTurn(context()), false)
  assert.equal(isUserTurn(toolResult('a')), false)
  assert.equal(isUserTurn(reply('a')), false)
})

test('capHistory drops whole oldest turns and keeps tool_use / tool_result pairs', () => {
  const messages = [...turn(1, 400), ...turn(2, 400), ...turn(3, 400)]
  const tools = {
    call1: { name: 'insert_section', status: 'done' as const, summary: 'Inserted 1' },
    call2: { name: 'insert_section', status: 'done' as const, summary: 'Inserted 2' },
    call3: { name: 'insert_section', status: 'done' as const, summary: 'Inserted 3' },
  }
  const full = JSON.stringify(messages).length
  const capped = capHistory({ messages, tools }, full - 100)
  assert.deepEqual(capped.messages, [...turn(2, 400), ...turn(3, 400)])
  assert.deepEqual(Object.keys(capped.tools), ['call2', 'call3'])
  // Every tool_use still has its tool_result right after it, and the history starts with the user.
  capped.messages.forEach((m, i) => {
    if (m.role !== 'assistant') return
    const uses = (m.content as { type: string; id?: string }[]).filter((b) => b.type === 'tool_use')
    for (const use of uses) {
      const next = capped.messages[i + 1]?.content as { type: string; tool_use_id?: string }[]
      assert.ok(next.some((b) => b.type === 'tool_result' && b.tool_use_id === use.id))
    }
  })
  assert.ok(isUserTurn(capped.messages[0]))
  // The context message stays with its user message.
  assert.equal(capped.messages[1].kind, 'context')
})

test('capHistory keeps the last turn even when it alone is too big, and leaves small histories alone', () => {
  const messages = [...turn(1), ...turn(2, 5000)]
  assert.deepEqual(capHistory({ messages, tools: {} }, 100).messages, turn(2, 5000))
  const small: ChatHistory = { messages: turn(1), tools: {} }
  assert.equal(capHistory(small, 1_000_000), small)
})

test('closeTurn closes an open tool_use and keeps streamed text', () => {
  const closed = closeTurn([user('go'), context(), toolUse('c1')], '')
  assert.equal(closed.length, 5)
  assert.deepEqual((closed[3].content as unknown[])[0], {
    type: 'tool_result',
    tool_use_id: 'c1',
    content: 'The user stopped the response before this tool finished.',
    is_error: true,
  })
  assert.equal(closed[4].role, 'assistant')

  // Refusal: text streamed, no assistant message. The text becomes the assistant reply.
  assert.deepEqual(closeTurn([user('go'), context()], 'I can not help with that.').at(-1), reply('I can not help with that.'))

  // A finished turn stays as it is.
  const finished = turn(1)
  assert.deepEqual(closeTurn(finished, ''), finished)
})

test('transcript shows user text, assistant text and tool chips; hides thinking, context and tool results', () => {
  const items = transcript([...turn(1), user('second'), context(), toolUse('c2', 'On it.'), toolResult('c2')])
  assert.deepEqual(items, [
    { kind: 'user', key: 'm0', text: 'prompt 1 ' },
    {
      kind: 'assistant',
      key: 'm2',
      parts: [
        { kind: 'tool', callId: 'call1', name: 'insert_section' },
        { kind: 'text', text: 'done 1' },
      ],
    },
    { kind: 'user', key: 'm5', text: 'second' },
    {
      kind: 'assistant',
      key: 'm7',
      parts: [
        { kind: 'text', text: 'On it.' },
        { kind: 'tool', callId: 'c2', name: 'insert_section' },
      ],
    },
  ])
})

test('humanizeTool', () => {
  assert.equal(humanizeTool('insert_section'), 'Insert section')
  assert.equal(humanizeTool('updateBlocks'), 'Update blocks')
  assert.equal(humanizeTool(''), 'Tool')
})

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

test('saveHistory / loadHistory: round trip, removal, least recently used pruning, bad data', () => {
  const storage = memoryStorage()
  const key = historyKey('pages', 1)
  const history: ChatHistory = { messages: turn(1), tools: {} }
  saveHistory(storage, key, history)
  assert.deepEqual(loadHistory(storage, key), history)
  saveHistory(storage, key, { messages: [], tools: {} })
  assert.equal(storage.getItem(key), null)

  for (let i = 0; i < MAX_STORED_CHATS + 3; i++) saveHistory(storage, historyKey('pages', i), history)
  assert.equal(storage.getItem(historyKey('pages', 0)), null)
  assert.equal(storage.getItem(historyKey('pages', 2)), null)
  assert.ok(storage.getItem(historyKey('pages', 3)))
  assert.ok(storage.getItem(historyKey('pages', MAX_STORED_CHATS + 2)))

  storage.setItem(key, '{broken')
  assert.deepEqual(loadHistory(storage, key), { messages: [], tools: {} })
  assert.deepEqual(loadHistory(null, key), { messages: [], tools: {} })
})

test('historyMatches: a provider or model switch starts a new chat', () => {
  const messages = [user('Hi')]
  assert.equal(historyMatches({ messages, tools: {}, provider: 'openrouter:openai/gpt-6-luna' }, 'openrouter:openai/gpt-6-luna'), true)
  assert.equal(historyMatches({ messages, tools: {}, provider: 'openrouter:openai/gpt-6-luna' }, 'openrouter:google/gemini-3.8-flash'), false)
  assert.equal(historyMatches({ messages, tools: {}, provider: 'anthropic:claude-opus-5-5' }, 'openrouter:openai/gpt-6-luna'), false)
  // Chats saved before providers existed were Anthropic.
  assert.equal(historyMatches({ messages, tools: {} }, 'anthropic:claude-opus-5-5'), true)
  assert.equal(historyMatches({ messages, tools: {} }, 'openrouter:openai/gpt-6-luna'), false)
  assert.equal(historyMatches({ messages: [], tools: {} }, 'cloudflare:openai/gpt-5.2'), true)
})

test('capHistory keeps the provider', () => {
  const big = 'x'.repeat(100)
  const history: ChatHistory = { messages: [user(big), context(), user(big)], tools: {}, provider: 'openrouter:m' }
  const capped = capHistory(history, 150)
  assert.equal(capped.messages.length, 1)
  assert.equal(capped.provider, 'openrouter:m')
})

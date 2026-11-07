import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { plainToRichText } from '../../core/bindings'
import type { Block } from '../../core/types'
import { defaultBlocks } from '../defaults'
import { builtinBlocks, faqItems, faqJsonLd } from '.'

const blocks = [...defaultBlocks(), ...builtinBlocks()]

const disclosure = (id: string, question: Block[], answer: Block[], extra: Partial<Block> = {}): Block => ({
  id,
  type: 'disclosure',
  slots: { summary: question, content: answer },
  ...extra,
})
const text = (id: string, value: string): Block => ({ id, type: 'text', props: { text: value } })
const accordion = (items: Block[], props: Record<string, unknown> = {}): Block => ({ id: 'acc', type: 'accordion', props, slots: { items } })
const layout = (...list: Block[]) => ({ version: 1, blocks: list })

describe('faqItems', () => {
  it('reads the summary and content text of each disclosure in an accordion', () => {
    const items = faqItems(
      layout({
        id: 's',
        type: 'stack',
        slots: {
          children: [
            accordion([
              disclosure('d1', [{ id: 'h', type: 'heading', props: { text: 'How do I book?' } }, { id: 'i', type: 'icon', props: { name: 'plus' } }], [
                text('t1', 'Send a message.'),
                { id: 'r', type: 'richText', props: { content: plainToRichText('We reply  within\nan hour.') } },
              ]),
              disclosure('d2', [text('q2', 'Hidden?')], [text('a2', 'Yes.')], { hidden: true }),
              disclosure('d3', [text('q3', 'No answer')], []),
            ]),
          ],
        },
      }),
      blocks,
    )
    assert.deepEqual(items, [{ question: 'How do I book?', answer: 'Send a message. We reply within an hour.' }])
  })

  it('skips accordions with faqSchema off and disclosures outside accordions', () => {
    const one = disclosure('d', [text('q', 'Q')], [text('a', 'A')])
    assert.deepEqual(faqItems(layout(accordion([one], { faqSchema: false }), one), blocks), [])
  })

  it('expands repeat rows and collection list items, with their bindings', () => {
    const item = disclosure('d', [{ id: 'q', type: 'text', bindings: { text: 'question' } }], [{ id: 'a', type: 'field', props: { path: 'answer' } }])
    const repeat: Block = {
      id: 'rep',
      type: 'repeat',
      props: { path: 'faqs', $items: [{ question: 'One?', answer: 'Yes.' }, { question: 'Two?', answer: plainToRichText('No.') }] },
      slots: { item: [item] },
    }
    const list: Block = {
      id: 'list',
      type: 'collectionList',
      props: { collection: 'faqs', $items: [{ id: 1, question: 'Three?', answer: 'Maybe.' }] },
      slots: { item: [item] },
    }
    assert.deepEqual(faqItems(layout(accordion([repeat, list])), blocks), [
      { question: 'One?', answer: 'Yes.' },
      { question: 'Two?', answer: 'No.' },
      { question: 'Three?', answer: 'Maybe.' },
    ])
  })

  it('reads nothing from an empty or broken layout', () => {
    assert.deepEqual(faqItems(null), [])
    assert.deepEqual(faqItems({ version: 1, blocks: 'nope' }), [])
  })
})

describe('faqJsonLd', () => {
  it('builds FAQPage JSON-LD, or null without items', () => {
    assert.equal(faqJsonLd([]), null)
    assert.deepEqual(faqJsonLd([{ question: 'Q?', answer: 'A.' }]), {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } }],
    })
  })
})

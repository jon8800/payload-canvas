import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Block } from '../../core/types'
import { blockPreview } from './names'

const text = (value: string) => ({ type: 'text', text: value })
const paragraph = (...children: unknown[]) => ({ type: 'paragraph', children })

test('a rich text row shows its first paragraph with the link text in it', () => {
  const block: Block = {
    id: 'r',
    type: 'richText',
    props: {
      content: {
        root: {
          type: 'root',
          children: [paragraph(), paragraph(text('Rich paragraph with a '), { type: 'link', children: [text('link')] }, text(' inside.'))],
        },
      },
    },
  }
  assert.equal(blockPreview(block), 'Rich paragraph with a link inside.')
})

test('a container takes its name from text before menus and buttons', () => {
  const hero: Block = {
    id: 'h',
    type: 'stack',
    slots: {
      children: [
        { id: 'm', type: 'menu', props: { title: 'Main' } },
        { id: 't', type: 'text', props: { text: 'Northwind Studio builds websites' } },
      ],
    },
  }
  assert.equal(blockPreview(hero), 'Northwind Studio builds websites')
  const buttons: Block = { id: 'b', type: 'stack', slots: { children: [{ id: 'x', type: 'button', props: { label: 'Start a project' } }] } }
  assert.equal(blockPreview(buttons), 'Start a project')
})

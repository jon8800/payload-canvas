import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { StyleTokens } from '../core/types'
import { systemPrompt } from './prompt'

const tokens: StyleTokens = {
  colors: [],
  spacing: ['4'],
  fontSizes: [],
  fontWeights: [],
  fonts: [],
  leading: [],
  tracking: [],
  radius: [],
  shadows: [],
  breakpoints: [],
  containers: [],
  classList: [],
  variables: [
    { name: 'brand', type: 'color', property: '--color-brand', value: '#c2410c', darkValue: '#fb923c' },
    { name: 'gutter', type: 'size', property: '--spacing-gutter', value: '2.5rem' },
  ],
}

describe('AI system prompt', () => {
  it('lists the design variables with values and how to use them', () => {
    const text = systemPrompt({ blocks: [], sections: [], tokens, bindings: false })
    assert.match(text, /Design variables[^\n]*brand \(color: #c2410c, dark #fb923c\), gutter \(size: 2\.5rem\)/)
    assert.match(text, /bg-<name>/)
    assert.doesNotMatch(systemPrompt({ blocks: [], sections: [], tokens: { ...tokens, variables: [] }, bindings: false }), /Design variables/)
  })
})

'use client'

// Renders the Markdown tree from markdown.ts as React elements. Text is always a React text
// node, so model output is escaped. No `dangerouslySetInnerHTML`.

import { createElement, Fragment, type ReactNode } from 'react'

import { parseMarkdown, type Inline, type MdBlock } from './markdown'

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return createElement(Fragment, { key: i }, node.text)
      case 'break':
        return createElement('br', { key: i })
      case 'code':
        return createElement('code', { key: i }, node.text)
      case 'strong':
        return createElement('strong', { key: i }, renderInline(node.children))
      case 'em':
        return createElement('em', { key: i }, renderInline(node.children))
      case 'link':
        return createElement(
          'a',
          { key: i, href: node.href, target: '_blank', rel: 'noopener noreferrer' },
          renderInline(node.children),
        )
    }
  })
}

function renderBlock(block: MdBlock, i: number): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return createElement('p', { key: i }, renderInline(block.children))
    case 'heading':
      return createElement('p', { key: i, className: 'builder-assistant__md-heading' }, renderInline(block.children))
    case 'code':
      return createElement('pre', { key: i }, createElement('code', null, block.text))
    case 'list':
      return createElement(
        block.ordered ? 'ol' : 'ul',
        { key: i, start: block.ordered && block.start !== 1 ? block.start : undefined },
        block.items.map((item, j) => createElement('li', { key: j }, renderInline(item))),
      )
  }
}

export function Markdown({ text }: { text: string }) {
  return createElement('div', { className: 'builder-assistant__md' }, parseMarkdown(text).map(renderBlock))
}

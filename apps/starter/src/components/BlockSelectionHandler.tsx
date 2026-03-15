'use client'

import { useEffect } from 'react'

export function BlockSelectionHandler() {
  useEffect(() => {
    // Only activate when loaded inside an iframe (customiser preview)
    if (window.self === window.top) return

    let currentHighlight: HTMLElement | null = null

    const handleMouseOver = (e: MouseEvent) => {
      const block = (e.target as HTMLElement).closest(
        '[data-block-path]',
      ) as HTMLElement | null
      if (currentHighlight && currentHighlight !== block) {
        currentHighlight.removeAttribute('data-block-highlight')
      }
      if (block) {
        block.setAttribute('data-block-highlight', 'hover')
        currentHighlight = block
      }
    }

    const handleMouseOut = (e: MouseEvent) => {
      const block = (e.target as HTMLElement).closest(
        '[data-block-path]',
      ) as HTMLElement | null
      if (block) {
        block.removeAttribute('data-block-highlight')
      }
      if (currentHighlight === block) {
        currentHighlight = null
      }
    }

    const handleClick = (e: MouseEvent) => {
      const block = (e.target as HTMLElement).closest(
        '[data-block-path]',
      ) as HTMLElement | null
      if (block) {
        e.preventDefault()
        e.stopPropagation()
        const blockPath = block.getAttribute('data-block-path')
        window.parent.postMessage(
          {
            type: 'customiser-block-selected',
            blockPath,
          },
          '*',
        )
      }
    }

    document.addEventListener('mouseover', handleMouseOver)
    document.addEventListener('mouseout', handleMouseOut)
    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('mouseover', handleMouseOver)
      document.removeEventListener('mouseout', handleMouseOut)
      document.removeEventListener('click', handleClick, true)
    }
  }, [])

  return null
}

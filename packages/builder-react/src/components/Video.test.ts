import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../render/types'
import { Video } from './Video'
import { isPlayableVideoUrl } from './videoUrl'

const render = (url: string, mode: 'site' | 'canvas') =>
  renderToStaticMarkup(
    createElement(Video, {
      block: { id: 'v', type: 'video' },
      props: { source: 'url', url },
      className: 'w-full',
      slots: {},
      attributes: mode === 'canvas' ? { 'data-block-id': 'v' } : {},
      slotAttributes: {},
      mode,
    } satisfies BlockComponentProps),
  )

describe('isPlayableVideoUrl', () => {
  test('accepts YouTube, Vimeo, files and relative paths', () => {
    assert.equal(isPlayableVideoUrl('https://www.youtube.com/watch?v=aqz-KE-bpKQ'), true)
    assert.equal(isPlayableVideoUrl('https://vimeo.com/76979871'), true)
    assert.equal(isPlayableVideoUrl('https://cdn.example.com/clip.mp4'), true)
    assert.equal(isPlayableVideoUrl('/media/clip.mp4'), true)
  })

  test('rejects text, unsafe links and platform pages without a video', () => {
    assert.equal(isPlayableVideoUrl('not a url'), false)
    assert.equal(isPlayableVideoUrl('javascript:alert(1)'), false)
    assert.equal(isPlayableVideoUrl('https://www.youtube.com/watch?v=short'), false)
    assert.equal(isPlayableVideoUrl('https://www.youtube.com/@channel'), false)
    assert.equal(isPlayableVideoUrl('https://vimeo.com/channels/staffpicks'), false)
  })
})

describe('Video with a URL that cannot play', () => {
  test('the canvas says so, the site renders nothing', () => {
    const canvas = render('not a url', 'canvas')
    assert.match(canvas, /^<div data-block-id="v" data-builder-placeholder="" class="w-full" style="[^"]*">Video<span[^>]*>This link cannot play\./)
    assert.equal(render('not a url', 'site'), '')
  })

  test('an empty URL keeps the plain placeholder', () => {
    assert.match(render('', 'canvas'), /data-builder-placeholder[^>]*>Video<\/div>$/)
  })
})

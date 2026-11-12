import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../render/types'
import { AutoplayVideo } from './AutoplayVideo'
import { focalStyle } from './Image'
import { Video } from './Video'
import { decorativeAttributes, startsPlaying, videoPreload, videoSettingsOf } from './videoPlayback'
import { isPlayableVideoUrl } from './videoUrl'

const render = (url: string, mode: 'site' | 'canvas') =>
  renderToStaticMarkup(
    createElement(Video, {
      block: { id: 'v', type: 'video' },
      props: { source: 'url', url },
      className: 'w-full',
      slots: {},
      attributes: mode === 'canvas' ? { 'data-block-id': 'v' } : {},
      partAttributes: {},
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

const fileRender = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site') =>
  renderToStaticMarkup(
    createElement(Video, {
      block: { id: 'v', type: 'video' },
      props: { video: { id: 1, url: '/media/clip.mp4' }, ...props },
      className: 'size-full object-cover',
      slots: {},
      attributes: mode === 'canvas' ? { 'data-block-id': 'v' } : {},
      partAttributes: {},
      mode,
    } satisfies BlockComponentProps),
  )

const poster = (focalX?: number, focalY?: number) => ({ id: 2, url: '/media/poster.jpg', ...(focalX === undefined ? {} : { focalX, focalY }) })

describe('video settings', () => {
  test('defaults: controls on, everything else off (stored videos keep their look)', () => {
    assert.deepEqual(videoSettingsOf({}), { autoplay: false, loop: false, muted: false, controls: true, decorative: false, priority: false })
    assert.equal(videoSettingsOf({ controls: false }).controls, false)
  })

  test('a decorative video has no controls, even with "Show controls" on', () => {
    assert.equal(videoSettingsOf({ decorative: true, controls: true }).controls, false)
    assert.deepEqual(decorativeAttributes(true), { 'aria-hidden': 'true', tabIndex: -1 })
    assert.deepEqual(decorativeAttributes(false), {})
  })

  test('preload: the whole video only when it loads first', () => {
    assert.equal(videoPreload(true), 'auto')
    assert.equal(videoPreload(false), 'metadata')
  })
})

describe('startsPlaying (reduced motion and the canvas)', () => {
  test('plays only with autoplay, off the canvas, without reduced motion', () => {
    assert.equal(startsPlaying({ autoplay: true, canvas: false, reducedMotion: false }), true)
    assert.equal(startsPlaying({ autoplay: true, canvas: false, reducedMotion: true }), false)
    assert.equal(startsPlaying({ autoplay: true, canvas: true, reducedMotion: false }), false)
    assert.equal(startsPlaying({ autoplay: false, canvas: false, reducedMotion: false }), false)
  })
})

describe('focalStyle (the poster crop)', () => {
  test('a moved focal point sets object-position; Payload\'s 50/50 default and no focal point leave it to the classes', () => {
    assert.deepEqual(focalStyle(poster(30, 70)), { objectPosition: '30% 70%' })
    assert.equal(focalStyle(poster(50, 50)), undefined)
    assert.equal(focalStyle(poster()), undefined)
    assert.equal(focalStyle(undefined), undefined)
  })
})

describe('Video with a file', () => {
  test('a plain video: no autoplay attribute, metadata preload, controls', () => {
    const html = fileRender({})
    assert.match(html, /^<video class="size-full object-cover" src="\/media\/clip.mp4" controls="" playsInline="" preload="metadata"><\/video>$/)
  })

  test('the poster\'s focal point sets object-position on the video', () => {
    assert.match(fileRender({ poster: poster(30, 70) }), /poster="\/media\/poster.jpg"[^>]*style="object-position:30% 70%"/)
    assert.doesNotMatch(fileRender({ poster: poster(50, 50) }), /object-position/)
  })

  test('decorative: hidden from screen readers, no controls, no tab stop', () => {
    const html = fileRender({ decorative: true, controls: true })
    assert.match(html, /aria-hidden="true"/)
    assert.match(html, /tabindex="-1"|tabIndex="-1"/i)
    assert.doesNotMatch(html, /controls/)
  })

  test('priority: preload="auto" and the poster preloads with high fetch priority', () => {
    const html = fileRender({ priority: true, poster: poster() })
    assert.match(html, /preload="auto"/)
    assert.match(html, /<link rel="preload" href="\/media\/poster.jpg" as="image" fetchPriority="high"\/>/)
    assert.doesNotMatch(fileRender({ poster: poster() }), /<link/)
  })

  test('autoplay on the canvas: paused on the poster, no autoplay attribute', () => {
    const html = fileRender({ autoplay: true, muted: true, loop: true, poster: poster() }, 'canvas')
    assert.match(html, /^<video data-block-id="v"[^>]*poster="\/media\/poster.jpg"/)
    assert.doesNotMatch(html, /autoplay/i)
  })
})

describe('AutoplayVideo', () => {
  test('the server HTML has no autoplay attribute: the script starts it after mount', () => {
    const html = renderToStaticMarkup(
      createElement(AutoplayVideo, {
        attributes: { 'aria-hidden': 'true', tabIndex: -1 },
        className: 'size-full',
        src: '/media/clip.mp4',
        poster: '/media/poster.jpg',
        loop: true,
        muted: true,
        controls: false,
        preload: 'auto',
        style: { objectPosition: '30% 70%' },
      }),
    )
    assert.match(html, /^<video aria-hidden="true"[^>]*src="\/media\/clip.mp4" poster="\/media\/poster.jpg" loop="" muted="" playsInline="" preload="auto" style="object-position:30% 70%"><\/video>$/)
    assert.doesNotMatch(html, /autoplay/i)
  })
})

describe('Video with a YouTube link', () => {
  test('autoplay reaches the embed on the site, not on the canvas; decorative hides it', () => {
    const url = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
    const props = { source: 'url', url, autoplay: true, muted: true, decorative: true }
    const site = fileRender(props)
    assert.match(site, /<iframe aria-hidden="true" tabindex="-1"[^>]*src="[^"]*autoplay=1/i)
    assert.match(site, /controls=0/)
    assert.doesNotMatch(fileRender(props, 'canvas'), /autoplay=1/)
  })
})

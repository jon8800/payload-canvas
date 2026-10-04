import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FORMATS, formatProblem, isPlayableVideoUrl, parseVideoUrl, videoUrlProblem } from './formats'

describe('videoUrlProblem', () => {
  it('accepts empty values, relative paths, files, YouTube and Vimeo videos', () => {
    for (const ok of [
      '',
      '  ',
      undefined,
      '/media/clip.mp4',
      'https://cdn.example.com/clip.mp4',
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ?t=30',
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      'https://vimeo.com/76979871',
      'https://player.vimeo.com/video/76979871',
    ]) {
      assert.equal(videoUrlProblem(ok), null, String(ok))
    }
  })

  it('explains links that cannot play', () => {
    assert.match(videoUrlProblem('not a url') ?? '', /starts with https:\/\//)
    assert.match(videoUrlProblem('javascript:alert(1)') ?? '', /https:\/\//)
    assert.match(videoUrlProblem('https://www.youtube.com/watch?v=short') ?? '', /YouTube link/)
    assert.match(videoUrlProblem('https://www.youtube.com/@channel') ?? '', /YouTube link/)
    assert.match(videoUrlProblem('https://vimeo.com/channels/staffpicks') ?? '', /Vimeo link/)
  })

  it('agrees with isPlayableVideoUrl', () => {
    for (const url of ['https://youtu.be/aqz-KE-bpKQ', 'https://vimeo.com/76979871', '/a.mp4', 'nope', 'https://youtube.com/@x', 'ftp://x/y.mp4']) {
      assert.equal(isPlayableVideoUrl(url), videoUrlProblem(url) === null, url)
    }
    assert.equal(isPlayableVideoUrl(''), false)
  })
})

describe('parseVideoUrl', () => {
  it('builds embeds and keeps files as they are', () => {
    assert.equal(parseVideoUrl('https://youtu.be/aqz-KE-bpKQ')?.kind, 'youtube')
    assert.deepEqual(parseVideoUrl('https://vimeo.com/76979871'), { kind: 'vimeo', id: '76979871', embedUrl: 'https://player.vimeo.com/video/76979871' })
    assert.deepEqual(parseVideoUrl('/media/clip.mp4'), { kind: 'file', src: '/media/clip.mp4' })
    assert.equal(parseVideoUrl('javascript:alert(1)'), null)
  })
})

describe('format registry', () => {
  it('names videoUrl', () => {
    assert.deepEqual(Object.keys(FORMATS), ['videoUrl'])
  })

  it('runs the named check', () => {
    assert.equal(formatProblem('videoUrl', 'https://youtu.be/aqz-KE-bpKQ'), null)
    assert.match(formatProblem('videoUrl', 'not a url') ?? '', /https:\/\//)
  })

  it('checks nothing for a missing, unknown or inherited format name', () => {
    assert.equal(formatProblem(undefined, 'not a url'), null)
    assert.equal(formatProblem('nope', 'not a url'), null)
    assert.equal(formatProblem('toString', 'not a url'), null)
    assert.equal(formatProblem(42, 'not a url'), null)
  })
})

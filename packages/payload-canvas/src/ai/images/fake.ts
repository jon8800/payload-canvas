// A local image generator as an AiImageAdapter, for tests and demos: it draws a PNG gradient whose
// colors come from the prompt. No network, no cost. Never use it in production.
//
//   import { fakeImageAdapter } from 'payload-canvas/ai/images/fake'
//   ai: { images: fakeImageAdapter() }

import { deflateSync } from 'node:zlib'

import type { AiImageAdapter, AiImageRequest, AiImageResult } from '../types'
import { AiImageError, sizeForRatio } from './shared'

export type FakeImageAdapterOptions = {
  /** The long edge in pixels. Default 640. */
  longEdge?: number
  /** Delay before the result in ms, to see the progress state. Default 0. */
  delayMs?: number
  /** Cost reported per image (USD). Default 0. */
  costPerImage?: number
  /** Tests: fail every call with this error. */
  fail?: AiImageError
  /** Tests: called with every request. */
  onRequest?: (request: AiImageRequest) => void
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

const rgb = (h: number) => [(h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff]

/** Two colors from a string (FNV-1a hash). */
function colorsOf(text: string): [number[], number[]] {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0
  return [rgb(hash), rgb(Math.imul(hash, 0x9e3779b1) >>> 0)]
}

/** A diagonal gradient as an RGB PNG. */
export function gradientPng(width: number, height: number, seed: string): Uint8Array {
  const [from, to] = colorsOf(seed)
  const row = 1 + width * 3
  const raw = new Uint8Array(row * height)
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x / Math.max(1, width - 1) + y / Math.max(1, height - 1)) / 2
      const at = y * row + 1 + x * 3
      for (let c = 0; c < 3; c++) raw[at + c] = Math.round(from[c] + (to[c] - from[c]) * t)
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit, RGB, deflate, no filter, no interlace
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new AiImageError('aborted', 'The request was cancelled.'))
    }, { once: true })
  })

export function fakeImageAdapter(options: FakeImageAdapterOptions = {}): AiImageAdapter {
  const longEdge = options.longEdge ?? 640
  return {
    name: 'fake',
    label: 'Test image model',
    model: 'gradient',
    ready: true,
    setupProblem: null,
    async generate(request): Promise<AiImageResult> {
      options.onRequest?.(request)
      if (options.delayMs) await wait(options.delayMs, request.signal)
      if (request.signal?.aborted) throw new AiImageError('aborted', 'The request was cancelled.')
      if (options.fail) throw options.fail
      const { width, height } = sizeForRatio(request.aspectRatio, longEdge, 8)
      const images = Array.from({ length: Math.max(1, request.n) }, (_, i) => ({
        data: gradientPng(width, height, `${request.prompt}#${i}`),
        mimeType: 'image/png',
        width,
        height,
      }))
      return { images, usage: { cost: (options.costPerImage ?? 0) * images.length } }
    },
  }
}

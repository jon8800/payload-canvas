// The video URL parser lives in `payload-canvas/core` (core/formats.ts), so the editor,
// the save check and the renderer all read a link the same way. This file keeps the local import path.

export { isPlayableVideoUrl, parseVideoUrl, type VideoEmbed, type VideoOptions } from '../../core'

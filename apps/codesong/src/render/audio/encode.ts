/**
 * Rendered audio as a file: 16-bit WAV, written by hand, or MP3 through
 * lamejs, a pure-JavaScript LAME port that touches neither the network nor
 * the file system.
 */

import { Mp3Encoder } from '@breezystack/lamejs'
import type { Stereo } from './render.ts'

/** Samples lamejs encodes per call: one MPEG frame. */
const FRAME = 1152

/** A −1…1 sample as a signed 16-bit one, clipped rather than wrapped. */
const pcm = (x: number): number =>
  Math.max(-32768, Math.min(32767, Math.round(x * 32767)))

/** `from`…`to` of one channel as 16-bit samples. */
function slice(channel: Float32Array, from: number, to: number): Int16Array {
  const out = new Int16Array(to - from)
  for (let i = from; i < to; i++) out[i - from] = pcm(channel[i]!)
  return out
}

/** The song as a 16-bit stereo WAV file. */
export function toWav(audio: Stereo): Uint8Array {
  const frames = audio.left.length
  const bytes = new Uint8Array(44 + frames * 4)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + frames * 4, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 2, true) // channels
  view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * 4, true) // bytes per second
  view.setUint16(32, 4, true) // bytes per frame
  view.setUint16(34, 16, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, frames * 4, true)
  for (let i = 0; i < frames; i++) {
    view.setInt16(44 + i * 4, pcm(audio.left[i]!), true)
    view.setInt16(46 + i * 4, pcm(audio.right[i]!), true)
  }
  return bytes
}

/** The song as a stereo MP3 at `kbps` (192 by default, near-transparent). */
export function toMp3(audio: Stereo, kbps = 192): Uint8Array {
  const encoder = new Mp3Encoder(2, audio.sampleRate, kbps)
  const chunks: Uint8Array[] = []
  for (let at = 0; at < audio.left.length; at += FRAME) {
    const to = Math.min(at + FRAME, audio.left.length)
    chunks.push(
      encoder.encodeBuffer(
        slice(audio.left, at, to),
        slice(audio.right, at, to),
      ),
    )
  }
  chunks.push(encoder.flush())
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

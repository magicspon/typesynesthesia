import { describe, expect, it } from 'vitest'
import { compose, DEFAULT_OPTIONS } from '../src/compose/compose.ts'
import { GENRE_NAMES } from '../src/compose/genre.ts'
import { analyse } from '../src/regions.ts'
import { level, noise, waveOf } from '../src/render/audio/dsp.ts'
import { toMp3, toWav } from '../src/render/audio/encode.ts'
import { renderAudio } from '../src/render/audio/render.ts'
import { realise } from '../src/render/realise.ts'
import { readStructure } from '../src/structure.ts'
import { atlas } from './fixture.ts'

/** The fixture composed in `genre`, short enough to render in a test. */
function piece(genre: (typeof GENRE_NAMES)[number]) {
  const composition = compose(analyse(readStructure(atlas)), {
    ...DEFAULT_OPTIONS,
    genre,
    bars: 16,
  })
  return { composition, tracks: realise(composition) }
}

describe('dsp', () => {
  const env = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.4 }

  it('rises through the attack, settles at the sustain, and ends at the release', () => {
    expect(level(env, 0.05, 1)).toBeCloseTo(0.5)
    expect(level(env, 0.1, 1)).toBeCloseTo(1)
    expect(level(env, 0.9, 1)).toBeCloseTo(0.5)
    // Silent once the release is over; just inside it, nearly so.
    expect(level(env, 1.39, 1)).toBeLessThan(0.01)
    expect(level(env, 1.41, 1)).toBe(0)
  })

  it('reads Tone.js wave names, fat ones included', () => {
    expect(waveOf('fatsawtooth')).toEqual({ wave: 'sawtooth', fat: true })
    expect(waveOf('triangle')).toEqual({ wave: 'triangle', fat: false })
    expect(waveOf('nonsense')).toEqual({ wave: 'sine', fat: false })
  })

  it('makes the same noise from the same seed', () => {
    const a = noise(7)
    const b = noise(7)
    const run = (n: () => number) => Array.from({ length: 5 }, n)
    expect(run(a)).toEqual(run(b))
  })
})

describe('renderAudio', () => {
  it.each(GENRE_NAMES)('%s renders finite, normalised stereo', (genre) => {
    const { composition, tracks } = piece(genre)
    const audio = renderAudio(composition, tracks)
    const beats = composition.sections.reduce((n, s) => n + s.length, 0)
    // At least as long as the music, with a tail for the reverb.
    expect(audio.left.length / audio.sampleRate).toBeGreaterThan(
      (beats * 60) / composition.tempo - 1,
    )
    // Counted, then asserted once: an `expect` per sample takes seconds.
    let peak = 0
    let broken = 0
    for (let i = 0; i < audio.left.length; i++) {
      const l = audio.left[i]!
      const r = audio.right[i]!
      if (!Number.isFinite(l) || !Number.isFinite(r)) broken++
      peak = Math.max(peak, Math.abs(l), Math.abs(r))
    }
    expect(broken).toBe(0)
    expect(peak).toBeGreaterThan(0.8)
    expect(peak).toBeLessThanOrEqual(0.9)
  })

  it('renders the same samples every time', () => {
    const { composition, tracks } = piece('jazz')
    const a = renderAudio(composition, tracks)
    const b = renderAudio(composition, tracks)
    // Bytes, not `toEqual`: a deep compare of a million samples times out.
    const same = (x: Float32Array, y: Float32Array) =>
      Buffer.from(x.buffer).equals(Buffer.from(y.buffer))
    expect(same(a.left, b.left) && same(a.right, b.right)).toBe(true)
  })
})

describe('encode', () => {
  const { composition, tracks } = piece('lofi')
  const audio = renderAudio(composition, tracks)

  it('writes a 16-bit stereo WAV with a correct header', () => {
    const wav = toWav(audio)
    const view = new DataView(wav.buffer)
    const text = (at: number) =>
      String.fromCharCode(...wav.subarray(at, at + 4))
    expect([text(0), text(8), text(12), text(36)]).toEqual([
      'RIFF',
      'WAVE',
      'fmt ',
      'data',
    ])
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(24, true)).toBe(44_100)
    expect(view.getUint32(40, true)).toBe(audio.left.length * 4)
    expect(wav.length).toBe(44 + audio.left.length * 4)
  })

  it('writes an MP3 that starts on a frame sync', () => {
    const mp3 = toMp3(audio)
    // Eleven set bits: the start of an MPEG audio frame.
    expect(mp3[0]).toBe(0xff)
    expect(mp3[1]! & 0xe0).toBe(0xe0)
    // 192 kbps for the song's length, within a frame or two.
    const seconds = audio.left.length / audio.sampleRate
    expect(mp3.length).toBeGreaterThan(((seconds * 192_000) / 8) * 0.9)
  })
})

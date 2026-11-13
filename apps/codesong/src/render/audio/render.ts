/**
 * A realised composition rendered to sound, offline: every note played into
 * one bus by its role's instrument, then through the genre's room. This is
 * what `tsyn song` encodes to MP3 or WAV.
 */

import type { Composition } from '../../model.ts'
import { GENRE_SOUND } from '../../sound/genres.ts'
import { defaults, num } from '../../sound/settings.ts'
import type { RealisedTrack } from '../realise.ts'
import { gain, SAMPLE_RATE } from './dsp.ts'
import { play } from './room.ts'
import { instrument } from './voices.ts'

/** Two channels of samples in −1…1, at `sampleRate`. */
export interface Stereo {
  readonly sampleRate: number
  readonly left: Float32Array
  readonly right: Float32Array
}

/** Peak level after normalising: −1 dBFS, headroom an MP3 encoder needs. */
const PEAK = 0.89
/** Seconds faded out at the very end, so the reverb tail never clicks off. */
const FADE = 0.5

/**
 * Seconds after the last note ends that the song keeps going: the longest
 * release still ringing, then part of the reverb.
 */
function tail(composition: Composition): number {
  const room = GENRE_SOUND[composition.genre]
  const releases = composition.tracks.map((t) =>
    num(defaults(t.role, composition.genre), 'release'),
  )
  return Math.max(0, ...releases) + Math.min(room.reverb.decay, 4)
}

/** Scales the song to `PEAK` and fades its last moments out. */
function master(left: Float32Array, right: Float32Array): void {
  let peak = 0
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!))
  }
  const scale = peak > 0 ? PEAK / peak : 1
  const fade = Math.min(left.length, Math.round(FADE * SAMPLE_RATE))
  for (let i = 0; i < left.length; i++) {
    const end = left.length - i
    const g = end < fade ? scale * (end / fade) : scale
    left[i]! *= g
    right[i]! *= g
  }
}

/**
 * Renders `tracks`, the realised notes of `composition`, to stereo audio.
 * Deterministic: the same composition renders the same samples every time.
 */
export function renderAudio(
  composition: Composition,
  tracks: readonly RealisedTrack[],
): Stereo {
  const secondsPerBeat = 60 / composition.tempo
  // A reduce, not a spread: a long song has more notes than a call has arguments.
  const last = tracks.reduce(
    (end, t) =>
      t.notes.reduce((e, n) => Math.max(e, n.start + n.duration), end),
    0,
  )
  const seconds = last * secondsPerBeat + tail(composition)
  const dry = new Float32Array(Math.ceil(seconds * SAMPLE_RATE))

  for (const track of tracks) {
    const sound = defaults(track.role, composition.genre)
    const voice = instrument(track.role)
    // The site's channel volume, 0 dB unless a genre changes it.
    const level = gain(num(sound, 'volume'))
    for (const note of track.notes) {
      voice(
        {
          at: Math.round(note.start * secondsPerBeat * SAMPLE_RATE),
          held: note.duration * secondsPerBeat,
          pitch: note.pitch,
          velocity: (note.velocity / 127) * level,
        },
        sound,
        dry,
      )
    }
  }

  const { left, right } = play(dry, GENRE_SOUND[composition.genre])
  master(left, right)
  return { sampleRate: SAMPLE_RATE, left, right }
}

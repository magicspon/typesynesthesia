/**
 * The signal pieces the offline renderer builds its voices from: envelopes,
 * oscillators, a filter and noise. Plain arithmetic on numbers, so a song
 * renders the same bytes on every machine and needs no audio device.
 */

/** Samples per second of every rendered song: CD quality, which MP3 expects. */
export const SAMPLE_RATE = 44_100

/** A MIDI note number as hertz, A4 = 440. */
export const hz = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12)

/** Decibels as a linear gain. */
export const gain = (db: number): number => 10 ** (db / 20)

/** Attack, decay, sustain and release, in seconds except sustain (0–1). */
export interface Envelope {
  readonly attack: number
  readonly decay: number
  readonly sustain: number
  readonly release: number
}

/**
 * Tone.js approaches its decay and release targets exponentially; a time
 * constant of a fifth of the stage is within 1% of the target at its end.
 */
const approach = (from: number, to: number, t: number, stage: number): number =>
  to + (from - to) * Math.exp((-5 * t) / Math.max(stage, 1e-4))

/** The level while the note is held, `t` seconds after it starts. */
function holding(env: Envelope, t: number): number {
  if (t < env.attack) return t / env.attack
  return approach(1, env.sustain, t - env.attack, env.decay)
}

/** The envelope's level `t` seconds after onset, for a note let go at `held`. */
export function level(env: Envelope, t: number, held: number): number {
  if (t < held) return holding(env, t)
  const r = t - held
  if (r >= env.release) return 0
  return approach(holding(env, held), 0, r, env.release)
}

/** Seconds from onset until a note let go at `held` is silent. */
export const length = (env: Envelope, held: number): number =>
  held + env.release

/** The four plain wave shapes Tone.js names. */
export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth'

/** A Tone.js wave name such as `fatsawtooth`: its shape and whether it is detuned. */
export function waveOf(name: string): {
  readonly wave: Wave
  readonly fat: boolean
} {
  const fat = name.startsWith('fat')
  const base = fat ? name.slice(3) : name
  const wave: Wave =
    base === 'triangle' || base === 'square' || base === 'sawtooth'
      ? base
      : 'sine'
  return { wave, fat }
}

/**
 * Smooths the jump in a saw or square so it does not alias into a whine on
 * high notes (polyBLEP). `phase` and `step` are in cycles.
 */
function blep(phase: number, step: number): number {
  if (phase < step) {
    const x = phase / step
    return x + x - x * x - 1
  }
  if (phase > 1 - step) {
    const x = (phase - 1) / step
    return x * x + x + x + 1
  }
  return 0
}

/** One sample of `wave` at `phase` (0–1), advancing `step` cycles a sample. */
export function oscillate(wave: Wave, phase: number, step: number): number {
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase)
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5)
    case 'sawtooth':
      return 2 * phase - 1 - blep(phase, step)
    case 'square': {
      const half = (phase + 0.5) % 1
      return (phase < 0.5 ? 1 : -1) + blep(phase, step) - blep(half, step)
    }
  }
}

/**
 * Detunes, in cents, for a fat oscillator of `count` voices spread across
 * `spread` cents, as Tone.js's FatOscillator spaces them.
 */
export function detunes(count: number, spread: number): readonly number[] {
  if (count <= 1) return [0]
  return Array.from(
    { length: count },
    (_, i) => -spread / 2 + (spread * i) / (count - 1),
  )
}

/** A two-pole filter (RBJ cookbook), the 12 dB slope Tone.js uses by default. */
export class Biquad {
  #b0 = 1
  #b1 = 0
  #b2 = 0
  #a1 = 0
  #a2 = 0
  #x1 = 0
  #x2 = 0
  #y1 = 0
  #y2 = 0
  readonly kind: 'lowpass' | 'highpass'

  constructor(
    kind: 'lowpass' | 'highpass',
    frequency: number,
    q = Math.SQRT1_2,
  ) {
    this.kind = kind
    this.set(frequency, q)
  }

  /** Moves the corner; cheap enough to call every few samples. */
  set(frequency: number, q: number): void {
    // Above Nyquist the coefficients fold back, so stay just under it.
    const f = Math.min(Math.max(frequency, 10), SAMPLE_RATE * 0.45)
    const w = (2 * Math.PI * f) / SAMPLE_RATE
    const alpha = Math.sin(w) / (2 * Math.max(q, 0.05))
    const cos = Math.cos(w)
    const a0 = 1 + alpha
    const edge = this.kind === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2
    this.#b0 = edge / a0
    this.#b1 = (this.kind === 'lowpass' ? 1 - cos : -(1 + cos)) / a0
    this.#b2 = edge / a0
    this.#a1 = (-2 * cos) / a0
    this.#a2 = (1 - alpha) / a0
  }

  process(x: number): number {
    const y =
      this.#b0 * x +
      this.#b1 * this.#x1 +
      this.#b2 * this.#x2 -
      this.#a1 * this.#y1 -
      this.#a2 * this.#y2
    this.#x2 = this.#x1
    this.#x1 = x
    this.#y2 = this.#y1
    this.#y1 = y
    return y
  }
}

/**
 * White noise from a fixed seed (xorshift), so the snare and hats render the
 * same on every run and a song file is reproducible.
 */
export function noise(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x8000_0000 - 1
  }
}

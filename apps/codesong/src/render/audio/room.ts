/**
 * The room every track plays into: a reverb, then the genre's low-pass over
 * the whole mix, as the site's player chains them. The site's Tone.Reverb
 * convolves with generated noise; a Freeverb is the offline stand-in, since
 * convolving minutes of audio without an FFT would take minutes.
 */

import { Biquad, SAMPLE_RATE } from './dsp.ts'

/** Freeverb's comb and all-pass lengths, tuned for 44.1 kHz. */
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
const ALLPASSES = [556, 441, 341, 225]
/** Samples the right channel's lines run longer, which makes the tail stereo. */
const SPREAD = 23
/** How much of the input reaches the combs, and how much of the tail is heard. */
const INPUT = 0.015
const WET_SCALE = 3
/** High frequencies die faster in a real room; Freeverb's default damping. */
const DAMP = 0.2

/** A feedback comb with a low-pass in the loop: one strand of the tail. */
class Comb {
  readonly #line: Float32Array
  #at = 0
  #store = 0
  readonly #feedback: number
  constructor(size: number, feedback: number) {
    this.#line = new Float32Array(size)
    this.#feedback = feedback
  }
  process(x: number): number {
    const y = this.#line[this.#at]!
    this.#store = y * (1 - DAMP) + this.#store * DAMP
    this.#line[this.#at] = x + this.#store * this.#feedback
    this.#at = (this.#at + 1) % this.#line.length
    return y
  }
}

/** An all-pass: smears the combs' echoes into a wash without colouring them. */
class AllPass {
  readonly #line: Float32Array
  #at = 0
  constructor(size: number) {
    this.#line = new Float32Array(size)
  }
  process(x: number): number {
    const held = this.#line[this.#at]!
    this.#line[this.#at] = x + held * 0.5
    this.#at = (this.#at + 1) % this.#line.length
    return held - x
  }
}

/** One channel's reverb, decaying by 60 dB over `decay` seconds. */
class Tail {
  readonly #combs: readonly Comb[]
  readonly #passes: readonly AllPass[]
  constructor(decay: number, offset: number) {
    // The feedback that loses 60 dB in `decay` seconds for a line of this length.
    this.#combs = COMBS.map(
      (n) =>
        new Comb(
          n + offset,
          Math.min(0.98, 10 ** ((-3 * (n + offset)) / (SAMPLE_RATE * decay))),
        ),
    )
    this.#passes = ALLPASSES.map((n) => new AllPass(n + offset))
  }
  process(x: number): number {
    let sum = 0
    for (const comb of this.#combs) sum += comb.process(x * INPUT)
    for (const pass of this.#passes) sum = pass.process(sum)
    return sum * WET_SCALE
  }
}

/** The room a genre plays in, as `GenreSound` gives it. */
export interface Room {
  readonly reverb: { readonly decay: number; readonly wet: number }
  readonly tone: number
}

/**
 * Plays the mono `dry` bus into `room` and returns it in stereo. The right
 * channel is written over `dry` as it is read, so a four-minute song needs
 * two buffers rather than three.
 */
export function play(
  dry: Float32Array,
  room: Room,
): { readonly left: Float32Array; readonly right: Float32Array } {
  const left = new Float32Array(dry.length)
  const { decay, wet } = room.reverb
  const tails = [new Tail(decay, 0), new Tail(decay, SPREAD)] as const
  const tones = [
    new Biquad('lowpass', room.tone, 1),
    new Biquad('lowpass', room.tone, 1),
  ] as const
  for (let i = 0; i < dry.length; i++) {
    const x = dry[i]!
    const direct = x * (1 - wet)
    left[i] = tones[0].process(direct + tails[0].process(x) * wet)
    dry[i] = tones[1].process(direct + tails[1].process(x) * wet)
  }
  return { left, right: dry }
}

/**
 * One synth per role, rendered sample by sample. Each follows the Tone.js
 * synth the site plays that role with (`codesong-site/src/audio/instruments.ts`)
 * and reads the same settings, so an exported song sounds like the page.
 */

import type { MusicalRole } from '../../model.ts'
import { DRUM_NOTES } from '../realise.ts'
import { num, type Sound } from '../../sound/settings.ts'
import {
  Biquad,
  detunes,
  gain,
  hz,
  length,
  level,
  noise,
  oscillate,
  SAMPLE_RATE,
  waveOf,
  type Envelope,
} from './dsp.ts'

/** One note to play: where it starts, how long it is held, and how hard. */
interface Strike {
  /** The first sample it sounds on. */
  readonly at: number
  /** Seconds the key is held, before the release. */
  readonly held: number
  /** MIDI note number; for percussion, the General MIDI drum. */
  readonly pitch: number
  /** 0–1. */
  readonly velocity: number
}

/** Adds one note into `out`, a mono bus. */
type Instrument = (strike: Strike, sound: Sound, out: Float32Array) => void

const envelopeOf = (s: Sound): Envelope => ({
  attack: num(s, 'attack'),
  decay: num(s, 'decay'),
  sustain: num(s, 'sustain'),
  release: num(s, 'release'),
})

/**
 * Calls `sample` for every sample of a note `seconds` long, adding what it
 * returns into `out`. Stops at the end of the bus, so a tail never overruns.
 */
function each(
  out: Float32Array,
  at: number,
  seconds: number,
  sample: (t: number) => number,
): void {
  const end = Math.min(out.length, at + Math.ceil(seconds * SAMPLE_RATE))
  for (let i = Math.max(at, 0); i < end; i++) {
    out[i]! += sample((i - at) / SAMPLE_RATE)
  }
}

/**
 * Tone's `Synth`: an oscillator, fattened by detuned copies for a `fat…`
 * wave, under an amplitude envelope. The lead fattens with two voices
 * 18 cents apart; Tone's default is three across 20.
 */
function synth(volume: number, fatCount = 3, fatSpread = 20): Instrument {
  return (strike, s, out) => {
    const { wave, fat } = waveOf(String(s.wave))
    const env = envelopeOf(s)
    const steps = detunes(fat ? fatCount : 1, fatSpread).map(
      (cents) => (hz(strike.pitch) * 2 ** (cents / 1200)) / SAMPLE_RATE,
    )
    const phases = steps.map(() => 0)
    const loud = (gain(volume) * strike.velocity) / steps.length
    each(out, strike.at, length(env, strike.held), (t) => {
      let sum = 0
      for (let v = 0; v < steps.length; v++) {
        sum += oscillate(wave, phases[v]!, steps[v]!)
        phases[v] = (phases[v]! + steps[v]!) % 1
      }
      return sum * loud * level(env, t, strike.held)
    })
  }
}

/** Tone's modulation envelope default for FM and AM synths: a slow swell. */
const MODULATION: Envelope = { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }

/** Tone's `FMSynth`: a sine whose pitch a second sine bends, for bells and keys. */
function fm(volume: number): Instrument {
  return (strike, s, out) => {
    const env = envelopeOf(s)
    const f = hz(strike.pitch)
    const ratio = num(s, 'harmonicity')
    const depth = num(s, 'modulationIndex') * f * ratio
    const loud = gain(volume) * strike.velocity
    let carrier = 0
    let modulator = 0
    each(out, strike.at, length(env, strike.held), (t) => {
      const swing =
        depth *
        level(MODULATION, t, strike.held) *
        Math.sin(2 * Math.PI * modulator)
      modulator = (modulator + (f * ratio) / SAMPLE_RATE) % 1
      carrier = (carrier + (f + swing) / SAMPLE_RATE) % 1
      if (carrier < 0) carrier += 1
      return Math.sin(2 * Math.PI * carrier) * loud * level(env, t, strike.held)
    })
  }
}

/** Tone's `AMSynth`: a sine gated by a square above it, the organ-like pad. */
function am(volume: number): Instrument {
  return (strike, s, out) => {
    const env = envelopeOf(s)
    const f = hz(strike.pitch)
    const step = (f * num(s, 'harmonicity')) / SAMPLE_RATE
    const loud = gain(volume) * strike.velocity
    let carrier = 0
    let modulator = 0
    each(out, strike.at, length(env, strike.held), (t) => {
      const gate =
        ((oscillate('square', modulator, step) + 1) / 2) *
        level(MODULATION, t, strike.held)
      modulator = (modulator + step) % 1
      carrier = (carrier + f / SAMPLE_RATE) % 1
      return (
        Math.sin(2 * Math.PI * carrier) *
        gate *
        loud *
        level(env, t, strike.held)
      )
    })
  }
}

/** How often the bass filter's corner is recomputed, in samples. */
const SWEEP = 32

/** Tone's `MonoSynth`: an oscillator through a resonant low-pass that opens on each note. */
function mono(volume: number): Instrument {
  return (strike, s, out) => {
    const { wave } = waveOf(String(s.wave))
    const env = envelopeOf(s)
    const sweep: Envelope = {
      attack: num(s, 'filterAttack'),
      decay: num(s, 'filterDecay'),
      sustain: num(s, 'filterSustain'),
      // Tone's filter envelope default, which the site never changes.
      release: 0.8,
    }
    const base = num(s, 'cutoff')
    const octaves = num(s, 'octaves')
    const q = num(s, 'resonance')
    const filter = new Biquad('lowpass', base, q)
    const step = hz(strike.pitch) / SAMPLE_RATE
    const loud = gain(volume) * strike.velocity
    let phase = 0
    let n = 0
    each(out, strike.at, length(env, strike.held), (t) => {
      if (n++ % SWEEP === 0) {
        filter.set(base * 2 ** (octaves * level(sweep, t, strike.held)), q)
      }
      const x = oscillate(wave, phase, step)
      phase = (phase + step) % 1
      return filter.process(x) * loud * level(env, t, strike.held)
    })
  }
}

/** The 808 cymbal's inharmonic partials, which Tone's MetalSynth also uses. */
const METAL = [1, 1.483, 1.932, 2.546, 2.63, 3.897]

/**
 * Trims on the kit. Tone plays the kick and snare at 0 dB and the browser
 * lets the peaks clip; offline the song is normalised to its loudest peak,
 * so untrimmed drums would push every other part 10–15 dB down.
 */
const KICK_LEVEL = gain(-7)
const SNARE_LEVEL = gain(-12)

/** Fixed seeds, so every render of a song has the same snare and hats. */
const SNARE_SEED = 0x5eed
const HAT_SEED = 0x4a7

/**
 * A 909-ish kit, as on the site: a pitch-swept sine kick, a white-noise
 * snare and two metallic hats. The pitch picks the drum.
 */
function drums(): Instrument {
  const hiss = noise(SNARE_SEED)
  const sizzle = noise(HAT_SEED)
  const [KICK, SNARE, HAT] = DRUM_NOTES
  return (strike, s, out) => {
    const v = strike.velocity
    if (strike.pitch === KICK) {
      const hit = v * KICK_LEVEL
      // MembraneSynth on C1 with 6 octaves: the pitch falls 196 Hz → 33 Hz.
      const low = hz(24)
      const fall = Math.max(num(s, 'kickPitch'), 1e-3)
      const decay = num(s, 'kickDecay')
      let phase = 0
      each(out, strike.at, decay * 1.2, (t) => {
        const f = low * 6 ** Math.max(0, 1 - t / fall)
        phase = (phase + f / SAMPLE_RATE) % 1
        return Math.sin(2 * Math.PI * phase) * hit * Math.exp((-5 * t) / decay)
      })
      return
    }
    if (strike.pitch === SNARE) {
      const hit = v * SNARE_LEVEL
      const decay = num(s, 'snareDecay')
      each(
        out,
        strike.at,
        decay * 1.2,
        (t) => hiss() * hit * Math.exp((-5 * t) / decay),
      )
      return
    }
    // Closed or open hat: square partials of 300 Hz raised by the 5.1
    // harmonicity, roughened with noise, above a 4 kHz high-pass.
    const decay = num(s, strike.pitch === HAT ? 'closedDecay' : 'openDecay')
    const loud = gain(num(s, 'hatLevel')) * v
    const steps = METAL.map((r) => (300 * r * 5.1) / SAMPLE_RATE)
    const phases = steps.map(() => 0)
    const filter = new Biquad('highpass', 4000, 1.5)
    each(out, strike.at, decay * 1.2, (t) => {
      let sum = sizzle() * 0.5
      for (let p = 0; p < steps.length; p++) {
        sum += phases[p]! < 0.5 ? 0.25 : -0.25
        phases[p] = (phases[p]! + steps[p]!) % 1
      }
      return filter.process(sum) * loud * Math.exp((-5 * t) / decay)
    })
  }
}

/**
 * Each role's instrument, at the volume the site balances it at. Built once
 * per track, so the drums' noise runs on through the whole song.
 */
export function instrument(role: MusicalRole): Instrument {
  switch (role) {
    case 'lead':
      return synth(-14, 2, 18)
    case 'counter':
      return fm(-16)
    case 'bass':
      return mono(-12)
    case 'pad':
      return am(-20)
    case 'arp':
      return synth(-22)
    case 'percussion':
      return drums()
  }
}

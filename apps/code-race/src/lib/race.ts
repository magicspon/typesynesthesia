/**
 * Laps and checkpoints, as a small state machine fed the car's stretch each
 * frame. Gates count only in order, so cutting across the infield or
 * reversing over the line earns nothing.
 */

/** Laps in a race. */
export const LAPS = 3

/** One race's progress. Replaced, not mutated, so React can watch it. */
export interface Race {
  readonly stops: number
  /** The checkpoint the car must reach next. */
  readonly next: number
  /** Laps finished. */
  readonly lap: number
  /** When the lights went green, in seconds; `null` before. */
  readonly start: number | null
  /** When the current lap began, in seconds. */
  readonly lapStart: number
  /** Each finished lap's time, in seconds. */
  readonly times: readonly number[]
  /** The total time once every lap is done; `null` while racing. */
  readonly finished: number | null
}

/** A race over a circuit of `stops` checkpoints, waiting for the lights. */
export function newRace(stops: number): Race {
  // The grid is just past gate 0, so the first gate to reach is 1; with a
  // single checkpoint, crossing the line again is the lap.
  return {
    stops,
    next: 1 % stops,
    lap: 0,
    start: null,
    lapStart: 0,
    times: [],
    finished: null,
  }
}

/** The lights go green at `now`. */
export function go(race: Race, now: number): Race {
  return { ...race, start: now, lapStart: now }
}

/** The race after the car is seen on checkpoint `stop`'s stretch at `now`. */
export function pass(race: Race, stop: number, now: number): Race {
  if (race.start === null || race.finished !== null || stop !== race.next)
    return race
  const next = (stop + 1) % race.stops
  if (stop !== 0) return { ...race, next }
  const times = [...race.times, now - race.lapStart]
  const lap = race.lap + 1
  return {
    ...race,
    next,
    lap,
    times,
    lapStart: now,
    finished: lap >= LAPS ? now - race.start : null,
  }
}

/** The fastest of `times`, or `null` with none. */
export function fastest(times: readonly number[]): number | null {
  return times.length ? Math.min(...times) : null
}

/** `m:ss.cc`, the way race clocks read. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

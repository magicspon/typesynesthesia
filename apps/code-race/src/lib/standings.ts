import type { Race } from './race.ts'
import { PER_STOP } from './shape.ts'

/** One car in the race, as the standings see it. */
export interface Entrant {
  readonly name: string
  readonly colour: string
  readonly player: boolean
  race: Race
  /** The track sample the car is nearest. */
  index: number
}

/**
 * How far round the race a car is, in samples: whole laps, the gates passed
 * this lap, and how far past the last gate it has gone. Comparable across
 * cars, so it orders them.
 */
export function distanceOf(e: Entrant, samples: number): number {
  const { stops, next, lap } = e.race
  // Gates passed this lap: the one before `next`, counting from gate 0.
  const passed = (next - 1 + stops) % stops
  const gate = passed * PER_STOP
  const past = (e.index - gate + samples) % samples
  // A car not yet at the first gate of the race sits just behind it.
  const along = past > PER_STOP * 1.5 ? past - samples : past
  return lap * samples + gate + along
}

/**
 * The cars in race order: finishers first by finishing time, then everyone
 * else by how far round they are.
 */
export function standingsOf(
  field: readonly Entrant[],
  samples: number,
): Entrant[] {
  return [...field].sort((a, b) => {
    const fa = a.race.finished
    const fb = b.race.finished
    if (fa !== null && fb !== null) return fa - fb
    if (fa !== null) return -1
    if (fb !== null) return 1
    return distanceOf(b, samples) - distanceOf(a, samples)
  })
}

/** `1st`, `2nd`, `3rd`, `4th`… */
export function ordinal(n: number): string {
  const tail =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${tail}`
}

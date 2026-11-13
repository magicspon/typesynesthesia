import { headingOf, speedOf } from './rig.ts'
import type { Racer } from './racer.ts'
import type { Sample } from './shape.ts'
import { TOP_SPEED, type Stick } from './vehicle.ts'

/**
 * A computer driver. It aims at a point on its own lane some way ahead,
 * looking further the faster it goes; brakes when the road ahead bends
 * harder than its pace allows; and, like a player, reverses out of a wall
 * and asks to be put back on the road when truly stuck.
 */
export interface Pilot {
  /** The stick for this step, and whether the car wants putting back on the road. */
  drive(racer: Racer, dt: number): { stick: Stick; recover: boolean }
}

/** Samples looked ahead at a standstill, and more per metre per second. */
const LOOK = 4
const LOOK_PER_SPEED = 0.1
/** Samples ahead the bend is judged over. */
const BEND_AHEAD = 24
/** About how far apart the samples are, in metres. */
const SAMPLE_LENGTH = 2.5
/** Extra tyre grip a computer car gets over the player's, so it can hold a fast line. */
export const PILOT_GRIP = 1.35
/** Sideways grip a pilot trusts in a bend, in metres per second squared. */
const CORNER_GRIP = 30
/** How hard a pilot steers per radian it is off its aim. */
const GAIN = 2.5
/** Seconds stuck before reversing, and before asking to be put back. */
const STUCK = 1
const STRANDED = 5
/** Seconds without getting a few samples further round before asking to be put back. */
const NO_PROGRESS = 4

/** How much the road turns between `a` and `b`, in radians. */
function turnBetween(a: Sample, b: Sample): number {
  const d = Math.atan2(b.tz, b.tx) - Math.atan2(a.tz, a.tx)
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))
}

/**
 * A pilot driving at `pace` (share of top speed) on a lane `lane` metres
 * right of the centreline.
 */
export function pilotOf(
  samples: readonly Sample[],
  pace: number,
  lane = 0,
): Pilot {
  let stuck = 0
  let backing = 0
  let mark = -1
  let idle = 0
  return {
    drive(racer, dt) {
      const { rig, index } = racer
      // Circling, or pinned among cones: no progress round the track at all.
      const n0 = samples.length
      const gained = (index - mark + n0) % n0
      if (mark < 0 || (gained > 3 && gained < n0 / 2)) {
        mark = index
        idle = 0
      } else idle += dt
      if (idle > NO_PROGRESS) {
        idle = 0
        mark = -1
        return { stick: { thrust: 0, turn: 0 }, recover: true }
      }
      const p = rig.body.translation()
      const speed = speedOf(rig)
      const n = samples.length
      const ahead =
        samples[(index + LOOK + Math.round(speed * LOOK_PER_SPEED)) % n]!
      // Its own lane, narrowed on narrow road so it never aims at the kerb.
      const off =
        Math.max(-1, Math.min(1, lane / (ahead.width / 2))) *
        (ahead.width / 2 - 2)
      const tx = ahead.x - ahead.tz * off
      const tz = ahead.z + ahead.tx * off
      const h = headingOf(rig.body)
      const want = Math.atan2(tz - p.z, tx - p.x)
      const miss = Math.atan2(Math.sin(want - h), Math.cos(want - h))
      const turn = Math.max(-1, Math.min(1, miss * GAIN))

      stuck = Math.abs(speed) < 1.5 ? stuck + dt : 0
      if (stuck > STRANDED) {
        stuck = 0
        return { stick: { thrust: 0, turn: 0 }, recover: true }
      }
      if (stuck > STUCK && backing <= 0) backing = 1.2
      if (backing > 0) {
        backing -= dt
        return { stick: { thrust: -1, turn: -turn }, recover: false }
      }
      // The fastest the bend ahead can be taken, v = √(grip ÷ curvature),
      // judged far enough ahead to brake for it, and never past its own pace.
      const from = samples[(index + LOOK) % n]!
      const to = samples[(index + LOOK + BEND_AHEAD) % n]!
      const curve = turnBetween(from, to) / (BEND_AHEAD * SAMPLE_LENGTH)
      const corner = Math.sqrt(CORNER_GRIP / Math.max(curve, 1e-4))
      const limit = Math.min(TOP_SPEED, corner) * pace
      // Brake only with speed to lose: at a crawl, "brake" would mean reverse,
      // and a car pointing the wrong way would back off forever.
      const wide = Math.abs(miss) > 0.6 && speed > 12
      const thrust = speed > limit + 3 || wide ? -1 : speed > limit ? 0 : 1
      return { stick: { thrust, turn }, recover: false }
    },
  }
}

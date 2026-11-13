import type { World } from '@dimforge/rapier3d-compat'
import type { Rapier } from './course.ts'
import { KERB } from './road.ts'
import {
  buildRig,
  driveRig,
  place,
  poseOn,
  speedOf,
  type Pose,
  type Rig,
} from './rig.ts'
import { locate } from './shape.ts'
import type { Track } from './track.ts'
import { BOOST_TIME, controlsFor, easeSteer, type Stick } from './vehicle.ts'

/** One car on the circuit, player's or rival's: its rig and what the race knows of it. */
export interface Racer {
  readonly rig: Rig
  /** The track sample the car is nearest; also the hint for the next search. */
  index: number
  /** Signed distance right of the centreline. */
  lateral: number
  /** The wheels' eased angle, `-1`–`1`. */
  steer: number
  /** Seconds of boost left. */
  boost: number
  /** Seconds spent upside down. */
  flipped: number
  /** When each boost pad, by item index, is ready for this car again. */
  readonly pads: Map<number, number>
}

/** Seconds before a used boost pad works again for the same car. */
const PAD_REST = 2
/** Seconds upside down before a car is put back on the road. */
const FLIPPED_FOR = 2

/** Puts a car on the circuit at `pose`. */
export function enter(
  R: Rapier,
  world: World,
  pose: Pose,
  index: number,
): Racer {
  return {
    rig: buildRig(R, world, pose),
    index,
    lateral: 0,
    steer: 0,
    boost: 0,
    flipped: 0,
    pads: new Map(),
  }
}

/** Whether the car is on oil; starts a boost if it is on a ready pad. */
function touch(
  track: Track,
  racer: Racer,
  at: { x: number; z: number },
  now: number,
): boolean {
  let oil = false
  track.items.forEach((item, i) => {
    if (item.kind === 'cone') return
    if (Math.hypot(item.x - at.x, item.z - at.z) > item.reach + 1) return
    if (item.kind === 'oil') oil = true
    else if ((racer.pads.get(i) ?? -Infinity) < now) {
      racer.boost = BOOST_TIME
      racer.pads.set(i, now + PAD_REST)
    }
  })
  return oil
}

/**
 * One physics step for one car: find it on the track, read the surface
 * under it, send `stick` to the wheels, and right it if it has rolled.
 * Before the lights, `racing` is false and the brakes are held. `grip`
 * scales the tyres: rival cars get a little more than the player's, the
 * usual racing-game help that lets a computer driver hold a fast line.
 */
export function stepRacer(
  track: Track,
  racer: Racer,
  stick: Stick,
  racing: boolean,
  dt: number,
  now: number,
  grip = 1,
): void {
  const { rig } = racer
  const p = rig.body.translation()
  const fix = locate(track.samples, p.x, p.z, racer.index)
  racer.index = fix.index
  racer.lateral = fix.lateral
  const here = track.samples[fix.index]!
  const oil = touch(track, racer, p, now)
  racer.boost = Math.max(0, racer.boost - dt)
  const grass = Math.abs(fix.lateral) > here.width / 2 + KERB
  racer.steer = easeSteer(racer.steer, racing ? stick.turn : 0, dt)
  const controls = controlsFor(
    { thrust: racing ? stick.thrust : 0, turn: racer.steer },
    speedOf(rig),
    { grass, oil, boosting: racer.boost > 0 },
  )
  // On the grid the brakes are held, so a slope cannot roll a car over the line.
  const held = { ...controls, grip: controls.grip * grip }
  driveRig(rig, racing ? held : { ...held, engine: 0, brake: 1 }, dt)
  // Upside down for long enough, it is put back on its wheels.
  const q = rig.body.rotation()
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
  racer.flipped = upY < 0.2 ? racer.flipped + dt : 0
  if (racer.flipped > FLIPPED_FOR) recover(track, racer)
}

/** Puts a stranded car back on the road where it left it, stopped. */
export function recover(track: Track, racer: Racer): void {
  racer.flipped = 0
  place(racer.rig, poseOn(track.samples[racer.index]!))
}

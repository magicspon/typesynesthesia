import R from '@dimforge/rapier3d-compat'
import type { Atlas } from '@tsyn/code-art/atlas'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildCones, buildCourse } from '../src/lib/course.ts'
import { PILOT_GRIP, pilotOf } from '../src/lib/pilot.ts'
import { enter, recover, stepRacer } from '../src/lib/racer.ts'
import { rivalsOf } from '../src/lib/rivals.ts'
import { heightAt } from '../src/lib/ground.ts'
import { go, LAPS, newRace, pass } from '../src/lib/race.ts'
import {
  buildRig,
  gridPose,
  driveRig,
  headingOf,
  poseOn,
  speedOf,
} from '../src/lib/rig.ts'
import { trackOf, type Track } from '../src/lib/track.ts'
import { controlsFor, TOP_SPEED, type Stick } from '../src/lib/vehicle.ts'

/** tsyn's own export, the circuit a fresh checkout opens on. */
const atlas = JSON.parse(
  readFileSync(
    new URL('../../code-art/src/data/tsyn.json', import.meta.url),
    'utf8',
  ),
) as Atlas
/** The game's physics step. */
const STEP = 1 / 120
let track: Track

beforeAll(async () => {
  await R.init()
  track = trackOf(atlas)!
})

/** A fresh world holding the course and a car on the grid. */
function scene(): { world: R.World; rig: ReturnType<typeof buildRig> } {
  const world = new R.World({ x: 0, y: -20, z: 0 })
  world.timestep = STEP
  buildCourse(R, world, track)
  const rig = buildRig(R, world, poseOn(track.samples[4]!))
  return { world, rig }
}

/** Runs `seconds` of driving under `steer`, which picks the stick each step. */
function run(
  world: R.World,
  rig: ReturnType<typeof buildRig>,
  seconds: number,
  steer: (t: number) => Stick,
  each?: (t: number) => boolean,
): void {
  const surface = { grass: false, oil: false, boosting: false }
  for (let t = 0; t < seconds; t += STEP) {
    driveRig(rig, controlsFor(steer(t), speedOf(rig), surface), STEP)
    world.step()
    if (each?.(t)) return
  }
}

describe('the physics course', () => {
  it('lays the land where it is drawn', () => {
    const world = new R.World({ x: 0, y: -20, z: 0 })
    buildCourse(R, world, track)
    world.step()
    const { ground } = track
    for (const [fx, fz] of [
      [0.1, 0.2],
      [0.8, 0.3],
      [0.5, 0.9],
      [0.25, 0.7],
    ]) {
      const span = ground.cell * (ground.n - 1)
      const x = ground.x0 + fx! * span
      const z = ground.z0 + fz! * span
      const ray = new R.Ray({ x, y: 500, z }, { x: 0, y: -1, z: 0 })
      const hit = world.castRay(ray, 1000, true)
      expect(hit).not.toBeNull()
      expect(500 - hit!.timeOfImpact).toBeCloseTo(heightAt(ground, x, z), 0)
    }
  })

  it('drives forwards on the throttle, up to about top speed', () => {
    const { world, rig } = scene()
    run(world, rig, 1, () => ({ thrust: 0, turn: 0 }))
    const start = rig.body.translation()
    const h = headingOf(rig.body)
    run(world, rig, 5, () => ({ thrust: 1, turn: 0 }))
    const end = rig.body.translation()
    const along =
      (end.x - start.x) * Math.cos(h) + (end.z - start.z) * Math.sin(h)
    expect(along).toBeGreaterThan(40)
    expect(speedOf(rig)).toBeGreaterThan(TOP_SPEED * 0.5)
  })

  it('a full field of pilots can race three laps together', () => {
    const world = new R.World({ x: 0, y: -20, z: 0 })
    world.timestep = STEP
    buildCourse(R, world, track)
    buildCones(R, world, track)
    // The rivals, plus one more pilot standing in for the player at the back.
    const paces = [...rivalsOf(atlas).map((r) => r.pace), 0.9]
    const cars = paces.map((pace, slot) => {
      const { pose, index } = gridPose(track.samples, slot)
      return {
        racer: enter(R, world, pose, index),
        pilot: pilotOf(track.samples, pace, ((slot % 3) - 1) * 2.5),
        race: go(newRace(track.files.length), 0),
        stop: track.samples[index]!.stop,
      }
    })
    expect(cars.length).toBeGreaterThan(2)
    for (
      let t = 0;
      t < 600 && cars.some((c) => c.race.finished === null);
      t += STEP
    ) {
      for (const c of cars) {
        const { stick, recover: stranded } = c.pilot.drive(c.racer, STEP)
        if (stranded) recover(track, c.racer)
        stepRacer(track, c.racer, stick, true, STEP, t, PILOT_GRIP)
      }
      world.step()
      for (const c of cars) {
        const here = track.samples[c.racer.index]!.stop
        if (here === c.stop) continue
        c.stop = here
        c.race = pass(c.race, here, t)
      }
    }
    for (const c of cars) {
      expect(c.race.lap).toBe(LAPS)
      for (const lap of c.race.times) {
        expect(lap).toBeGreaterThan(20)
        expect(lap).toBeLessThan(100)
      }
    }
  }, 120_000)
})

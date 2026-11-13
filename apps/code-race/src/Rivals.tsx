import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useState, type JSX } from 'react'
import { Racing } from './Racing.tsx'
import { PILOT_GRIP, pilotOf, type Pilot } from './lib/pilot.ts'
import { pass } from './lib/race.ts'
import { enter, recover, stepRacer, type Racer } from './lib/racer.ts'
import { gridPose } from './lib/rig.ts'
import type { Rival } from './lib/rivals.ts'
import type { Entrant } from './lib/standings.ts'
import type { Track } from './lib/track.ts'

/** One rival on the circuit: its car, its driver and its line in the standings. */
interface Runner {
  readonly racer: Racer
  readonly pilot: Pilot
  readonly entrant: Entrant
  stop: number
}

/**
 * The rival cars: each a Rapier car like the player's, driven by a pilot at
 * its package's pace on a lane of its own, gridded ahead of the player. Each
 * frame they report their checkpoints into the standings.
 */
export function Rivals(props: {
  track: Track
  rivals: readonly Rival[]
  /** Their lines in the standings, in grid order. */
  entrants: readonly Entrant[]
  racing: boolean
}): JSX.Element {
  const { track, rivals, entrants, racing } = props
  const { world, rapier } = useRapier()
  const [runners, setRunners] = useState<Runner[]>([])

  useEffect(() => {
    const made = rivals.map((rival, slot) => {
      const { pose, index } = gridPose(track.samples, slot)
      // Lanes spread across the road, so the pack does not drive in single file.
      const lane = ((slot % 3) - 1) * 2.5
      return {
        racer: enter(rapier, world, pose, index),
        pilot: pilotOf(track.samples, rival.pace, lane),
        entrant: entrants[slot]!,
        stop: track.samples[index]!.stop,
      }
    })
    setRunners(made)
    return () => {
      setRunners([])
      for (const { racer } of made) {
        // Only from a live world: it is freed first when the canvas unmounts.
        if (!world.bodies.contains(racer.rig.body.handle)) continue
        world.removeVehicleController(racer.rig.controller)
        world.removeRigidBody(racer.rig.body)
      }
    }
  }, [world, rapier, track, rivals, entrants])

  useBeforePhysicsStep((w) => {
    const now = performance.now() / 1000
    for (const r of runners) {
      // The pilots wait for the lights: sitting still on the grid would
      // otherwise read as stuck, and every car would reverse off the line.
      if (!racing) {
        stepRacer(
          track,
          r.racer,
          { thrust: 0, turn: 0 },
          false,
          w.timestep,
          now,
        )
        continue
      }
      const { stick, recover: stranded } = r.pilot.drive(r.racer, w.timestep)
      if (stranded) recover(track, r.racer)
      stepRacer(track, r.racer, stick, true, w.timestep, now, PILOT_GRIP)
    }
  })

  useFrame(() => {
    const now = performance.now() / 1000
    for (const r of runners) {
      r.entrant.index = r.racer.index
      const stop = track.samples[r.racer.index]!.stop
      if (stop === r.stop) continue
      r.stop = stop
      r.entrant.race = pass(r.entrant.race, stop, now)
    }
  })

  return (
    <>
      {runners.map((r, i) => (
        <Racing key={i} racer={r.racer} colour={rivals[i]!.colour} />
      ))}
    </>
  )
}

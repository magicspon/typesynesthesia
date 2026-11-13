import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type RefObject,
} from 'react'
import {
  Object3D,
  Vector3,
  type DirectionalLight,
  type PerspectiveCamera,
} from 'three'
import { Racing } from './Racing.tsx'
import { heightAt } from './lib/ground.ts'
import { enter, recover, stepRacer, type Racer } from './lib/racer.ts'
import { gridPose, headingOf, speedOf } from './lib/rig.ts'
import type { Entrant } from './lib/standings.ts'
import type { Track } from './lib/track.ts'
import type { Stick } from './lib/vehicle.ts'
import { SUN_DIRECTION } from './Sky.tsx'

/** What the driver tells the game as it goes. */
export interface DriverProps {
  readonly track: Track
  readonly stick: RefObject<Stick>
  /** Whether the lights are green; the car holds still before. */
  readonly racing: boolean
  /** The player's grid slot: behind every rival. */
  readonly slot: number
  /** The player's line in the standings, kept up to date with where the car is. */
  readonly entrant: Entrant
  /** Called when the car moves onto checkpoint `stop`'s stretch. */
  readonly onStop: (stop: number) => void
  /** Written with the speed every frame, so the HUD need not re-render. */
  readonly speedo: RefObject<HTMLElement | null>
}

/** Speed to the dial's units: world units are metres. */
const KMH = 3.6
/** Field of view standing still, and how much speed widens it. */
const FOV = 66
const FOV_PER_SPEED = 0.32

const eye = new Vector3()
const aim = new Vector3()

/**
 * The player's car: keyboard in, Rapier out. Each frame it reports
 * checkpoints, and swings the chase camera and the sun's shadow box along
 * behind the car.
 */
export function Driver(props: DriverProps): JSX.Element {
  const { track, stick, racing, slot, entrant, onStop, speedo } = props
  const { world, rapier } = useRapier()
  const sun = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const [racer, setRacer] = useState<Racer | null>(null)

  useEffect(() => {
    const { pose, index } = gridPose(track.samples, slot)
    const made = enter(rapier, world, pose, index)
    setRacer(made)
    // Enter puts a stranded car back on the road where it left it.
    const back = (e: KeyboardEvent): void => {
      if (e.code === 'Enter') recover(track, made)
    }
    window.addEventListener('keydown', back)
    return () => {
      window.removeEventListener('keydown', back)
      setRacer(null)
      // Only from a live world: it is freed first when the canvas unmounts.
      if (!world.bodies.contains(made.rig.body.handle)) return
      world.removeVehicleController(made.rig.controller)
      world.removeRigidBody(made.rig.body)
    }
  }, [world, rapier, track, slot])

  useBeforePhysicsStep((w) => {
    if (!racer) return
    const now = performance.now() / 1000
    stepRacer(track, racer, stick.current, racing, w.timestep, now)
  })

  const last = useRef(-1)
  useFrame(({ camera }, delta) => {
    if (!racer) return
    const { body } = racer.rig
    const dt = Math.min(delta, 1 / 20)
    entrant.index = racer.index
    const stop = track.samples[racer.index]!.stop
    if (stop !== last.current) {
      last.current = stop
      onStop(stop)
    }
    const speed = Math.abs(speedOf(racer.rig))
    if (speedo.current)
      speedo.current.textContent = `${Math.round(speed * KMH)}`

    // Chase camera: behind and above, easing so bumps do not shake it, and
    // never sunk into a hill behind the car.
    const p = body.translation()
    const h = headingOf(body)
    const fx = Math.cos(h)
    const fz = Math.sin(h)
    eye.set(p.x - fx * 12, 0, p.z - fz * 12)
    eye.y = Math.max(p.y + 4.5, heightAt(track.ground, eye.x, eye.z) + 2.5)
    if (camera.position.distanceTo(eye) > 40) camera.position.copy(eye)
    else camera.position.lerp(eye, Math.min(1, dt * 5))
    aim.set(p.x + fx * 8, p.y + 0.8, p.z + fz * 8)
    camera.lookAt(aim)
    const lens = camera as PerspectiveCamera
    lens.fov += (FOV + speed * FOV_PER_SPEED - lens.fov) * Math.min(1, dt * 3)
    lens.updateProjectionMatrix()

    // The sun's shadow box rides with the car: sharp shadows where they show.
    target.position.set(p.x, p.y, p.z)
    target.updateMatrixWorld()
    sun.current?.position
      .copy(target.position)
      .addScaledVector(SUN_DIRECTION, 150)
  })

  return (
    <>
      {racer && <Racing racer={racer} colour="#e63946" />}
      <primitive object={target} />
      <directionalLight
        ref={sun}
        target={target}
        intensity={2.4}
        color="#ffd2a8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={10}
        shadow-camera-far={320}
      />
    </>
  )
}

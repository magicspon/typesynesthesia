import type {
  DynamicRayCastVehicleController,
  RigidBody,
  World,
} from '@dimforge/rapier3d-compat'
import type { Rapier } from './course.ts'
import type { Sample } from './shape.ts'
import type { Controls } from './vehicle.ts'

/** The car in the physics world: a chassis on Rapier's raycast vehicle. */
export interface Rig {
  readonly body: RigidBody
  readonly controller: DynamicRayCastVehicleController
}

/** Where each wheel hangs off the chassis, front pair first. */
export const WHEELS: readonly { x: number; z: number; front: boolean }[] = [
  { x: 1.35, z: -0.95, front: true },
  { x: 1.35, z: 0.95, front: true },
  { x: -1.3, z: -1.0, front: false },
  { x: -1.3, z: 1.0, front: false },
]
/** Wheel radius, and where the suspension mounts below the chassis middle. */
export const WHEEL_RADIUS = 0.45
export const MOUNT = -0.1
const REST = 0.4
/** Rear tyres grip harder than the front: the car runs wide before it spins. */
const REAR_GRIP = 1.4
/** Speed-squared drag, per unit mass: what keeps a long descent finite. */
const DRAG = 0.0025

/** Chassis half-extents: nose along +x. */
const HALF = { x: 2, y: 0.3, z: 0.85 }

/** Where a car stands and which way its nose points. */
export interface Pose {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly heading: number
}

/** A pose on the road at sample `s`, `lateral` metres right of the centreline, lifted clear and facing along it. */
export function poseOn(s: Sample, lateral = 0): Pose {
  return {
    x: s.x - s.tz * lateral,
    y: s.y + 1.4,
    z: s.z + s.tx * lateral,
    heading: Math.atan2(s.tz, s.tx),
  }
}

/**
 * Grid slot `slot` of `count`: pairs side by side, rows a car-length and a
 * half apart, the front row just past the line.
 */
export function gridPose(
  samples: readonly Sample[],
  slot: number,
): { pose: Pose; index: number } {
  const row = Math.floor(slot / 2)
  const index = (4 - row * 4 + samples.length) % samples.length
  const s = samples[index]!
  const side = slot % 2 === 0 ? -1 : 1
  return { pose: poseOn(s, (side * s.width) / 4), index }
}

/** Rotation for a heading: the nose along `(cos h, sin h)` in x and z. */
function facing(heading: number): {
  x: number
  y: number
  z: number
  w: number
} {
  return { x: 0, y: Math.sin(-heading / 2), z: 0, w: Math.cos(-heading / 2) }
}

/** The car, standing at `pose`. */
export function buildRig(R: Rapier, world: World, pose: Pose): Rig {
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(pose.x, pose.y, pose.z)
      .setRotation(facing(pose.heading))
      .setCcdEnabled(true)
      .setAngularDamping(1.5)
      .setCanSleep(false),
  )
  world.createCollider(
    R.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z)
      // A low centre of mass keeps it on its wheels through a fast bend.
      .setMassProperties(
        1,
        { x: 0, y: -0.8, z: 0 },
        { x: 0.3, y: 1.6, z: 1.4 },
        { x: 0, y: 0, z: 0, w: 1 },
      )
      .setFriction(0.3),
    body,
  )
  const controller = world.createVehicleController(body)
  controller.indexUpAxis = 1
  controller.setIndexForwardAxis = 0
  WHEELS.forEach((w, i) => {
    controller.addWheel(
      { x: w.x, y: MOUNT, z: w.z },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      REST,
      WHEEL_RADIUS,
    )
    controller.setWheelSuspensionStiffness(i, 38)
    controller.setWheelSuspensionCompression(i, 3.2)
    controller.setWheelSuspensionRelaxation(i, 3.8)
    controller.setWheelMaxSuspensionTravel(i, 0.35)
    controller.setWheelSideFrictionStiffness(i, 1.2)
  })
  return { body, controller }
}

/** Sends `controls` to the wheels and moves the vehicle on by `dt`. */
export function driveRig(rig: Rig, controls: Controls, dt: number): void {
  const { body, controller } = rig
  WHEELS.forEach((w, i) => {
    controller.setWheelSteering(i, w.front ? controls.steer : 0)
    controller.setWheelEngineForce(i, w.front ? 0 : controls.engine)
    controller.setWheelBrake(i, controls.brake)
    controller.setWheelFrictionSlip(
      i,
      controls.grip * (w.front ? 1 : REAR_GRIP),
    )
  })
  const v = body.linvel()
  const speed = Math.hypot(v.x, v.y, v.z)
  body.resetForces(true)
  body.addForce(
    { x: -v.x * speed * DRAG, y: -v.y * speed * DRAG, z: -v.z * speed * DRAG },
    true,
  )
  controller.updateVehicle(dt)
}

/** Speed along the nose, in metres per second; negative reversing. */
export function speedOf(rig: Rig): number {
  return rig.controller.currentVehicleSpeed()
}

/** The nose's heading in the ground plane, as the track measures it. */
export function headingOf(body: RigidBody): number {
  const q = body.rotation()
  // The chassis +x axis, rotated into the world.
  const fx = 1 - 2 * (q.y * q.y + q.z * q.z)
  const fz = 2 * (q.x * q.z - q.w * q.y)
  return Math.atan2(fz, fx)
}

/** Puts the car back at `pose`, stopped: for a restart or a recovery. */
export function place(rig: Rig, pose: Pose): void {
  rig.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true)
  rig.body.setRotation(facing(pose.heading), true)
  rig.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  rig.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
}

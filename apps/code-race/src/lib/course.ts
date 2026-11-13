import type RAPIER from '@dimforge/rapier3d-compat'
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat'
import { postOffset, roadMesh } from './road.ts'
import { PER_STOP, type Sample } from './shape.ts'
import { blockBox, type Track } from './track.ts'

/** The Rapier module, passed in: the browser and the tests load it differently. */
export type Rapier = typeof RAPIER

/** A turn of `yaw` radians about +y, the way the drawing turns things to face along the road. */
function yaw(angle: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }
}

/** The land as a heightfield, centred on its grid. */
function land(R: Rapier, track: Track): RAPIER.ColliderDesc {
  const { n, cell, x0, z0, heights } = track.ground
  const span = cell * (n - 1)
  // Rapier wants rows along z and columns along x, column by column; the
  // grid is stored row by row with `i` along x, so it is transposed here.
  const field = new Float32Array(n * n)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) field[i * n + j] = heights[j * n + i]!
  return R.ColliderDesc.heightfield(n - 1, n - 1, field, {
    x: span,
    y: 1,
    z: span,
  })
    .setTranslation(x0 + span / 2, 0, z0 + span / 2)
    .setFriction(0.9)
}

/** Gate posts, so a checkpoint can be clipped. */
function posts(R: Rapier, s: Sample): RAPIER.ColliderDesc[] {
  const half = postOffset(s)
  return [-half, half].map((off) =>
    // Down to a metre under the road: the shoulder's land is lower.
    R.ColliderDesc.cuboid(0.35, 4, 0.35)
      .setTranslation(s.x - s.tz * off, s.y + 3, s.z + s.tx * off)
      .setRotation(yaw(-Math.atan2(s.tz, s.tx))),
  )
}

/**
 * Every fixed thing the car can touch: the land, the road, the buildings,
 * the tree trunks and the gate posts. Returns the colliders so a caller can
 * take them out of the world again.
 */
export function buildCourse(R: Rapier, world: World, track: Track): Collider[] {
  const road = roadMesh(track.samples)
  const shapes: RAPIER.ColliderDesc[] = [
    land(R, track),
    R.ColliderDesc.trimesh(road.vertices, road.indices).setFriction(1),
    ...track.blocks.map((b) => {
      const box = blockBox(b)
      return R.ColliderDesc.cuboid(box.hx, box.hy, box.hz).setTranslation(
        box.x,
        box.y,
        box.z,
      )
    }),
    ...track.trees.map((t) =>
      R.ColliderDesc.cylinder(1.2 * t.scale, 0.45 * t.scale).setTranslation(
        t.x,
        t.y + 1.2 * t.scale,
        t.z,
      ),
    ),
    ...track.files.flatMap((_, i) => posts(R, track.samples[i * PER_STOP]!)),
  ]
  return shapes.map((d) => world.createCollider(d))
}

/** Cones: loose, light, and sent flying by a car that hits them. */
export function buildCones(R: Rapier, world: World, track: Track): RigidBody[] {
  return track.items
    .filter((item) => item.kind === 'cone')
    .map((item) => {
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(item.x, item.y + 0.75, item.z)
          // Asleep until hit, so a lap of standing cones costs nothing.
          .setSleeping(true),
      )
      world.createCollider(
        R.ColliderDesc.cone(0.7, 0.6).setMass(0.08).setRestitution(0.3),
        body,
      )
      return body
    })
}

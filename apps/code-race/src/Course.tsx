import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import type { RigidBody } from '@dimforge/rapier3d-compat'
import { useEffect, useRef, useState, type JSX } from 'react'
import { Object3D, type InstancedMesh } from 'three'
import { buildCones, buildCourse } from './lib/course.ts'
import type { Track } from './lib/track.ts'

const o = new Object3D()

/**
 * The course in the physics world: the land, road, buildings, trunks and
 * gate posts as fixed colliders, and the cones as loose bodies drawn where
 * the physics has thrown them.
 */
export function Course({ track }: { track: Track }): JSX.Element {
  const { world, rapier } = useRapier()
  const [cones, setCones] = useState<RigidBody[]>([])
  const mesh = useRef<InstancedMesh>(null)
  useEffect(() => {
    const colliders = buildCourse(rapier, world, track)
    const bodies = buildCones(rapier, world, track)
    setCones(bodies)
    return () => {
      // The world may already be gone (it is freed before its children's
      // cleanup on unmount), and removing from a freed world crashes Rapier.
      for (const c of colliders)
        if (world.colliders.contains(c.handle)) world.removeCollider(c, false)
      for (const b of bodies)
        if (world.bodies.contains(b.handle)) world.removeRigidBody(b)
      setCones([])
    }
  }, [world, rapier, track])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    cones.forEach((body, i) => {
      const p = body.translation()
      const q = body.rotation()
      o.position.set(p.x, p.y, p.z)
      o.quaternion.set(q.x, q.y, q.z, q.w)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      key={cones.length}
      ref={mesh}
      args={[undefined, undefined, cones.length]}
      castShadow
      frustumCulled={false}
    >
      <coneGeometry args={[0.6, 1.4, 12]} />
      <meshStandardMaterial
        color="#ff6a00"
        emissive="#ff4d00"
        emissiveIntensity={0.4}
      />
    </instancedMesh>
  )
}

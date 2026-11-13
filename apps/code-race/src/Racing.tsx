import { useFrame } from '@react-three/fiber'
import { useRef, type JSX } from 'react'
import type { Group, MeshStandardMaterial } from 'three'
import { Car } from './Car.tsx'
import type { Racer } from './lib/racer.ts'
import { MOUNT } from './lib/rig.ts'

/**
 * A car drawn where the physics has put it: body on the chassis, wheels on
 * their springs and turned with the steering, exhaust lit while it boosts.
 */
export function Racing({
  racer,
  colour,
}: {
  racer: Racer
  colour: string
}): JSX.Element {
  const group = useRef<Group>(null)
  const wheels = useRef<(Group | null)[]>([])
  const exhaust = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    const { body, controller } = racer.rig
    const p = body.translation()
    const q = body.rotation()
    group.current?.position.set(p.x, p.y, p.z)
    group.current?.quaternion.set(q.x, q.y, q.z, q.w)
    wheels.current.forEach((g, i) => {
      if (!g) return
      g.position.y = MOUNT - (controller.wheelSuspensionLength(i) ?? 0)
      g.rotation.y = controller.wheelSteering(i) ?? 0
    })
    if (exhaust.current)
      exhaust.current.emissiveIntensity = racer.boost > 0 ? 8 : 0
  })
  return (
    <group ref={group}>
      <Car exhaust={exhaust} wheels={wheels} colour={colour} />
    </group>
  )
}

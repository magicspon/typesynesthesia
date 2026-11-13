import type { JSX, RefObject } from 'react'
import type { Group, MeshStandardMaterial } from 'three'
import { WHEEL_RADIUS, WHEELS } from './lib/rig.ts'

/** How far the drawn body sits below the chassis middle: the physics rides high on its springs. */
const BODY_DROP = -0.85

/** A box part of the car. */
function Part(props: {
  at: [number, number, number]
  size: [number, number, number]
  colour: string
  glow?: number
}): JSX.Element {
  const { at, size, colour, glow = 0 } = props
  return (
    <mesh position={at} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={colour}
        emissive={glow ? colour : '#000'}
        emissiveIntensity={glow}
        metalness={0.35}
        roughness={0.35}
      />
    </mesh>
  )
}

/** The bodywork, nose along +x, sitting on the ground at y = 0. */
function Body({
  exhaust,
  colour,
}: {
  exhaust: RefObject<MeshStandardMaterial | null>
  colour: string
}): JSX.Element {
  return (
    <group position={[0, BODY_DROP, 0]}>
      <Part at={[0.2, 0.55, 0]} size={[3.6, 0.5, 1.5]} colour={colour} />
      <Part at={[2.2, 0.45, 0]} size={[1, 0.3, 1]} colour={colour} />
      <Part at={[2.75, 0.3, 0]} size={[0.4, 0.12, 2.2]} colour="#1d1d24" />
      <Part at={[-0.3, 0.95, 0]} size={[1.2, 0.45, 0.9]} colour="#14213d" />
      <Part at={[-0.5, 1.1, 0]} size={[0.3, 0.6, 0.3]} colour="#f1faee" />
      <Part at={[-1.75, 1.2, 0]} size={[0.5, 0.1, 2.3]} colour={colour} />
      <Part at={[-1.75, 0.9, 0.7]} size={[0.3, 0.6, 0.08]} colour="#1d1d24" />
      <Part at={[-1.75, 0.9, -0.7]} size={[0.3, 0.6, 0.08]} colour="#1d1d24" />
      {/* Headlights and tail lights burn bright enough to bloom. */}
      <Part
        at={[2.7, 0.55, 0.4]}
        size={[0.1, 0.15, 0.3]}
        colour="#fff6d5"
        glow={6}
      />
      <Part
        at={[2.7, 0.55, -0.4]}
        size={[0.1, 0.15, 0.3]}
        colour="#fff6d5"
        glow={6}
      />
      <Part
        at={[-1.95, 0.6, 0.5]}
        size={[0.1, 0.18, 0.35]}
        colour="#ff2a3a"
        glow={4}
      />
      <Part
        at={[-1.95, 0.6, -0.5]}
        size={[0.1, 0.18, 0.35]}
        colour="#ff2a3a"
        glow={4}
      />
      <mesh position={[-2, 0.6, 0]}>
        <boxGeometry args={[0.15, 0.25, 0.4]} />
        <meshStandardMaterial
          ref={exhaust}
          color="#1d1d24"
          emissive="#00f5d4"
          emissiveIntensity={0}
        />
      </mesh>
    </group>
  )
}

/**
 * A small open-wheel racer. `exhaust` is the boost glow's material; `wheels`
 * are the four wheel groups, which the driver moves with the suspension and
 * turns with the steering every frame.
 */
export function Car(props: {
  /** The livery: the bodywork's colour. */
  colour: string
  exhaust: RefObject<MeshStandardMaterial | null>
  wheels: RefObject<(Group | null)[]>
}): JSX.Element {
  return (
    <group>
      <Body exhaust={props.exhaust} colour={props.colour} />
      {WHEELS.map((w, i) => (
        <group
          key={i}
          position={[w.x, 0, w.z]}
          ref={(g) => void (props.wheels.current[i] = g)}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry
              args={[WHEEL_RADIUS, WHEEL_RADIUS, w.front ? 0.35 : 0.5, 18]}
            />
            <meshStandardMaterial color="#121214" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

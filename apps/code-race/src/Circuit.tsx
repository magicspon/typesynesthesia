import { useLayoutEffect, useMemo, type JSX } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { Blocks } from './Blocks.tsx'
import { KERB, postOffset, SHOULDER, SHOULDER_DROP } from './lib/road.ts'
import { PER_STOP, type Sample } from './lib/shape.ts'
import type { Item, Track } from './lib/track.ts'
import {
  checkerTexture,
  chevronTexture,
  kerbTexture,
  ROAD_REPEAT,
  roadTexture,
} from './look.ts'

/** A point on the strip: how far right of the centreline, and how far above the road. */
type Edge = (s: Sample) => readonly [lateral: number, lift: number]

/**
 * A strip between two edges, all round the loop, with `u` across it and `v`
 * along it in units of `ROAD_REPEAT`.
 */
function strip(samples: readonly Sample[], a: Edge, b: Edge): BufferGeometry {
  const n = samples.length + 1
  const pos = new Float32Array(n * 6)
  const uv = new Float32Array(n * 4)
  let along = 0
  for (let i = 0; i < n; i++) {
    // The last row repeats the first, so the texture runs on unbroken.
    const s = samples[i % samples.length]!
    if (i > 0) {
      const p = samples[i - 1]!
      along += Math.hypot(s.x - p.x, s.z - p.z)
    }
    for (const [k, edge] of [a, b].entries()) {
      const [off, lift] = edge(s)
      pos.set([s.x - s.tz * off, s.y + lift, s.z + s.tx * off], i * 6 + k * 3)
      uv.set([k, along / ROAD_REPEAT], i * 4 + k * 2)
    }
  }
  const index: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const p = i * 2
    const q = p + 2
    index.push(p, p + 1, q, p + 1, q + 1, q)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** A checkpoint arch over the road; the one to reach next burns brightest. */
function Gate(props: {
  s: Sample
  start: boolean
  next: boolean
}): JSX.Element {
  const { s, start, next } = props
  const half = postOffset(s)
  const colour = start ? '#ffffff' : next ? '#ffd166' : '#8a7a5a'
  const glow = next ? 4 : start ? 1.2 : 0.4
  const banner = useMemo(() => (start ? checkerTexture() : null), [start])
  return (
    <group
      position={[s.x, s.y, s.z]}
      rotation={[0, -Math.atan2(s.tz, s.tx), 0]}
    >
      {[-half, half].map((z) => (
        <mesh key={z} position={[0, 3, z]} castShadow>
          <boxGeometry args={[0.7, 8, 0.7]} />
          <meshStandardMaterial
            color={colour}
            emissive={colour}
            emissiveIntensity={glow}
          />
        </mesh>
      ))}
      <mesh position={[0, 7.2, 0]} castShadow>
        <boxGeometry args={[0.7, start ? 1.6 : 0.7, half * 2 + 0.7]} />
        {banner ? (
          <meshStandardMaterial map={banner} />
        ) : (
          <meshStandardMaterial
            color={colour}
            emissive={colour}
            emissiveIntensity={glow}
          />
        )}
      </mesh>
    </group>
  )
}

/** A pad on the road (oil or boost), laid along it and tilted with its slope. */
function Thing({ item, s }: { item: Item; s: Sample }): JSX.Element {
  const chevrons = useMemo(
    () => (item.kind === 'boost' ? chevronTexture() : null),
    [item.kind],
  )
  return (
    <group
      position={[item.x, item.y, item.z]}
      rotation={[0, -Math.atan2(s.tz, s.tx), Math.atan(s.grade), 'YZX']}
    >
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[item.reach, 28]} />
        {chevrons ? (
          <meshStandardMaterial
            map={chevrons}
            emissive="#00f5d4"
            emissiveMap={chevrons}
            emissiveIntensity={2.5}
          />
        ) : (
          <meshStandardMaterial
            color="#020205"
            roughness={0.05}
            metalness={0.9}
          />
        )}
      </mesh>
    </group>
  )
}

/** The sample nearest an item, for its slope and heading. */
function nearestIndex(samples: readonly Sample[], item: Item): number {
  let best = 0
  let dist = Infinity
  samples.forEach((s, i) => {
    const d = (s.x - item.x) ** 2 + (s.z - item.z) ** 2
    if (d < dist) {
      dist = d
      best = i
    }
  })
  return best
}

/** The circuit: road, kerbs, gates, what lies on the road, and the town round it. */
export function Circuit({
  track,
  next,
}: {
  track: Track
  next: number
}): JSX.Element {
  const { samples } = track
  const geo = useMemo(() => {
    const w = (s: Sample): number => s.width / 2
    return {
      road: strip(
        samples,
        (s) => [-w(s), 0.02],
        (s) => [w(s), 0.02],
      ),
      left: strip(
        samples,
        (s) => [-w(s) - 1.4, 0.05],
        (s) => [-w(s), 0.12],
      ),
      right: strip(
        samples,
        (s) => [w(s), 0.12],
        (s) => [w(s) + 1.4, 0.05],
      ),
      // Gravel shoulders slope from the kerbs down under the land, the
      // same shape the physics drives on.
      skirtL: strip(
        samples,
        (s) => [-w(s) - KERB - SHOULDER, -SHOULDER_DROP],
        (s) => [-w(s) - KERB, 0.05],
      ),
      skirtR: strip(
        samples,
        (s) => [w(s) + KERB, 0.05],
        (s) => [w(s) + KERB + SHOULDER, -SHOULDER_DROP],
      ),
    }
  }, [samples])
  const tarmac = useMemo(roadTexture, [])
  const kerb = useMemo(kerbTexture, [])
  const things = useMemo(
    () =>
      // Cones are loose bodies in the physics world; `Course` draws them.
      track.items
        .filter((item) => item.kind !== 'cone')
        .map((item) => ({
          item,
          s: samples[nearestIndex(samples, item)]!,
        })),
    [track, samples],
  )
  useLayoutEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      tarmac.dispose()
      kerb.dispose()
    },
    [geo, tarmac, kerb],
  )
  return (
    <group>
      <mesh geometry={geo.road} receiveShadow>
        <meshStandardMaterial map={tarmac} roughness={0.85} />
      </mesh>
      {[geo.left, geo.right].map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial map={kerb} roughness={0.7} />
        </mesh>
      ))}
      {[geo.skirtL, geo.skirtR].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#6b5d52" roughness={1} side={2} />
        </mesh>
      ))}
      {track.files.map((_, i) => (
        <Gate
          key={i}
          s={samples[i * PER_STOP]!}
          start={i === 0}
          next={i === next}
        />
      ))}
      {things.map(({ item, s }, i) => (
        <Thing key={i} item={item} s={s} />
      ))}
      <Blocks track={track} />
    </group>
  )
}

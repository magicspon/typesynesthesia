import { useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Object3D,
  type InstancedMesh,
} from 'three'
import type { Track } from './lib/track.ts'
import type { Look } from './look.ts'

/** The land grid as a lit, vertex-coloured mesh. */
function landGeometry(track: Track, look: Look): BufferGeometry {
  const { ground } = track
  const { n, cell, x0, z0, heights, clear } = ground
  const pos = new Float32Array(n * n * 3)
  const col = new Float32Array(n * n * 3)
  const c = new Color()
  const gravel = new Color('#6b5d52')
  // A loop, not a spread: the grid runs to tens of thousands of points.
  let lo = Infinity
  let hi = -Infinity
  for (const h of heights) {
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
  }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const h = heights[k]!
      pos.set([x0 + i * cell, h, z0 + j * cell], k * 3)
      // Low land is lush, high land dry; a gravel run-off borders the road.
      c.lerpColors(look.grassLow, look.grassHigh, (h - lo) / (hi - lo || 1))
      // A little hashed variation, so the grass is not one flat sheet.
      const jitter = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1
      c.offsetHSL(0, 0, jitter * 0.03)
      if (clear[k]! < 4) c.lerp(gravel, 0.7)
      col.set([c.r, c.g, c.b], k * 3)
    }
  const index = new Uint32Array((n - 1) * (n - 1) * 6)
  let w = 0
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      index.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], w)
      w += 6
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.setIndex(new BufferAttribute(index, 1))
  g.computeVertexNormals()
  return g
}

/** Low-poly trees: a trunk and a cone of leaves each, two instanced draws. */
function Trees({ track }: { track: Track }): JSX.Element {
  const trunks = useRef<InstancedMesh>(null)
  const leaves = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const o = new Object3D()
    const c = new Color()
    track.trees.forEach((t, i) => {
      o.position.set(t.x, t.y + 1.2 * t.scale, t.z)
      o.scale.setScalar(t.scale)
      o.updateMatrix()
      trunks.current?.setMatrixAt(i, o.matrix)
      o.position.y = t.y + 5 * t.scale
      o.updateMatrix()
      leaves.current?.setMatrixAt(i, o.matrix)
      c.setHSL(
        0.27 + ((i * 0.618) % 1) * 0.08,
        0.45,
        0.18 + ((i * 0.37) % 1) * 0.1,
      )
      leaves.current?.setColorAt(i, c)
    })
    for (const m of [trunks.current, leaves.current]) {
      if (!m) continue
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }, [track])
  const count = track.trees.length
  return (
    <>
      <instancedMesh
        ref={trunks}
        args={[undefined, undefined, count]}
        castShadow
      >
        <cylinderGeometry args={[0.35, 0.5, 2.4, 6]} />
        <meshStandardMaterial color="#4a3426" flatShading />
      </instancedMesh>
      <instancedMesh
        ref={leaves}
        args={[undefined, undefined, count]}
        castShadow
      >
        <coneGeometry args={[2.6, 7, 7]} />
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
    </>
  )
}

/** The land round the circuit, and its trees. */
export function Land({
  track,
  look,
}: {
  track: Track
  look: Look
}): JSX.Element {
  const geometry = useMemo(() => landGeometry(track, look), [track, look])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <Trees track={track} />
    </>
  )
}

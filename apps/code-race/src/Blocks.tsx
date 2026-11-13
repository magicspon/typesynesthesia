import { useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import {
  Color,
  MeshStandardMaterial,
  Object3D,
  type InstancedMesh,
} from 'three'
import { blockBox, type Track } from './lib/track.ts'

/** One colour per symbol kind, in `KINDS` order. */
const KIND_COLOURS = [
  '#5fa8d3',
  '#e05d8c',
  '#a06cd5',
  '#6c63d9',
  '#e8b04a',
  '#4fb89a',
  '#4a7fd9',
  '#e88a3a',
].map((c) => new Color(c))

/**
 * A building material whose walls carry lit windows, worked out from world
 * position in the shader: a texture would stretch with each tower's height,
 * and floors must stay one size whatever the tower.
 */
function windowMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorld;\nvarying vec3 vSide;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vSide = normal;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorld;\nvarying vec3 vSide;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Walls only: a roof has an upward normal.
        if (abs(vSide.y) < 0.5) {
          float across = abs(vSide.x) > 0.5 ? vWorld.z : vWorld.x;
          vec2 cell = vec2(across / 1.6, vWorld.y / 2.6);
          vec2 f = fract(cell);
          float pane = step(0.35, f.x) * step(f.x, 0.7) * step(0.4, f.y) * step(f.y, 0.75);
          float lit = step(0.72, fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453));
          totalEmissiveRadiance += pane * lit * vec3(1.0, 0.78, 0.45) * 1.2;
          diffuseColor.rgb *= 1.0 - pane * 0.6;
        }`,
      )
  }
  return m
}

/** Buildings beside the road, one instanced draw. */
export function Blocks({ track }: { track: Track }): JSX.Element {
  const ref = useRef<InstancedMesh>(null)
  const material = useMemo(windowMaterial, [])
  useLayoutEffect(() => () => material.dispose(), [material])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new Object3D()
    track.blocks.forEach((b, i) => {
      const box = blockBox(b)
      o.position.set(box.x, box.y, box.z)
      o.scale.set(box.hx * 2, box.hy * 2, box.hz * 2)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      mesh.setColorAt(i, KIND_COLOURS[b.kind] ?? KIND_COLOURS[0]!)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [track])
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, material, track.blocks.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry />
    </instancedMesh>
  )
}

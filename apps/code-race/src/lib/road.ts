import type { Sample } from './shape.ts'

/** Kerb width beyond the tarmac, each side. */
export const KERB = 1.4
/** How far a gate post stands from the centreline: clear of the shoulder. */
export function postOffset(s: { width: number }): number {
  return s.width / 2 + KERB + SHOULDER + 1
}

/** Gravel shoulder beyond the kerb, sloping down to the land. */
export const SHOULDER = 4
/** How far below the road the shoulder ends, tucked under the land. */
export const SHOULDER_DROP = 0.85

/**
 * The road's cross-section, left to right, as `[lateral, lift]` pairs for a
 * sample: shoulder, kerb, tarmac, kerb, shoulder. The shoulders slope, so a
 * car run wide drives back up onto the road instead of meeting a step.
 */
function crossSection(s: Sample): (readonly [number, number])[] {
  const w = s.width / 2
  return [
    [-w - KERB - SHOULDER, -SHOULDER_DROP],
    [-w - KERB, 0.05],
    [-w, 0.05],
    [w, 0.05],
    [w + KERB, 0.05],
    [w + KERB + SHOULDER, -SHOULDER_DROP],
  ]
}

/**
 * The whole road surface as one closed triangle mesh, for the physics: one
 * ring of cross-section points per sample, stitched to the next.
 */
export function roadMesh(samples: readonly Sample[]): {
  vertices: Float32Array
  indices: Uint32Array
} {
  const cols = crossSection(samples[0]!).length
  const n = samples.length
  const vertices = new Float32Array(n * cols * 3)
  samples.forEach((s, i) =>
    crossSection(s).forEach(([off, lift], k) =>
      vertices.set(
        [s.x - s.tz * off, s.y + lift, s.z + s.tx * off],
        (i * cols + k) * 3,
      ),
    ),
  )
  const indices = new Uint32Array(n * (cols - 1) * 6)
  let w = 0
  for (let i = 0; i < n; i++) {
    const a = i * cols
    const b = ((i + 1) % n) * cols
    for (let k = 0; k < cols - 1; k++) {
      // Wound so the face points up, as the drawn road's does.
      indices.set([a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k], w)
      w += 6
    }
  }
  return { vertices, indices }
}

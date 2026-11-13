import type { Sample } from './shape.ts'

/**
 * The land round the circuit, as a height grid. Beside the road it sits just
 * under the tarmac, so the road is never buried; further off it rolls on its
 * own seeded waves, and past the circuit it climbs into a ring of hills that
 * closes the horizon.
 */
export interface Ground {
  /** World x and z of grid point `(0, 0)`. */
  readonly x0: number
  readonly z0: number
  /** Grid spacing, in world units. */
  readonly cell: number
  /** Grid points per side. */
  readonly n: number
  /** Height at grid point `(i, j)`, at `j * n + i`. */
  readonly heights: Float32Array
  /** Distance from the road's edge at each grid point; negative on the road. */
  readonly clear: Float32Array
}

const CELL = 5
/** Land beyond the circuit's furthest point. */
const MARGIN = 280
/** Over how far the land eases from the road's height to its own. */
const BLEND = 45
/** How far under the road the land beside it sits. */
const SINK = 0.7
/** Side of a bucket of samples, for the nearest-road search. */
const BUCKET = 60

/** A few seeded waves, summed: gentle rolling land. */
function waves(random: () => number): (x: number, z: number) => number {
  const parts = Array.from({ length: 4 }, (_, k) => {
    const angle = random() * Math.PI * 2
    return {
      cx: Math.cos(angle),
      cz: Math.sin(angle),
      freq: (0.004 + random() * 0.01) * (k + 1),
      phase: random() * Math.PI * 2,
      amp: 7 / (k + 1),
    }
  })
  return (x, z) =>
    parts.reduce(
      (h, p) => h + p.amp * Math.sin((x * p.cx + z * p.cz) * p.freq + p.phase),
      0,
    )
}

/** Samples bucketed by position, so a grid point checks only its neighbours. */
function buckets(samples: readonly Sample[]): Map<string, Sample[]> {
  const out = new Map<string, Sample[]>()
  for (const s of samples) {
    const key = `${Math.floor(s.x / BUCKET)},${Math.floor(s.z / BUCKET)}`
    const list = out.get(key)
    if (list) list.push(s)
    else out.set(key, [s])
  }
  return out
}

/** The nearest sample to `(x, z)` within a bucket's reach, or `null`. */
function nearest(
  grid: Map<string, Sample[]>,
  x: number,
  z: number,
): { s: Sample; d: number } | null {
  const bx = Math.floor(x / BUCKET)
  const bz = Math.floor(z / BUCKET)
  let best: { s: Sample; d: number } | null = null
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const s of grid.get(`${bx + i},${bz + j}`) ?? []) {
        const d = Math.hypot(s.x - x, s.z - z)
        if (!best || d < best.d) best = { s, d }
      }
  return best
}

/** Smooth step from `0` at `a` to `1` at `b`. */
function smooth(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The land for a circuit of `samples`. */
export function groundOf(
  samples: readonly Sample[],
  random: () => number,
): Ground {
  const reach = Math.max(...samples.map((s) => Math.hypot(s.x, s.z)))
  const half = reach + MARGIN
  const n = Math.ceil((half * 2) / CELL) + 1
  const x0 = -half
  const z0 = -half
  const heights = new Float32Array(n * n)
  const clear = new Float32Array(n * n)
  const wave = waves(random)
  const grid = buckets(samples)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = x0 + i * CELL
      const z = z0 + j * CELL
      const near = nearest(grid, x, z)
      const edge = near ? near.d - near.s.width / 2 : BUCKET
      // The ring of hills rises beyond the circuit, out of sight of the road.
      const ring = Math.max(0, Math.hypot(x, z) - reach - 60) * 0.4
      const own = wave(x, z) + ring
      const t = near ? smooth(2, BLEND, edge) : 1
      const under = near ? near.s.y - SINK : own
      heights[j * n + i] = under * (1 - t) + own * t
      clear[j * n + i] = edge
    }
  return { x0, z0, cell: CELL, n, heights, clear }
}

/** Bilinear read of a grid field at `(x, z)`, clamped to the grid. */
function read(g: Ground, field: Float32Array, x: number, z: number): number {
  const fx = Math.min(g.n - 1.001, Math.max(0, (x - g.x0) / g.cell))
  const fz = Math.min(g.n - 1.001, Math.max(0, (z - g.z0) / g.cell))
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const u = fx - i
  const v = fz - j
  const at = (a: number, b: number): number => field[(j + b) * g.n + i + a]!
  return (
    (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) +
    (at(0, 1) * (1 - u) + at(1, 1) * u) * v
  )
}

/** Land height at `(x, z)`. */
export function heightAt(g: Ground, x: number, z: number): number {
  return read(g, g.heights, x, z)
}

/** Distance from the road's edge at `(x, z)`, roughly. */
export function clearanceAt(g: Ground, x: number, z: number): number {
  return read(g, g.clear, x, z)
}

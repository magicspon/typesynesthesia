/**
 * The circuit's centreline: a closed loop through one control point per
 * checkpoint, with a wiggle point between each pair. Checkpoints go round in
 * angle order, so the loop is star-shaped round the middle and never crosses
 * itself, however the radii fall.
 */

/** One point on the centreline. */
export interface Sample {
  readonly x: number
  readonly z: number
  /** Unit tangent: the way the race runs. */
  readonly tx: number
  readonly tz: number
  /** Road height here; `0` until the hills are raised. */
  readonly y: number
  /** Rise per unit run along the race: positive climbs. */
  readonly grade: number
  /** Road width here. */
  readonly width: number
  /** The checkpoint whose stretch this is: from its gate to the next one. */
  readonly stop: number
}

/** What the shape needs to know about each checkpoint. */
export interface Knot {
  readonly width: number
  readonly twist: number
}

/** Samples per span between two control points. */
const STEPS = 24
/** Samples in one checkpoint's stretch: a checkpoint span and a wiggle span. */
export const PER_STOP: number = STEPS * 2
/** About how long one checkpoint's stretch is, in world units. */
const STRETCH = 120

/** A point on a centripetal-free (uniform) Catmull–Rom span from `b` to `c`. */
function catmull(
  a: number,
  b: number,
  c: number,
  d: number,
  t: number,
): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3)
  )
}

/** Control points: a checkpoint, then a wiggle, per knot. */
function controls(
  knots: readonly Knot[],
  random: () => number,
): { x: number; z: number }[] {
  const n = knots.length
  const radius = Math.max(90, (n * STRETCH) / (2 * Math.PI))
  const step = (2 * Math.PI) / n
  const out: { x: number; z: number }[] = []
  for (let i = 0; i < n; i++) {
    const at = i * step + (random() - 0.5) * step * 0.4
    const r = radius * (0.7 + 0.5 * random())
    out.push({ x: Math.cos(at) * r, z: Math.sin(at) * r })
    // The wiggle swings in or out by the file's twist, alternating sides so
    // a run of complex files reads as an S-bend rather than a bulge.
    const side = i % 2 === 0 ? 1 : -1
    const mid = (i + 0.5) * step
    const rm = radius * (1 + side * 0.32 * knots[i]!.twist)
    out.push({ x: Math.cos(mid) * rm, z: Math.sin(mid) * rm })
  }
  return out
}

/**
 * The sampled centreline. `knots[i]` is checkpoint `i`; its gate sits at
 * sample `i * 2 * STEPS`, and its stretch runs to the next gate.
 */
export function shapeOf(
  knots: readonly Knot[],
  random: () => number,
): Sample[] {
  const ps = controls(knots, random)
  const m = ps.length
  const n = knots.length
  const points: { x: number; z: number; width: number; stop: number }[] = []
  for (let j = 0; j < m; j++) {
    const [a, b, c, d] = [-1, 0, 1, 2].map((k) => ps[(j + k + m) % m]!)
    const stop = Math.floor(j / 2)
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS
      // Width eases from this gate's to the next gate's across the stretch.
      const along = ((j % 2) + t) / 2
      const width =
        knots[stop]!.width * (1 - along) + knots[(stop + 1) % n]!.width * along
      points.push({
        x: catmull(a!.x, b!.x, c!.x, d!.x, t),
        z: catmull(a!.z, b!.z, c!.z, d!.z, t),
        width,
        stop,
      })
    }
  }
  return points.map((p, i) => {
    const prev = points[(i - 1 + points.length) % points.length]!
    const next = points[(i + 1) % points.length]!
    const dx = next.x - prev.x
    const dz = next.z - prev.z
    const l = Math.hypot(dx, dz) || 1
    return { ...p, y: 0, grade: 0, tx: dx / l, tz: dz / l }
  })
}

/** Where a point is relative to the centreline. */
export interface Fix {
  /** The nearest sample. */
  readonly index: number
  /** Signed distance from the centreline: positive to the right of travel. */
  readonly lateral: number
}

/**
 * The sample nearest `(x, z)`. With a `hint` from the last frame only nearby
 * samples are searched: a car moves a few samples a frame, and a full search
 * could snap to a far stretch that loops close by.
 */
export function locate(
  samples: readonly Sample[],
  x: number,
  z: number,
  hint = -1,
): Fix {
  const count = samples.length
  const window = hint < 0 ? count : Math.min(count, 60)
  const from = hint < 0 ? 0 : hint - window / 2
  let best = 0
  let dist = Infinity
  for (let k = 0; k < window; k++) {
    const i = (((from + k) % count) + count) % count
    const s = samples[i]!
    const d = (s.x - x) ** 2 + (s.z - z) ** 2
    if (d < dist) {
      dist = d
      best = i
    }
  }
  const s = samples[best]!
  // Right of travel, looking down with x right and z down the screen.
  const lateral = (x - s.x) * -s.tz + (z - s.z) * s.tx
  return { index: best, lateral }
}

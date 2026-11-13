import type { FileDatum } from '@tsyn/code-art/atlas'
import { PER_STOP, type Sample } from './shape.ts'

/**
 * Hills: each checkpoint stands as high as its file is big, so a circuit
 * climbs towards the repository's heaviest files and runs down off them.
 * Sizes are log-scaled and spread over the route's own range, so a repo of
 * tiny files still has hills and one huge file does not make a cliff.
 */

/** Height between the route's smallest and biggest files, in world units. */
const RISE = 16
/** Most a stretch rolls up or down between its two gates. */
const ROLL = 4

/** Each checkpoint's height, from its file's size. */
export function heightsOf(files: readonly FileDatum[]): number[] {
  const logs = files.map((f) => Math.log2(1 + f.size))
  const lo = Math.min(...logs)
  const span = Math.max(...logs) - lo
  return logs.map((l) => (span > 0 ? ((l - lo) / span) * RISE : 0))
}

/** Smooth step from `a` at `t = 0` to `b` at `t = 1`, flat at both ends. */
function ease(a: number, b: number, t: number): number {
  return a + (b - a) * (t * t * (3 - 2 * t))
}

/**
 * The samples raised onto hills. Between two gates the road eases from one
 * height to the next, with a seeded roll so a flat run is not dead flat.
 * Gates sit level, so a checkpoint is never on a crest the car leaps.
 */
export function raise(
  samples: readonly Sample[],
  heights: readonly number[],
  random: () => number,
): Sample[] {
  const n = heights.length
  const rolls = heights.map(() => (random() * 2 - 1) * ROLL)
  const ys = samples.map((s, i) => {
    const t = (i - s.stop * PER_STOP) / PER_STOP
    const from = heights[s.stop]!
    const to = heights[(s.stop + 1) % n]!
    return ease(from, to, t) + rolls[s.stop]! * Math.sin(Math.PI * t)
  })
  const count = samples.length
  return samples.map((s, i) => {
    const prev = samples[(i - 1 + count) % count]!
    const next = samples[(i + 1) % count]!
    const run = Math.hypot(next.x - prev.x, next.z - prev.z) || 1
    const rise = ys[(i + 1) % count]! - ys[(i - 1 + count) % count]!
    return { ...s, y: ys[i]!, grade: rise / run }
  })
}

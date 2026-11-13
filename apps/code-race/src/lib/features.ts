import { symbolCount, type FileDatum } from '@tsyn/code-art/atlas'

/**
 * What one file makes of its stretch of track. Every rule is one plain
 * reading of the file, so a driver can learn the code by learning the course:
 * hard-to-change code is narrow, tangled code is twisty, churning hotspots
 * are slick, blind spots are cones in the road and well-used code is fast.
 */
export interface Stretch {
  /** Road width, in world units, at this file's checkpoint. */
  readonly width: number
  /** How far the road wanders on the way to the next checkpoint, `0`–`1`. */
  readonly twist: number
  /** Oil slicks: from fallow's hotspot score. */
  readonly oil: number
  /** Cones: from calls the analysis could not resolve. */
  readonly cones: number
  /** Boost pads: from being one of the route's most-called files. */
  readonly boosts: number
  /** Plain sentences naming why the stretch looks as it does, for the HUD. */
  readonly why: readonly string[]
}

/** Road width for the easiest and hardest code to change. */
const WIDEST = 18
const NARROWEST = 9
/** Width when fallow did not run, between the two. */
const PLAIN_WIDTH = 14

/** Clamps `n` to `[0, 1]`. */
function unit(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Width from maintainability, or the plain width without fallow. */
function widthOf(file: FileDatum): number {
  const m = file.health?.score?.maintainability
  if (m === undefined) return PLAIN_WIDTH
  return NARROWEST + (WIDEST - NARROWEST) * unit(m / 100)
}

/**
 * Twist from cyclomatic complexity, falling back to symbol count without
 * fallow. Log-scaled: a 2,000-branch file should not tie the road in knots.
 */
function twistOf(file: FileDatum): number {
  const complexity = file.health?.score?.cyclomatic ?? symbolCount(file)
  return unit(Math.log2(1 + complexity) / 8)
}

/**
 * The stretch for `file`. `busy` is the callsIn a file needs to earn a boost
 * pad, so pads go to the route's busiest few rather than a fixed number.
 */
export function stretchOf(file: FileDatum, busy: number): Stretch {
  const hotspot = file.health?.hotspot ?? 0
  const oil = hotspot > 0 ? Math.min(3, 1 + Math.floor(hotspot / 34)) : 0
  const cones = Math.min(4, Math.ceil(Math.log2(1 + file.unresolved)))
  const boosts = file.callsIn > 0 && file.callsIn >= busy ? 1 : 0
  const width = widthOf(file)
  const twist = twistOf(file)
  const why: string[] = []
  const m = file.health?.score?.maintainability
  if (m !== undefined && m < 50)
    why.push(`narrow: maintainability ${Math.round(m)}`)
  if (twist > 0.6) why.push('twisty: complex code')
  if (oil) why.push(`oil: hotspot ${Math.round(hotspot)}`)
  if (cones) why.push(`cones: ${file.unresolved} unresolved calls`)
  if (boosts) why.push(`boost: called ${file.callsIn} times`)
  return { width, twist, oil, cones, boosts, why }
}

/** The callsIn that earns a boost: the top quarter of `files`. */
export function busyLine(files: readonly FileDatum[]): number {
  const calls = files.map((f) => f.callsIn).sort((a, b) => b - a)
  return calls[Math.max(0, Math.ceil(calls.length / 4) - 1)] ?? 0
}

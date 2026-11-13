import type { Atlas } from '@tsyn/code-art/atlas'
import { hash, rng } from '@tsyn/code-art/rng'
import { busyLine, stretchOf, type Stretch } from './features.ts'
import { clearanceAt, groundOf, heightAt, type Ground } from './ground.ts'
import { heightsOf, raise } from './hills.ts'
import { routeOf } from './route.ts'
import { PER_STOP, shapeOf, type Sample } from './shape.ts'

/** Something lying on the road. */
export interface Item {
  readonly kind: 'oil' | 'cone' | 'boost'
  readonly x: number
  readonly y: number
  readonly z: number
  /** How close the car must come to touch it. */
  readonly reach: number
  /** The checkpoint whose stretch it lies on. */
  readonly stop: number
}

/** A building beside the road: one per kind of symbol a file declares. */
export interface Block {
  readonly x: number
  /** The land under it. */
  readonly y: number
  readonly z: number
  readonly height: number
  /** Index into `KINDS`, which picks the colour. */
  readonly kind: number
}

/** How far a building sinks into the land, so a slope never shows its base. */
const BLOCK_SINK = 3

/** A building's box: its middle and half-extents, shared by drawing and physics. */
export function blockBox(b: Block): {
  x: number
  y: number
  z: number
  hx: number
  hy: number
  hz: number
} {
  // Footprint from the height, so tall towers are not needles.
  const half = (5 + b.height * 0.15) / 2
  const hy = (b.height + BLOCK_SINK) / 2
  return { x: b.x, y: b.y + b.height - hy, z: b.z, hx: half, hy, hz: half }
}

/** A tree on open land; its trunk is solid. */
export interface Tree {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly scale: number
}

/** A playable circuit, made from one repository. */
export interface Track {
  /** The repository's name, which seeds every random choice. */
  readonly name: string
  /** Checkpoint `i` is `atlas.files[files[i]]`. */
  readonly files: readonly number[]
  readonly stretches: readonly Stretch[]
  readonly samples: readonly Sample[]
  readonly items: readonly Item[]
  readonly blocks: readonly Block[]
  readonly ground: Ground
  readonly trees: readonly Tree[]
}

/** Most buildings drawn, whatever the repository's size. */
const MOST_BLOCKS = 1500
/** Trees tried; those that land near the road or a building are dropped. */
const TREE_TRIES = 1400

/** A point `lateral` units right of sample `s`, at the road's height. */
function beside(
  s: Sample,
  lateral: number,
): { x: number; y: number; z: number } {
  return { x: s.x - s.tz * lateral, y: s.y, z: s.z + s.tx * lateral }
}

/** Places `count` of `kind` at random along stop `stop`'s stretch. */
function scatter(
  out: Item[],
  samples: readonly Sample[],
  stop: number,
  count: number,
  kind: Item['kind'],
  random: () => number,
): void {
  const reach = kind === 'cone' ? 1.2 : kind === 'oil' ? 3 : 2.6
  for (let k = 0; k < count; k++) {
    // Clear of both gates, so a checkpoint is never blocked.
    const at = stop * PER_STOP + Math.floor((0.2 + 0.65 * random()) * PER_STOP)
    const s = samples[at % samples.length]!
    // Boosts sit in the middle; the rest anywhere a car could hit them.
    const spread = kind === 'boost' ? 0 : (random() - 0.5) * s.width * 0.7
    out.push({ kind, reach, stop, ...beside(s, spread) })
  }
}

/** Buildings for one file: a few per symbol kind, taller for more symbols. */
function buildings(
  out: Omit<Block, 'y'>[],
  samples: readonly Sample[],
  stop: number,
  kinds: readonly number[],
  random: () => number,
): void {
  kinds.forEach((count, kind) => {
    for (let k = 0; k < Math.ceil(Math.log2(1 + count)); k++) {
      const s = samples[stop * PER_STOP + Math.floor(random() * PER_STOP)]!
      const side = random() < 0.5 ? -1 : 1
      const { x, z } = beside(s, side * (s.width / 2 + 9 + random() * 30))
      const height = 4 + 3 * Math.log2(1 + count) * (0.6 + random() * 0.8)
      out.push({ kind, height, x, z })
    }
  })
}

/** Trees scattered over open land, clear of the road and the buildings. */
function forest(
  ground: Ground,
  blocks: readonly Block[],
  random: () => number,
): Tree[] {
  const span = ground.cell * (ground.n - 1)
  const out: Tree[] = []
  for (let k = 0; k < TREE_TRIES; k++) {
    const x = ground.x0 + random() * span
    const z = ground.z0 + random() * span
    const scale = 0.7 + random() * 0.9
    if (clearanceAt(ground, x, z) < 7) continue
    if (blocks.some((b) => Math.abs(b.x - x) < 6 && Math.abs(b.z - z) < 6))
      continue
    out.push({ x, z, y: heightAt(ground, x, z), scale })
  }
  return out
}

/**
 * The circuit for `atlas`, or `null` when it has no source files to race
 * through. The same atlas always makes the same circuit.
 */
export function trackOf(atlas: Atlas): Track | null {
  const files = routeOf(atlas)
  if (files.length === 0) return null
  const random = rng(hash(atlas.name))
  const data = files.map((i) => atlas.files[i]!)
  const busy = busyLine(data)
  const heights = heightsOf(data)
  const stretches = data.map((f, i) => {
    const s = stretchOf(f, busy)
    const next = heights[(i + 1) % data.length]! - heights[i]!
    const hill =
      next > 8
        ? ['uphill: the next file is bigger']
        : next < -8
          ? ['downhill: the next file is smaller']
          : []
    return { ...s, why: [...s.why, ...hill] }
  })
  const samples = raise(shapeOf(stretches, random), heights, random)
  const ground = groundOf(samples, random)
  const items: Item[] = []
  const placed: Omit<Block, 'y'>[] = []
  stretches.forEach((s, stop) => {
    scatter(items, samples, stop, s.boosts, 'boost', random)
    scatter(items, samples, stop, s.oil, 'oil', random)
    scatter(items, samples, stop, s.cones, 'cone', random)
    buildings(placed, samples, stop, data[stop]!.kinds, random)
  })
  // Buildings that land on the road, on another stretch, are cleared away.
  const blocks = placed
    .filter((b) => clearanceAt(ground, b.x, b.z) > 5)
    .slice(0, MOST_BLOCKS)
    .map((b) => ({ ...b, y: heightAt(ground, b.x, b.z) }))
  const trees = forest(ground, blocks, random)
  return {
    name: atlas.name,
    files,
    stretches,
    samples,
    items,
    blocks,
    ground,
    trees,
  }
}

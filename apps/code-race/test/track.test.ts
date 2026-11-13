import type { Atlas, FileDatum } from '@tsyn/code-art/atlas'
import { describe, expect, it } from 'vitest'
import { stretchOf } from '../src/lib/features.ts'
import { routeOf, stopsFor } from '../src/lib/route.ts'
import { heightAt } from '../src/lib/ground.ts'
import { locate, PER_STOP } from '../src/lib/shape.ts'
import { trackOf } from '../src/lib/track.ts'

/** A file with sensible zeros, overridden where a test cares. */
function file(path: string, over: Partial<FileDatum> = {}): FileDatum {
  return {
    path,
    size: 1000,
    kinds: [1, 0, 0, 0, 0, 0, 0, 0],
    role: 0,
    generated: false,
    project: 0,
    callsIn: 0,
    callsOut: 0,
    callsSelf: 0,
    refsIn: 0,
    unresolved: 0,
    ...over,
  }
}

/** A chain of files: the hub calls one, which calls two, and so on. */
function chain(): Atlas {
  return {
    name: 'chain',
    commit: 'abc',
    analysedAt: '',
    projects: [],
    files: [
      file('src/hub.ts', { callsIn: 50 }),
      file('src/one.ts', { callsIn: 5 }),
      file('src/two.ts', { callsIn: 3, unresolved: 7 }),
      file('src/three.ts'),
      file('src/four.ts'),
      file('src/five.ts'),
      file('src/hub.test.ts', { role: 1, callsIn: 99 }),
      file('src/gen.ts', { generated: true, callsIn: 99 }),
    ],
    calls: [
      [0, 1, 10],
      [1, 2, 8],
      [2, 3, 4],
      [0, 6, 50],
    ],
    imports: [],
  }
}

describe('routeOf', () => {
  it('starts at the most-called source file and follows the heaviest calls', () => {
    const route = routeOf(chain())
    expect(route.slice(0, 4)).toEqual([0, 1, 2, 3])
  })

  it('keeps tests and generated files off the track', () => {
    const route = routeOf(chain())
    expect(route).not.toContain(6)
    expect(route).not.toContain(7)
    expect(route).toHaveLength(6)
  })

  it('caps the checkpoints for a large repository', () => {
    expect(stopsFor(10_000)).toBe(14)
    expect(stopsFor(3)).toBe(3)
  })
})

describe('stretchOf', () => {
  it('turns blind spots into cones and busy files into boosts', () => {
    const s = stretchOf(file('a.ts', { unresolved: 7, callsIn: 9 }), 9)
    expect(s.cones).toBe(3)
    expect(s.boosts).toBe(1)
    expect(s.oil).toBe(0)
  })

  it('narrows hard-to-change code and oils hotspots', () => {
    const health = {
      hotspot: 80,
      commits: 12,
      trend: 1,
      duplicated: 0,
      cyclic: false,
      score: {
        maintainability: 20,
        density: 0,
        cyclomatic: 4,
        cognitive: 0,
        crap: 0,
      },
    }
    const s = stretchOf(file('a.ts', { health }), Infinity)
    expect(s.width).toBeLessThan(12)
    expect(s.oil).toBe(3)
    expect(s.why.join(' ')).toMatch(/maintainability 20/)
  })
})

describe('trackOf', () => {
  it('is the same circuit every time for the same repository', () => {
    expect(trackOf(chain())).toEqual(trackOf(chain()))
  })

  it('puts each gate at the start of its stretch', () => {
    const track = trackOf(chain())!
    expect(track.samples).toHaveLength(track.files.length * PER_STOP)
    track.files.forEach((_, i) =>
      expect(track.samples[i * PER_STOP]!.stop).toBe(i),
    )
    expect(track.items.filter((i) => i.kind === 'cone')).toHaveLength(3)
  })

  it('raises each gate to its file size, and the land never over the road', () => {
    const atlas = chain()
    const big = {
      ...atlas,
      files: atlas.files.map((f, i) => (i === 2 ? { ...f, size: 90_000 } : f)),
    }
    const track = trackOf(big)!
    const gate = (i: number): number => track.samples[i * PER_STOP]!.y
    expect(gate(2)).toBeGreaterThan(gate(0) + 10)
    for (const s of track.samples)
      expect(heightAt(track.ground, s.x, s.z)).toBeLessThan(s.y)
  })

  it('has no circuit without source files', () => {
    const atlas = chain()
    expect(trackOf({ ...atlas, files: [atlas.files[6]!] })).toBeNull()
  })

  it('locates a point beside the road on the right side', () => {
    const { samples } = trackOf(chain())!
    const s = samples[10]!
    const fix = locate(samples, s.x - s.tz * 3, s.z + s.tx * 3)
    expect(fix.index).toBe(10)
    expect(fix.lateral).toBeCloseTo(3)
  })
})

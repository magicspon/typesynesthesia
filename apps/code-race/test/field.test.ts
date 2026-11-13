import type { Atlas, FileDatum } from '@tsyn/code-art/atlas'
import { describe, expect, it } from 'vitest'
import { go, newRace, pass } from '../src/lib/race.ts'
import { rivalsOf } from '../src/lib/rivals.ts'
import { PER_STOP } from '../src/lib/shape.ts'
import {
  distanceOf,
  ordinal,
  standingsOf,
  type Entrant,
} from '../src/lib/standings.ts'

/** A file in project `project`, with sensible zeros. */
function file(
  path: string,
  project: number,
  over: Partial<FileDatum> = {},
): FileDatum {
  return {
    path,
    size: 1000,
    kinds: [1, 0, 0, 0, 0, 0, 0, 0],
    role: 0,
    generated: false,
    project,
    callsIn: 0,
    callsOut: 10,
    callsSelf: 0,
    refsIn: 0,
    unresolved: 0,
    ...over,
  }
}

/** Three packages: a big clean one, a mid one full of blind spots, and one too small to race. */
function repo(): Atlas {
  return {
    name: 'repo',
    commit: 'abc',
    analysedAt: '',
    projects: [
      'packages/core/tsconfig.json',
      'packages/cli/tsconfig.json',
      'tiny/tsconfig.json',
    ],
    files: [
      ...Array.from({ length: 5 }, (_, i) => file(`packages/core/${i}.ts`, 0)),
      ...Array.from({ length: 4 }, (_, i) =>
        file(`packages/cli/${i}.ts`, 1, { unresolved: 10 }),
      ),
      file('packages/cli/a.test.ts', 1),
      file('tiny/one.ts', 2),
    ],
    calls: [],
    imports: [],
  }
}

describe('rivalsOf', () => {
  it('enters the biggest packages, named after their folders', () => {
    expect(rivalsOf(repo()).map((r) => r.name)).toEqual(['core', 'cli'])
  })

  it('gives clean code more pace than code full of blind spots', () => {
    const [core, cli] = rivalsOf(repo())
    expect(core!.pace).toBeGreaterThan(cli!.pace)
    expect(cli!.why).toMatch(/50% of calls resolved/)
  })
})

/** An entrant at sample `index` with `race`. */
function entrant(name: string, race = go(newRace(4), 0), index = 4): Entrant {
  return { name, colour: '#fff', player: false, race, index }
}

describe('standings', () => {
  const samples = 4 * PER_STOP

  it('puts a car further round ahead, and one behind the line behind', () => {
    const behind = entrant('behind', undefined, samples - 4)
    const off = entrant('off', undefined, 10)
    const on = entrant('on', pass(go(newRace(4), 0), 1, 3), PER_STOP + 2)
    expect(distanceOf(behind, samples)).toBeLessThan(0)
    expect(standingsOf([behind, off, on], samples).map((e) => e.name)).toEqual([
      'on',
      'off',
      'behind',
    ])
  })

  it('ranks finishers by time, ahead of everyone still racing', () => {
    const slow = entrant('slow', { ...go(newRace(4), 0), finished: 90 })
    const quick = entrant('quick', { ...go(newRace(4), 0), finished: 80 })
    const racing = entrant('racing', { ...go(newRace(4), 0), lap: 2 })
    expect(
      standingsOf([racing, slow, quick], samples).map((e) => e.name),
    ).toEqual(['quick', 'slow', 'racing'])
  })

  it('names places as a race does', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
    ])
  })
})

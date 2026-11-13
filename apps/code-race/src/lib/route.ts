import { isTest, type Atlas } from '@tsyn/code-art/atlas'

/**
 * The files a circuit visits, in race order.
 *
 * The race starts at the most-called file and follows the heaviest call out
 * of each file to one not yet visited, so the track is a real tour of how the
 * code talks to itself. Where the calls run dry it jumps to the busiest file
 * left. Tests and generated files stay off the track: the tour is of the
 * source.
 */

/** How many checkpoints a circuit has, at most and at least. */
const MOST = 14
const LEAST = 6

/** How many checkpoints suit a repository of `files` source files. */
export function stopsFor(files: number): number {
  return Math.min(MOST, Math.max(LEAST, Math.round(Math.sqrt(files))), files)
}

/** How busy a file is: every way other code touches it. */
function traffic(atlas: Atlas, file: number): number {
  const f = atlas.files[file]!
  return f.callsIn + f.callsOut + f.refsIn
}

/** Call weight between source files, both directions, as a neighbour map. */
function neighbours(
  atlas: Atlas,
  usable: ReadonlySet<number>,
): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>()
  const add = (a: number, b: number, w: number): void => {
    const row = out.get(a) ?? new Map<number, number>()
    row.set(b, (row.get(b) ?? 0) + w)
    out.set(a, row)
  }
  for (const [from, to, count] of atlas.calls) {
    if (from === to || !usable.has(from) || !usable.has(to)) continue
    add(from, to, count)
    add(to, from, count)
  }
  return out
}

/** The heaviest-linked unvisited neighbour of `at`, or `-1`. */
function nextAlong(
  links: Map<number, Map<number, number>>,
  at: number,
  seen: ReadonlySet<number>,
): number {
  let best = -1
  let weight = 0
  for (const [peer, w] of links.get(at) ?? []) {
    // Ties go to the lower index, so the route never depends on map order.
    if (seen.has(peer) || w < weight || (w === weight && peer > best)) continue
    best = peer
    weight = w
  }
  return best
}

/**
 * The circuit's files, as indexes into `atlas.files`, starting from the
 * most-called one. Empty only when the repository has no source files.
 */
export function routeOf(atlas: Atlas): number[] {
  const usable = atlas.files
    .map((f, i) => (isTest(f) || f.generated ? -1 : i))
    .filter((i) => i >= 0)
  if (usable.length === 0) return []
  // Busiest first; ties by path, so the order is stable.
  const ranked = [...usable].sort(
    (a, b) =>
      traffic(atlas, b) - traffic(atlas, a) ||
      atlas.files[a]!.path.localeCompare(atlas.files[b]!.path),
  )
  const links = neighbours(atlas, new Set(usable))
  const start = [...usable].sort(
    (a, b) => atlas.files[b]!.callsIn - atlas.files[a]!.callsIn || a - b,
  )[0]!
  const route = [start]
  const seen = new Set(route)
  const want = stopsFor(usable.length)
  while (route.length < want) {
    let next = nextAlong(links, route.at(-1)!, seen)
    if (next < 0) next = ranked.find((i) => !seen.has(i)) ?? -1
    if (next < 0) break
    route.push(next)
    seen.add(next)
  }
  return route
}

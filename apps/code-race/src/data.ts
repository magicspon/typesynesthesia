import type { Atlas, Timeline } from '@tsyn/code-art/atlas'

/**
 * The repositories a race can be held in: code-art's exported datasets, read
 * as bundle chunks rather than requests so the game holds no network code
 * (ADR 0011). Symbol-name files are not datasets and are left out.
 *
 * TODO(WP-race-cli): read datasets `tsyn race` writes into the page, as
 * code-art's `embed` build does.
 */
const modules = import.meta.glob<{ default: Atlas | Timeline }>([
  '../../code-art/src/data/*.json',
  '!../../code-art/src/data/*.symbols.json',
])

const loaders = Object.fromEntries(
  Object.entries(modules).map(([path, load]) => [
    path.replace(/^.*\/(.+)\.json$/, '$1'),
    load,
  ]),
)

/** Dataset names, sorted. */
export const DATASETS: readonly string[] = Object.keys(loaders).sort()

/** Loads one dataset; a history races on its latest commit. */
export async function loadAtlas(name: string): Promise<Atlas> {
  const load = loaders[name]
  if (!load) throw new Error(`no dataset named ${name}`)
  const data = (await load()).default
  return 'frames' in data ? data.frames.at(-1)! : data
}

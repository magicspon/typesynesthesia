import { isTest, type Atlas, type FileDatum } from '@tsyn/code-art/atlas'

/**
 * The other cars: the repository's own biggest packages (each tsconfig
 * project), racing on their code's quality. Easy-to-change code drives a
 * faster, cleaner line; where fallow did not run, a package whose calls all
 * resolve is quicker than one full of blind spots.
 */
export interface Rival {
  /** The package's folder name, or the repository's for the root project. */
  readonly name: string
  readonly colour: string
  /** Share of the car's top speed this driver will use, `0`–`1`. */
  readonly pace: number
  /** Plain sentence naming why it drives as it does. */
  readonly why: string
}

/** Most rivals on the grid, and the files a package needs to enter. */
const MOST = 5
const FEWEST_FILES = 3
/** Slowest and fastest pace a rival can have. */
const SLOW = 0.88
const FAST = 1
/** One livery each, in grid order; none is the player's red. */
const LIVERIES = ['#4cc9f0', '#ffd166', '#06d6a0', '#b388ff', '#f8961e']

/** A project's display name: the folder its tsconfig sits in. */
function nameOf(atlas: Atlas, project: number): string {
  const parts = (atlas.projects[project] ?? '').split('/').slice(0, -1)
  return parts.at(-1) ?? atlas.name
}

/** How good a package's code is, `0`–`1`, and the reading behind it. */
function qualityOf(files: readonly FileDatum[]): {
  score: number
  why: string
} {
  const scored = files.flatMap((f) => {
    const m = f.health?.score?.maintainability
    return m === undefined ? [] : [m]
  })
  if (scored.length > 0) {
    const mean = scored.reduce((a, b) => a + b, 0) / scored.length
    return { score: mean / 100, why: `maintainability ${Math.round(mean)}` }
  }
  const made = files.reduce((n, f) => n + f.callsOut + f.unresolved, 0)
  const blind = files.reduce((n, f) => n + f.unresolved, 0)
  const resolved = made > 0 ? 1 - blind / made : 1
  return {
    score: resolved,
    why: `${Math.round(resolved * 100)}% of calls resolved`,
  }
}

/** The rivals for `atlas`, biggest package first. Empty for a single-package repo. */
export function rivalsOf(atlas: Atlas): Rival[] {
  const byProject = new Map<number, FileDatum[]>()
  for (const f of atlas.files) {
    if (f.project < 0 || f.generated || isTest(f)) continue
    byProject.set(f.project, [...(byProject.get(f.project) ?? []), f])
  }
  const entrants = [...byProject]
    .filter(([, files]) => files.length >= FEWEST_FILES)
    // Biggest first; ties by name, so the grid is stable.
    .sort(
      ([a, fa], [b, fb]) =>
        fb.length - fa.length ||
        nameOf(atlas, a).localeCompare(nameOf(atlas, b)),
    )
    .slice(0, MOST)
  return entrants.map(([project, files], i) => {
    const { score, why } = qualityOf(files)
    return {
      name: nameOf(atlas, project),
      colour: LIVERIES[i % LIVERIES.length]!,
      pace: SLOW + (FAST - SLOW) * Math.min(1, Math.max(0, score)),
      why,
    }
  })
}

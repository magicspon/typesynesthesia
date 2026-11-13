/**
 * What `tsyn art` and `tsyn song` both start from: the repository
 * analysed through the CLI binding, and where its index now sits.
 */

import { basename, join } from 'node:path'

import { findRepositoryRoot } from '@tsyn/core'

import { run } from './main.ts'

/** An analysed repository: its root, its name, and its index database. */
export interface Indexed {
  readonly root: string
  readonly name: string
  readonly db: string
}

/** Analyses `dir` through the CLI binding; throws when it could not. */
export function analyseAt(dir: string): void {
  const outcome = run(['analyse', '--cwd', dir])
  if (outcome.code === 2) throw new Error(outcome.stderr || 'analyse failed')
}

/**
 * Brings the index for the repository holding `cwd` up to date, and says
 * where it is. The repository is named after its root folder, as the art's
 * datasets and the song files are.
 */
export function indexRepository(cwd: string): Indexed {
  analyseAt(cwd)
  const root = findRepositoryRoot(cwd)
  return { root, name: basename(root), db: join(root, '.tsyn', 'index.db') }
}

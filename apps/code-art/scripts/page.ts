/**
 * The page `tsyn art` writes: the embed build of the viewer with every
 * dataset inlined, so it opens from disk and makes no request (ADR 0011).
 */

import type { Atlas, SymbolNames, Timeline } from '../src/lib/atlas.ts'

/** Where the embed build leaves room for the data; see `index.html`. */
const MARKER = '<!-- tsyn-art:data -->'

/** `&` and `"` would end or garble the attribute a name sits in. */
function attribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

/**
 * One inline JSON block. `<` is escaped so no string in the data can close
 * the script tag; `<` reads back as the same character.
 */
function block(
  kind: 'dataset' | 'symbols',
  name: string,
  data: Atlas | Timeline | SymbolNames,
): string {
  const json = JSON.stringify(data).replaceAll('<', '\\u003c')
  return `<script type="application/json" data-${kind}="${attribute(name)}">${json}</script>`
}

/** Where a page opens: one dataset, in one of the viewer's scenes. */
export interface Start {
  readonly dataset: string
  /** The viewer's name for it: `galaxy`, `metro` or `terrain`. */
  readonly scene: string
}

/**
 * A script that sends a page opened with no route to `start`. The embed
 * build routes by the hash, and an inline classic script runs before the
 * viewer's module, so the router reads the route already set. A hash the
 * reader typed or bookmarked is left alone.
 */
function opening(start: Start): string {
  // The galaxy is the viewer's default scene, so it needs no search.
  const search = start.scene === 'galaxy' ? '' : `?scene=${start.scene}`
  const hash = `#/${encodeURIComponent(start.dataset)}${search}`
  const json = JSON.stringify(hash).replaceAll('<', '\\u003c')
  return `<script>if(!location.hash)location.hash=${json}</script>`
}

/**
 * The viewer with `datasets` written in, by name, and each repository's
 * symbol names in blocks of their own, which the viewer parses only when a
 * file is picked. With `start`, the page opens on that dataset and scene
 * rather than on the list of datasets. Throws when `viewer` is not the embed
 * build, which is the only one with the marker.
 */
export function artPage(
  viewer: string,
  datasets: Readonly<Record<string, Atlas | Timeline>>,
  symbols: Readonly<Record<string, SymbolNames>> = {},
  start?: Start,
): string {
  if (!viewer.includes(MARKER)) {
    throw new Error('not the embed build of the viewer: no data marker')
  }
  const blocks = [
    ...Object.entries(datasets).map(([name, data]) =>
      block('dataset', name, data),
    ),
    ...Object.entries(symbols).map(([name, names]) =>
      block('symbols', name, names),
    ),
    ...(start ? [opening(start)] : []),
  ]
  // A function, so a `$` in the data is not read as a pattern.
  return viewer.replace(MARKER, () => blocks.join('\n'))
}

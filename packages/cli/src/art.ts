/**
 * `tsyn art`: the index drawn as interactive 3D art, written to
 * `.tsyn/art/index.html`, or to `<scene>.html` for a page that opens on
 * one scene: `galaxy`, `city` or `landscape`.
 *
 * Not an operation, like `mcp`: it answers no question, so it owes no envelope
 * and takes its own flags without touching ADR 0006's closed global set. It
 * runs `analyse` through the same binding as the command line, and draws
 * fallow's readings rather than computing any of its own (ADR 0012).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import {
  artPage,
  buildTimeline,
  readNames,
  snapshot,
  type Atlas,
  type SymbolNames,
  type Timeline,
} from '@tsyn/code-art/pipeline'

import { analyseAt, indexRepository } from './repository.ts'

/**
 * The scenes a page can open on, by the name the command line uses, mapped to
 * the viewer's own name for each. The viewer still offers all three.
 */
const SCENES = {
  galaxy: 'galaxy',
  city: 'metro',
  landscape: 'terrain',
} as const

/** A scene as the command line names it. */
export type Scene = keyof typeof SCENES

const isScene = (name: string): name is Scene => Object.hasOwn(SCENES, name)

/** A resolved `tsyn art` command line. */
export interface ArtOptions {
  readonly cwd: string
  /** The scene the page opens on, or `null` for the viewer's default page. */
  readonly scene: Scene | null
  /** Commits in the timeline, or `null` for the snapshot alone. */
  readonly frames: number | null
  readonly fallow: boolean
}

/** What `tsyn art` reads and writes through, so a test can stand in for both. */
export interface ArtIo {
  /** The embed build of the viewer; the build copies it beside `bin.js`. */
  readonly viewer: string
  readonly log: (line: string) => void
}

const DEFAULT_IO: ArtIo = {
  viewer: join(import.meta.dirname, 'art', 'viewer.html'),
  log: (line) => process.stderr.write(`${line}\n`),
}

/** The help for `tsyn art`, which is also what a bad command line prints. */
const ART_USAGE: string = [
  'tsyn art [galaxy|city|landscape] [--frames <n>] [--no-fallow] [--cwd <path>]',
  '',
  'Writes .tsyn/art/index.html: the index drawn as a 3D galaxy, city and',
  'landscape. Name a scene to write .tsyn/art/<scene>.html, which opens on it.',
  'Open it in a browser. It makes no network request.',
  '',
  '  --frames <n>   also replay <n> commits of history (2 or more)',
  '  --no-fallow    skip the health readings fallow would add',
  '  --cwd <path>   run against another directory',
].join('\n')

/** Reads `argv`, or says what is wrong with it. */
export function parseArt(
  argv: readonly string[],
  cwd: string = process.cwd(),
): { readonly options: ArtOptions } | { readonly error: string } {
  let values
  let positionals
  try {
    ;({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        frames: { type: 'string' },
        'no-fallow': { type: 'boolean' },
        cwd: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }))
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  if (values.help === true) return { error: '' }
  const [scene, ...extra] = positionals
  if (extra.length > 0)
    return { error: `one scene at most, not ${positionals.join(' ')}` }
  if (scene !== undefined && !isScene(scene)) {
    return {
      error: `unknown scene ${scene}; one of ${Object.keys(SCENES).join(', ')}`,
    }
  }
  const frames = values.frames === undefined ? null : Number(values.frames)
  // One commit is the snapshot again; a timeline needs somewhere to move.
  if (frames !== null && (!Number.isInteger(frames) || frames < 2)) {
    return {
      error: `--frames must be a whole number of 2 or more, not ${values.frames}`,
    }
  }
  return {
    options: {
      cwd: values.cwd ?? cwd,
      scene: scene ?? null,
      frames,
      fallow: values['no-fallow'] !== true,
    },
  }
}

/** Symbol names sit beside the datasets, under this suffix. */
const SYMBOLS = '.symbols.json'

/** Every JSON file in `dir` that `keep` accepts, parsed, by name less `suffix`. */
function readAll<T>(
  dir: string,
  suffix: string,
  keep: (file: string) => boolean,
): Record<string, T> {
  const files = readdirSync(dir).filter((file) => file.endsWith(suffix))
  return Object.fromEntries(
    files
      .filter(keep)
      .sort()
      .map((file) => [
        file.slice(0, -suffix.length),
        JSON.parse(readFileSync(join(dir, file), 'utf8')) as T,
      ]),
  )
}

/**
 * Every dataset written so far, by name. Kept between runs, so a later run
 * without `--frames` still shows the timeline an earlier one built.
 */
function datasets(dir: string): Record<string, Atlas | Timeline> {
  return readAll(dir, '.json', (file) => !file.endsWith(SYMBOLS))
}

/** Every repository's symbol names written so far, by repository name. */
function symbolSets(dir: string): Record<string, SymbolNames> {
  return readAll(dir, SYMBOLS, () => true)
}

/** Writes the art for `options`, and returns the page's path. */
export function writeArt(options: ArtOptions, io: ArtIo): string {
  if (!existsSync(io.viewer)) {
    throw new Error(
      `no viewer at ${io.viewer}; this build of tsyn is missing it`,
    )
  }
  const { root, name, db } = indexRepository(options.cwd)
  const out = join(root, '.tsyn', 'art')
  const data = join(out, 'data')
  mkdirSync(data, { recursive: true })

  const atlas = snapshot(db, {
    name,
    fallow: options.fallow,
  })
  writeFileSync(join(data, `${name}.json`), JSON.stringify(atlas))
  writeFileSync(join(data, `${name}${SYMBOLS}`), JSON.stringify(readNames(db)))
  io.log(
    `${name}: ${atlas.files.length} files, ${atlas.calls.length} call links`,
  )

  if (options.frames !== null) {
    const timeline = buildTimeline({
      repo: root,
      name,
      frames: options.frames,
      fallow: options.fallow,
      cacheDir: join(out, 'cache'),
      analyse: analyseAt,
      log: io.log,
    })
    writeFileSync(join(data, `${name}.timeline.json`), JSON.stringify(timeline))
  }

  const page = join(out, `${options.scene ?? 'index'}.html`)
  const viewer = readFileSync(io.viewer, 'utf8')
  // The history where one was asked for, so the scene opens playing it.
  const start =
    options.scene === null
      ? undefined
      : {
          dataset: options.frames === null ? name : `${name}.timeline`,
          scene: SCENES[options.scene],
        }
  writeFileSync(page, artPage(viewer, datasets(data), symbolSets(data), start))
  return page
}

/**
 * Runs `tsyn art` and returns its exit code: 0 written, 2 could not be.
 * Progress goes to stderr and the page's path to stdout, so a script can
 * open what it made.
 */
export function art(argv: readonly string[], io: ArtIo = DEFAULT_IO): number {
  const parsed = parseArt(argv)
  if ('error' in parsed) {
    // An empty error is `--help`: asked for, so it is the answer and not a failure.
    if (parsed.error === '') {
      process.stdout.write(`${ART_USAGE}\n`)
      return 0
    }
    io.log(`${parsed.error}\n\n${ART_USAGE}`)
    return 2
  }
  try {
    const page = writeArt(parsed.options, io)
    process.stdout.write(`${page}\n`)
    return 0
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))
    return 2
  }
}

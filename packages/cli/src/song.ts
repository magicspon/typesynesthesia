/**
 * `tsyn song`: the repository played as music by CodeSong, written as an
 * MP3, a WAV or a MIDI file.
 *
 * Not an operation, like `art`: it answers no question, so it owes no
 * envelope and takes its own flags. The composition comes from the same
 * snapshot `art` draws, so the song and the art describe the same index.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { snapshot } from '@tsyn/code-art/pipeline'
import {
  analyse as regions,
  compose,
  DEFAULT_OPTIONS,
  GENRE_NAMES,
  GENRES,
  readStructure,
  realise,
  renderAudio,
  toMidi,
  toMp3,
  toWav,
  type GenreName,
} from '@tsyn/codesong'

import { indexRepository } from './repository.ts'

/** The file types a song can be written as. */
const FORMATS = ['mp3', 'wav', 'mid'] as const
type Format = (typeof FORMATS)[number]

const isFormat = (name: string): name is Format =>
  (FORMATS as readonly string[]).includes(name)

/** A resolved `tsyn song` command line. */
export interface SongOptions {
  readonly cwd: string
  /** A genre, or `auto` for the one the code suggests. */
  readonly genre: GenreName | 'auto'
  readonly format: Format
  /** Where to write, as typed; `null` for `.tsyn/song/<name>.<genre>.<format>`. */
  readonly out: string | null
  readonly seed: number
  /** Also write the MIDI beside an MP3 or WAV, for a music program. */
  readonly midi: boolean
}

/** What `tsyn song` writes through, so a test can watch it. */
export interface SongIo {
  readonly log: (line: string) => void
}

const DEFAULT_IO: SongIo = {
  log: (line) => process.stderr.write(`${line}\n`),
}

/** The help for `tsyn song`, which is also what a bad command line prints. */
const SONG_USAGE: string = [
  'tsyn song [--genre <name>] [--format mp3|wav|mid] [--midi] [--out <path>] [--seed <n>] [--cwd <path>]',
  '',
  "Plays the repository's structure as music and writes it to",
  '.tsyn/song/<name>.<genre>.<format>. It makes no network request.',
  '',
  '  --genre <name>   how to play it (default: the one the code suggests)',
  ...GENRE_NAMES.map(
    (g) => `                     ${g.padEnd(9)} ${GENRES[g].label}`,
  ),
  '  --format <type>  mp3 (default), wav, or mid for MIDI',
  '  --midi           also write the MIDI beside the MP3 or WAV',
  '  --out <path>     write here instead; its extension sets the format',
  '  --seed <n>       another take on the same code (default 0)',
  '  --cwd <path>     run against another directory',
].join('\n')

/** The format `--out`'s extension names, if it names one. */
function formatOf(out: string | undefined): Format | undefined {
  const ext = out === undefined ? '' : extname(out).slice(1).toLowerCase()
  if (ext === 'midi') return 'mid'
  return isFormat(ext) ? ext : undefined
}

/** Reads `argv`, or says what is wrong with it. */
export function parseSong(
  argv: readonly string[],
  cwd: string = process.cwd(),
): { readonly options: SongOptions } | { readonly error: string } {
  let values
  try {
    ;({ values } = parseArgs({
      args: [...argv],
      options: {
        genre: { type: 'string' },
        format: { type: 'string' },
        out: { type: 'string' },
        seed: { type: 'string' },
        midi: { type: 'boolean' },
        cwd: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }))
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  if (values.help === true) return { error: '' }

  const genre = values.genre ?? 'auto'
  if (genre !== 'auto' && !(GENRE_NAMES as readonly string[]).includes(genre)) {
    return {
      error: `unknown genre ${genre}; one of auto, ${GENRE_NAMES.join(', ')}`,
    }
  }
  const format = values.format ?? formatOf(values.out) ?? 'mp3'
  if (!isFormat(format)) {
    return { error: `unknown format ${format}; one of ${FORMATS.join(', ')}` }
  }
  const seed =
    values.seed === undefined ? DEFAULT_OPTIONS.seed : Number(values.seed)
  if (!Number.isInteger(seed)) {
    return { error: `--seed must be a whole number, not ${values.seed}` }
  }
  return {
    options: {
      cwd: values.cwd ?? cwd,
      genre: genre as GenreName | 'auto',
      format,
      out: values.out ?? null,
      seed,
      midi: values.midi === true,
    },
  }
}

/** `m:ss`, for the line that says how long the song is. */
const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

/**
 * Composes the repository at `options.cwd`, writes the song, and returns the
 * paths written: the song first, then its MIDI when `--midi` asked for one.
 */
export function writeSong(options: SongOptions, io: SongIo): readonly string[] {
  const { root, name, db } = indexRepository(options.cwd)
  const atlas = snapshot(db, { name, fallow: false })
  const composition = compose(regions(readStructure(atlas)), {
    ...DEFAULT_OPTIONS,
    genre: options.genre,
    seed: options.seed,
  })
  const tracks = realise(composition)
  const beats = composition.sections.reduce((sum, s) => sum + s.length, 0)
  io.log(
    `${name}: ${GENRES[composition.genre].label}` +
      `${options.genre === 'auto' ? ' (suggested by the code)' : ''}, ` +
      `${composition.tempo} bpm, ${clock((beats * 60) / composition.tempo)}`,
  )

  // Relative to where the user typed it, as `docs draft --out` is; the
  // default sits beside the index, where `art` writes its page.
  const path =
    options.out === null
      ? join(
          root,
          '.tsyn',
          'song',
          `${name}.${composition.genre}.${options.format}`,
        )
      : resolve(process.cwd(), options.out)
  mkdirSync(dirname(path), { recursive: true })

  if (options.format === 'mid') {
    writeFileSync(path, toMidi(composition, tracks))
    return [path]
  }
  io.log('rendering audio…')
  const audio = renderAudio(composition, tracks)
  writeFileSync(path, options.format === 'mp3' ? toMp3(audio) : toWav(audio))
  if (!options.midi) return [path]

  // Same composition, so the MIDI is the very take the audio plays.
  const midiPath = `${path.slice(0, path.length - extname(path).length)}.mid`
  writeFileSync(midiPath, toMidi(composition, tracks))
  return [path, midiPath]
}

/**
 * Runs `tsyn song` and returns its exit code: 0 written, 2 could not be.
 * Progress goes to stderr and each file's path to stdout, one a line, so a
 * script can play what it made.
 */
export function song(argv: readonly string[], io: SongIo = DEFAULT_IO): number {
  const parsed = parseSong(argv)
  if ('error' in parsed) {
    // An empty error is `--help`: asked for, so it is the answer and not a failure.
    if (parsed.error === '') {
      process.stdout.write(`${SONG_USAGE}\n`)
      return 0
    }
    io.log(`${parsed.error}\n\n${SONG_USAGE}`)
    return 2
  }
  try {
    for (const path of writeSong(parsed.options, io)) {
      process.stdout.write(`${path}\n`)
    }
    return 0
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))
    return 2
  }
}

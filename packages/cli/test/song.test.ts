/**
 * `tsyn song`, end to end over the core fixture: the command line, then a
 * MIDI and an MP3 written where they belong.
 */

import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { parseSong, song, writeSong, type SongIo } from '../src/song.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'core', 'test', 'fixtures', 'basic')
let root: string
const io: SongIo & { lines: string[] } = {
  lines: [],
  log(line) {
    this.lines.push(line)
  },
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'tsyn-song-')))
  cpSync(fixture, root, { recursive: true })
  cpSync(join(here, 'package.fixture.json'), join(root, 'package.json'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const defaults = {
  cwd: '/r',
  genre: 'auto',
  format: 'mp3',
  out: null,
  seed: 0,
  midi: false,
} as const

describe('parseSong', () => {
  it('defaults to an MP3 in the genre the code suggests', () => {
    expect(parseSong([], '/r')).toEqual({ options: defaults })
  })

  it('reads every flag', () => {
    expect(
      parseSong([
        '--genre',
        'jazz',
        '--format',
        'wav',
        '--seed',
        '3',
        '--midi',
        '--cwd',
        '/x',
      ]),
    ).toEqual({
      options: {
        ...defaults,
        cwd: '/x',
        genre: 'jazz',
        format: 'wav',
        seed: 3,
        midi: true,
      },
    })
  })

  it.each([
    ['song.wav', 'wav'],
    ['song.MID', 'mid'],
    ['song.midi', 'mid'],
    ['song.mp3', 'mp3'],
    ['song', 'mp3'],
  ])('takes the format from --out %s', (out, format) => {
    expect(parseSong(['--out', out], '/r')).toEqual({
      options: { ...defaults, out, format },
    })
  })

  it('lets --format win over the extension', () => {
    expect(parseSong(['--out', 'a.wav', '--format', 'mp3'], '/r')).toEqual({
      options: { ...defaults, out: 'a.wav', format: 'mp3' },
    })
  })

  it('refuses an unknown genre, naming the ones there are', () => {
    const parsed = parseSong(['--genre', 'polka'])
    expect(parsed).toHaveProperty('error')
    expect('error' in parsed && parsed.error).toContain('jazz')
  })

  it.each([
    ['--format', 'ogg'],
    ['--seed', '1.5'],
    ['--json', ''],
  ])('refuses %s %s', (flag, value) => {
    expect(parseSong(value === '' ? [flag] : [flag, value])).toHaveProperty(
      'error',
    )
  })

  it('answers --help with an empty error, which is not a failure', () => {
    expect(parseSong(['--help'])).toEqual({ error: '' })
  })
})

describe('writeSong', () => {
  it('writes MIDI beside the index, named for the genre', () => {
    const [path = ''] = writeSong(
      { ...defaults, cwd: root, genre: 'techno', format: 'mid' },
      io,
    )
    expect(path).toBe(
      join(root, '.tsyn', 'song', `${basename(root)}.techno.mid`),
    )
    expect(String.fromCharCode(...readFileSync(path).subarray(0, 4))).toBe(
      'MThd',
    )
  })

  it('names the suggested genre in the file when none is asked for', () => {
    const [path = ''] = writeSong({ ...defaults, cwd: root, format: 'mid' }, io)
    expect(basename(path)).toMatch(/\.(ambient|lofi|techno|dnb|jazz)\.mid$/)
    expect(io.lines.join('\n')).toContain('(suggested by the code)')
  })

  it('writes a jazz MP3 where --out says, and its MIDI beside it', () => {
    const out = join(root, 'out', 'take.mp3')
    const paths = writeSong(
      { ...defaults, cwd: root, genre: 'jazz', out, midi: true },
      io,
    )
    expect(paths).toEqual([out, join(root, 'out', 'take.mid')])
    const mp3 = readFileSync(out)
    expect(mp3[0]).toBe(0xff)
    expect(mp3.length).toBeGreaterThan(10_000)
    const mid = readFileSync(join(root, 'out', 'take.mid'))
    expect(String.fromCharCode(...mid.subarray(0, 4))).toBe('MThd')
  }, 60_000)
})

describe('song', () => {
  it('answers --help on stdout, as a success', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      expect(song(['--help'], io)).toBe(0)
      expect(String(write.mock.calls[0]?.[0])).toContain('tsyn song')
    } finally {
      write.mockRestore()
    }
  })

  it('cannot answer a bad command line, and prints the usage', () => {
    const lines: string[] = []
    expect(song(['--genre', 'polka'], { log: (l) => lines.push(l) })).toBe(2)
    expect(lines.join('\n')).toContain('tsyn song [--genre <name>]')
  })
})
